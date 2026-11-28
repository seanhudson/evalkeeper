/**
 * The runner: creates, runs, rescores, and compares tests, and builds each
 * suite's model board. Server-only.
 *
 * @module evalkeeper/runner
 */
import { createHash } from "node:crypto";
import { money, perAnswer } from "./format.js";
import { compareRuns, disagreements, type RunOutput } from "./compare.js";
import { isStuck, shouldContinue } from "./legs.js";
import {
  effortFor,
  isBaseline,
  type ModelCatalog,
  type ReasoningEffort,
} from "./models.js";
import type { BoardRow } from "./board.js";
import { allPassed } from "./stats.js";
import { pickQuickSet } from "./quickSet.js";
import {
  EASY_FLOOR_CASES,
  EASY_MIN_MODELS,
  answerKeyHealth,
  withRounds,
  type CaseResult,
} from "./prune.js";
import { stableJson } from "./stableJson.js";
import { suiteMetrics, type ScoredOutput } from "./stats.js";
import type {
  CaseRecord,
  EvalSet,
  EvalStore,
  RunMetrics,
  RunRecord,
  OutputRecord,
} from "./store.js";
import { withTimeout } from "./timeout.js";
import {
  casesInInstructions,
  type CaseInInstructions,
} from "./inInstructions.js";
import {
  draftFromActivity as draftCases,
  type ActivityDraftResult,
} from "./activity.js";
import { SCHEDULED } from "./weekly.js";
import { confirmedLabel, isProvisional } from "./labels.js";
export { confirmedLabel, isProvisional };
import {
  injectionSuitesOf,
  usesJudge,
  type AnySuite,
  type CheckResult,
} from "./types.js";
import { injectionCases } from "./suites/injection.js";
import { at } from "./util.js";
import { targetCasesOf } from "./summary.js";
import {
  NO_SUITE_SETTINGS,
  effectiveChecks,
  levelsOf,
  type SuiteSettings,
  type SuiteSettingsStore,
} from "./suiteSettings.js";
import { mustGet } from "./util.js";

/**
 * Runs eval suites: every case in a set, a number of times, on one model,
 * with the operation's current instructions. Outputs are stored, so a
 * grading change rescores them without calling the model again, and an
 * identical request from the last week is reused instead of paid for
 * twice. Server-only (it hashes with node:crypto).
 */

/** An answer that takes longer counts as failed, unless a suite sets its own. */
export const ANSWER_TIMEOUT_MS = 60_000;
/** A test with no new answer for this long was stopped by the server. */
export const STUCK_MS = 6 * 60_000;
/** Identical requests within this many days are reused. */
export const REUSE_DAYS = 7;

/** A provider refusing calls for billing: every later call fails too. */
export { OUT_OF_CREDITS } from "./failures.js";
import { OUT_OF_CREDITS } from "./failures.js";

/**
 * What the runner needs from your app: storage, suites, models, instruction hashes, and,
 * for the board and drift checks, routing.
 */
export type RunnerOptions = {
  store: EvalStore;
  suites: AnySuite[];
  /** Your models, for providers, prices, and retirements. */
  models: ModelCatalog;
  /**
   * The current instructions' hash for an operation (see instructionsHash
   * in `@crowandraven/evalkeeper/ai-sdk`). A test records it, so editing the instructions
   * marks older tests out of date.
   */
  promptVersion: (operation: string) => string | Promise<string>;
  /**
   * Everything the operation's model is told, as text: system text, prompt
   * templates, schema and tool descriptions (`instructionParts` in
   * `@crowandraven/evalkeeper/ai-sdk`, from the parts you hash). Lets
   * `casesInInstructions` warn when a case was copied into them.
   */
  instructionTexts?: (operation: string) => string[] | Promise<string[]>;
  /**
   * The live reasoning setting for an operation; null: the model's own.
   * Defaults to the route's, when `route` is given.
   */
  liveEffort?: (
    operation: string,
  ) => ReasoningEffort | null | Promise<ReasoningEffort | null>;
  /**
   * What one answer costs on a model, from your usage records; null:
   * unknown. Include everything an answer pays for (web searches, tool
   * calls), not only tokens. Estimates also look at what the model's last
   * finished test of the suite actually cost per answer (everything
   * reported through `onCost`) and use whichever is higher.
   */
  estimateCallCost?: (
    operation: string,
    model: string,
  ) => Promise<number | null>;
  /**
   * Asked before each new model answer in a test (reused answers are
   * free): null lets it go ahead; a reason, in words a person can act on,
   * stops the test there, with that reason as its error. Answers already
   * given are kept and reused when the test runs again. Keep it cheap: it
   * runs once per answer, so cache your reading for a few seconds.
   * `spendingBudget(spending)` makes one from your `EvalSpending`.
   */
  budget?: (call: BudgetCall) => string | null | Promise<string | null>;
  /**
   * A test stops once its own new answers cost more than this many times
   * its estimate, and says so: a price set too low, or an answer that pays
   * for more than expected, can't run on unnoticed. Default
   * `CEILING_TIMES` (2); null turns it off. A test with no estimate
   * stops at `noEstimateCeilingUsd` instead.
   */
  ceilingTimes?: number | null;
  /**
   * Called with what the judge charged to grade each answer, in a test
   * and in a rescore (pressing Rescore tests, confirming an answer,
   * saving check levels). Model answers' costs are on their outputs; the
   * judge's are only here and in a test's metrics. Add them to your daily
   * spending count, so the limits include them. Keep it quick; an error
   * in it is ignored.
   */
  onJudgeCost?: (charge: JudgeCharge) => void | Promise<void>;
  /**
   * The most a test with no estimate may spend on new answers, in USD: a
   * model never tested on the suite, with no price from
   * `estimateCallCost`. That first test is when cost is least known, so
   * it doesn't run uncapped. Default `NO_ESTIMATE_CEILING_USD` ($5); null
   * turns it off.
   */
  noEstimateCeilingUsd?: number | null;
  /**
   * How long one request may run, in ms. A test answers what fits, then
   * hands the rest to `continueRun` (a fresh request). Default: no limit.
   */
  requestLimitMs?: number;
  /**
   * Starts a fresh request that calls runEval(runId, opts). True when one
   * took it; false (or absent) lets the test fail as out of time.
   */
  continueRun?: (
    runId: string,
    opts: Required<Omit<RunEvalOptions, "requestStartedAt">>,
  ) => Promise<boolean>;
  /**
   * Which model each operation runs on now, its fallback, and its
   * reasoning setting. Your app owns routing; the board reads it.
   */
  route?: (operation: string) => Route | Promise<Route>;
  /**
   * The models an operation may use: `models` can be live; `fallbackModels`
   * (default: the same) can stand in during an outage.
   */
  candidates?: (operation: string) => {
    models: string[];
    fallbackModels?: string[];
  };
  /**
   * Which retiring models (`ModelInfo.retiring`) the board lists.
   * "always" (the default): every candidate, though a retiring one is never
   * suggested. "inUse": only one a feature still runs on, as its live or
   * fallback model, so nobody spends a test on a model that's going away.
   */
  retiringOnBoard?: "always" | "inUse";
  /**
   * Where settings a person adjusts on a suite's page are kept (its target
   * number of cases). `memoryStore` and `prismaSuiteSettingsStore` are
   * ones. Without it, every suite uses its values in code, and the page
   * offers no Suite settings.
   */
  suiteSettings?: SuiteSettingsStore;
};

/**
 * One answer a test is about to pay for, as `budget` sees it: the test,
 * its suite and feature, the model, and what the test has spent so far.
 */
export type BudgetCall = {
  runId: string;
  suite: string;
  operation: string;
  /** The model being tested (whose answers the judge grades, for "judge"). */
  model: string;
  /**
   * What's about to be paid for: a new model answer in a test, or the
   * judge grading a stored answer in a rescore of a suite whose checks
   * ask it (`usesJudge`).
   */
  kind: "answer" | "judge";
  /**
   * USD spent so far: for "answer", this test's new answers, earlier legs
   * included; for "judge", the judge in this rescore of the test.
   */
  spentUsd: number;
};

/**
 * What the judge charged to grade one answer, as `onJudgeCost` gets it:
 * the test, its suite and feature, the cost, and whether it was during
 * the test or a later rescore.
 */
export type JudgeCharge = {
  runId: string;
  suite: string;
  operation: string;
  /** USD the judge charged for this answer. */
  usd: number;
  during: "test" | "rescore";
};

/**
 * How often a running test reads its own status, so a stop takes effect
 * within an answer or two rather than at the next leg.
 */
export const STOP_CHECK_MS = 2_000;

/** How many times its estimate a test may spend (`ceilingTimes`). */
export const CEILING_TIMES = 2;

/** The most a test with no estimate may spend (`noEstimateCeilingUsd`). */
export const NO_ESTIMATE_CEILING_USD = 5;

/** USD as the pages show it: "$1.20", or cents below a cent ("0.20¢"). */
const usdText = (n: number) => (n >= 0.01 ? money(n) : perAnswer(n));

/** A test stopped by hand: its error, and what to do. */
export const STOPPED_BY_HAND =
  "Stopped by hand. Test again: answers already given are reused at no cost.";

/**
 * Which model a feature runs on now, its fallback, its reasoning setting,
 * its temperature, and its output cap.
 */
export type Route = {
  model: string;
  fallbackModel: string | null;
  reasoningEffort: ReasoningEffort | null;
  /** Null or unset: no temperature sent. */
  temperature?: number | null;
  /** The output-token cap; null or unset: the call's own default. */
  maxOutputTokens?: number | null;
};

/**
 * How to run a test: fresh (no reuse), and, for a test continued in a new request, its leg
 * and the judge's spend so far.
 */
export type RunEvalOptions = {
  /** Never reuse an earlier test's output. */
  fresh?: boolean;
  /** Which leg this is (1 for a new test). */
  leg?: number;
  /** What earlier legs' judge spent. */
  judgeCostUsd?: number;
  /**
   * When the request running this leg started, if earlier than this call
   * (tests queued one after another): the time limit counts from then.
   */
  requestStartedAt?: number;
};

/**
 * How to rescore: how many recent tests beyond the board's, tests already
 * rescored in an earlier request to leave out, and when this request
 * started (the time limit, `requestLimitMs`, counts from then).
 */
export type RescoreOptions = {
  /** The most recent tests to rescore, beyond every test the board shows. Default 10. */
  limit?: number;
  /** Tests an earlier request already rescored, left out. */
  skip?: ReadonlySet<string>;
  /** When the request started (ms); default now. */
  requestStartedAt?: number;
};

/**
 * What a rescore did: the tests it rescored, how many are left for
 * another request (it stops before the time limit), and what the judge
 * spent comparing wording it hadn't seen.
 */
export type RescoreProgress = {
  /** Tests rescored in this request. */
  rescored: string[];
  /** Tests it meant to rescore, this request's and earlier ones' skipped. */
  total: number;
  /** Tests left for another request; 0 when done. */
  left: number;
  /** USD the judge spent in this request; 0 when every comparison was kept. */
  judgeCostUsd: number;
  /**
   * Why it stopped before the rest, in the budget's words: tests are
   * stopped or over a limit, and the suite's checks ask the judge.
   */
  waiting?: string;
};

/**
 * Time a rescore leaves before the request limit: it starts no answer's
 * grading later, as a judge call can take this long.
 */
export const RESCORE_MARGIN_MS = 30_000;

const sha = (text: string, n = 8) =>
  createHash("sha256").update(text).digest("hex").slice(0, n);

/**
 * What makes two requests identical, so the second can reuse the first's
 * answer: the suite, model, reasoning setting, instructions, input, and
 * repeat. One function, so tests and estimates always agree.
 */
export function requestHashFor(r: {
  suite: string;
  model: string;
  effort: string | null;
  prompt: string;
  input: unknown;
  repeat: number;
  /** Left out of the hash when null, so requests without one reuse as before. */
  temperature?: number | null;
  /** Left out of the hash when null, like temperature. */
  maxOutputTokens?: number | null;
}): string {
  return sha(
    stableJson({
      suite: r.suite,
      model: r.model,
      effort: r.effort,
      prompt: r.prompt,
      input: r.input,
      repeat: r.repeat,
      ...(r.temperature != null ? { temperature: r.temperature } : {}),
      ...(r.maxOutputTokens != null
        ? { maxOutputTokens: r.maxOutputTokens }
        : {}),
    }),
    64,
  );
}

/** Changes whenever a case or its answer in use does. */
export function datasetVersion(cases: CaseRecord[]): string {
  return sha(
    cases
      .map((c) => {
        const l = confirmedLabel(c.labels);
        return `${c.id}:${+c.updatedAt}:${l ? `${l.id}:${+l.updatedAt}` : "-"}`;
      })
      .sort()
      .join("|"),
  );
}

/** The error most failed answers share, in a line; null when none failed. */
export function commonError(errors: (string | null)[]): string | null {
  const counts = new Map<string, number>();
  for (const e of errors)
    if (e) {
      const line = (e.split(/\n/)[0] ?? "").slice(0, 160);
      counts.set(line, (counts.get(line) ?? 0) + 1);
    }
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/** Runs fn over items with at most `limit` in flight, preserving order. */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(at(items, i));
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return results;
}

/** Several estimates as one; the cost is unknown if any part's is. */
function totalOf(
  parts: {
    cases: number;
    answers: number;
    reused: number;
    costUsd: number | null;
  }[],
) {
  return parts.reduce<(typeof parts)[number]>(
    (t, p) => ({
      cases: t.cases + p.cases,
      answers: t.answers + p.answers,
      reused: t.reused + p.reused,
      costUsd:
        t.costUsd === null || p.costUsd === null ? null : t.costUsd + p.costUsd,
    }),
    { cases: 0, answers: 0, reused: 0, costUsd: 0 },
  );
}

/**
 * The runner: creates and runs tests, rescores them, compares them, and builds each
 * suite's model board, on your store.
 *
 * @example
 * ```ts
 * const runner = createRunner({
 *   store: prismaStore(prisma),
 *   suites: [ticketTriage],
 *   models: MODELS,
 *   promptVersion: (op) => PROMPT_VERSIONS[op] ?? "unregistered",
 *   route: settings.route,
 *   candidates: () => ({ models: Object.keys(MODELS) }),
 * });
 * const { run } = await runner.createRun({ suite: "ticket_triage", model: "claude-haiku-5-5" });
 * await runner.runEval(run.id);
 * const board = await runner.board("ticket_triage");
 * ```
 */
export function createRunner(opts: RunnerOptions) {
  const { store } = opts;
  const byKey = new Map(opts.suites.map((s) => [s.key, s]));
  const suiteOrThrow = (key: string): AnySuite => {
    const s = byKey.get(key);
    if (!s) throw new Error(`Unknown suite ${key}`);
    return s;
  };
  const providerName = (model: string) =>
    opts.models[model]?.provider ?? "the provider";
  /**
   * A board row's key: the model and the reasoning setting it really gets
   * (models without reasoning settings ignore it, so their rows don't
   * split by it). The board and rescoring both use it.
   */
  const boardKey = (model: string, effort: string | null) =>
    `${model}|${effortFor(opts.models, model, effort) ?? ""}`;

  /**
   * The cases a test uses: in use means a confirmed (or provisional) answer
   * and not retired. DEV or TEST by split; SMOKE is a quick set picked to
   * cover the most tags.
   */
  async function casesFor(suite: string, set: EvalSet): Promise<CaseRecord[]> {
    const active = (await store.listCases(suite)).filter((c) =>
      confirmedLabel(c.labels),
    );
    if (set === "ALL") return active;
    if (set !== "SMOKE") return active.filter((c) => c.split === set);
    return pickQuickSet(active.map((c) => ({ ...c, confirmed: true })));
  }

  /** The operation's live reasoning setting: liveEffort's, else the route's. */
  async function liveEffortFor(
    operation: string,
  ): Promise<ReasoningEffort | null> {
    if (opts.liveEffort) return opts.liveEffort(operation);
    if (opts.route) return (await opts.route(operation)).reasoningEffort;
    return null;
  }

  /** The operation's live temperature: the route's, else none. */
  async function liveTemperatureFor(operation: string): Promise<number | null> {
    if (!opts.route) return null;
    return (await opts.route(operation)).temperature ?? null;
  }

  /** The operation's live output cap: the route's, else the call's own. */
  async function liveCapFor(operation: string): Promise<number | null> {
    if (!opts.route) return null;
    return (await opts.route(operation)).maxOutputTokens ?? null;
  }

  /** What a model's last finished test of a suite cost per answer; null: none. */
  async function lastCostPerAnswer(
    suiteKey: string,
    model: string,
  ): Promise<number | null> {
    const runs = await store.listRuns(suiteKey, {
      status: "SUCCEEDED",
      limit: 50,
    });
    for (const r of runs) {
      const c = r.metrics?.costPerAnswer;
      if (r.model === model && typeof c === "number") return c;
    }
    return null;
  }

  /**
   * What one new answer costs, for estimates: your `estimateCallCost`, or
   * what the model's last test of the suite actually cost per answer
   * (searches and tool calls included), whichever is higher.
   */
  async function perAnswerCost(
    suite: AnySuite,
    model: string,
  ): Promise<number | null> {
    const [given, actual] = await Promise.all([
      opts.estimateCallCost?.(suite.operation, model) ?? null,
      lastCostPerAnswer(suite.key, model),
    ]);
    if (given === null) return actual;
    return actual === null ? given : Math.max(given, actual);
  }

  /**
   * What a test would cost. Answers an identical request gave in the last
   * 7 days are reused for free, so only the rest are priced: a retest
   * after rescoring, or after a test that ran out of time, often costs
   * little or nothing. `costUsd` is null when the model has no price.
   */
  async function estimateRun(
    suiteKey: string,
    model: string,
    set: EvalSet,
    repeats: number,
    o: {
      /** Never reuse: every answer is a new call. */
      fresh?: boolean;
      /** The setting to test; undefined: the operation's live one. */
      reasoningEffort?: ReasoningEffort | null;
      /** The temperature to test; undefined: the operation's live one. */
      temperature?: number | null;
      /** The output cap to test; undefined: the operation's live one. */
      maxOutputTokens?: number | null;
    } = {},
  ): Promise<{
    cases: number;
    /** Answers the test will need: cases times repeats. */
    answers: number;
    /** Of those, answers an identical earlier request will give for free. */
    reused: number;
    costUsd: number | null;
  }> {
    const suite = suiteOrThrow(suiteKey);
    const [cases, perCall, prompt, effort, temperature, cap] =
      await Promise.all([
        casesFor(suite.key, set),
        perAnswerCost(suite, model),
        opts.promptVersion(suite.operation),
        o.reasoningEffort !== undefined
          ? o.reasoningEffort
          : liveEffortFor(suite.operation),
        o.temperature !== undefined
          ? o.temperature
          : liveTemperatureFor(suite.operation),
        o.maxOutputTokens !== undefined
          ? o.maxOutputTokens
          : liveCapFor(suite.operation),
      ]);
    const answers = cases.length * repeats;
    const since = new Date(Date.now() - REUSE_DAYS * 86_400_000);
    const hashes = o.fresh
      ? []
      : cases.flatMap((c) =>
          Array.from({ length: repeats }, (_, i) =>
            requestHashFor({
              suite: suite.key,
              model,
              effort,
              prompt,
              input: c.input,
              repeat: i + 1,
              temperature,
              maxOutputTokens: cap,
            }),
          ),
        );
    // One query where the store can: a lookup per answer is slow on a
    // remote database.
    const found = store.findReusableHashes
      ? await store.findReusableHashes(hashes, since)
      : new Set(
          (
            await Promise.all(
              hashes.map(async (h) =>
                (await store.findReusableOutput(h, since)) ? h : null,
              ),
            )
          ).filter((h): h is string => h !== null),
        );
    const reused = hashes.filter((h) => found.has(h)).length;
    return {
      cases: cases.length,
      answers,
      reused,
      costUsd: perCall === null ? null : perCall * (answers - reused),
    };
  }

  /** Records a test to start; runEval does the work. */
  async function createRun(args: {
    suite: string;
    model: string;
    set?: EvalSet;
    repeats?: number;
    /** Who started it; null for a scheduled check. */
    startedBy?: string | null;
    /** A reasoning setting to test; undefined: the operation's own. */
    reasoningEffort?: ReasoningEffort | null;
    /** A temperature to test; undefined: the operation's live one. */
    temperature?: number | null;
    /** An output cap to test; undefined: the operation's live one. */
    maxOutputTokens?: number | null;
    /** For the estimate: pass the same `fresh` to runEval. */
    fresh?: boolean;
  }) {
    const suite = suiteOrThrow(args.suite);
    const set = args.set ?? "ALL";
    const repeats = args.repeats ?? 1;
    const reasoningEffort =
      args.reasoningEffort !== undefined
        ? args.reasoningEffort
        : await liveEffortFor(suite.operation);
    const temperature =
      args.temperature !== undefined
        ? args.temperature
        : await liveTemperatureFor(suite.operation);
    const maxOutputTokens =
      args.maxOutputTokens !== undefined
        ? args.maxOutputTokens
        : await liveCapFor(suite.operation);
    const [estimate, promptVersion] = await Promise.all([
      estimateRun(suite.key, args.model, set, repeats, {
        reasoningEffort,
        temperature,
        maxOutputTokens,
        fresh: Boolean(args.fresh),
      }),
      opts.promptVersion(suite.operation),
    ]);
    const liveEffort = reasoningEffort;
    const run = await store.createRun({
      suite: suite.key,
      model: args.model,
      promptVersion,
      reasoningEffort:
        args.reasoningEffort !== undefined ? args.reasoningEffort : liveEffort,
      temperature,
      maxOutputTokens,
      set,
      repeats,
      datasetVersion: null,
      graderVersion: suite.graderVersion,
      estimatedCostUsd: estimate.costUsd,
      startedBy: args.startedBy ?? null,
    });
    return { run, estimate };
  }

  /** Grades one stored output against the case's answer in use. */
  async function gradeOutput(
    suite: AnySuite,
    c: CaseRecord,
    output: unknown,
    onCost?: (usd: number) => void,
    /** The test it belongs to, so `onJudgeCost` hears what the judge charged. */
    charge?: { runId: string; during: JudgeCharge["during"] },
  ): Promise<CheckResult[]> {
    const input = suite.input.parse(c.input);
    const label = confirmedLabel(c.labels);
    const parsed = label ? suite.labelValue.safeParse(label.value) : null;
    let usd = 0;
    const scores = await suite.grade(
      input,
      output,
      parsed?.success ? parsed.data : null,
      onCost
        ? {
            onCost: (n: number) => {
              usd += n;
              onCost(n);
            },
          }
        : undefined,
    );
    if (usd > 0 && charge && opts.onJudgeCost)
      await Promise.resolve(
        opts.onJudgeCost({
          ...charge,
          suite: suite.key,
          operation: suite.operation,
          usd,
        }),
      ).catch(() => undefined);
    return scores;
  }

  /**
   * Adds the checks that compare a test's answers with each other (a
   * suite's gradeTogether), per repeat. Replaces earlier ones.
   */
  async function gradeTogether(run: RunRecord, suite: AnySuite) {
    if (!suite.gradeTogether) return;
    const cases = new Map(
      (await store.listCases(suite.key)).map((c) => [c.id, c]),
    );
    const outputs = (await store.listOutputs(run.id)).filter(
      (o) => !o.error && cases.has(o.caseId),
    );
    const byRepeat = new Map<number, typeof outputs>();
    for (const o of outputs)
      byRepeat.set(o.repeat, [...(byRepeat.get(o.repeat) ?? []), o]);
    for (const group of byRepeat.values()) {
      const answers = group.map((o) => {
        const c = mustGet(cases, o.caseId);
        const label = confirmedLabel(c.labels);
        const parsed = label ? suite.labelValue.safeParse(label.value) : null;
        return {
          input: suite.input.parse(c.input),
          output: o.output,
          label: parsed?.success ? parsed.data : null,
        };
      });
      // Marked, so the case is known to matter to others (never easy).
      const extra = suite
        .gradeTogether(answers)
        .map((cs) => cs.map((c) => ({ ...c, together: true })));
      await mapLimit(
        group.map((o, i) => ({ o, add: extra[i] ?? [] })),
        6,
        async ({ o, add }) => {
          const keys = new Set(add.map((c) => c.key));
          const kept = (o.scores ?? []).filter((c) => !keys.has(c.key));
          await store.setOutputScores(o.id, [...kept, ...add]);
        },
      );
    }
  }

  async function metricsFor(
    run: RunRecord,
    suite: AnySuite,
    judgeCostUsd: number,
    /** Only these cases' answers count; all when absent. */
    caseIds?: ReadonlySet<string>,
  ): Promise<RunMetrics> {
    const levels = levelsOf(suite.checks);
    // Each result keeps the level it was graded at, so a nice-to-have miss
    // never fails an answer wherever the answer is read.
    const outputs = await Promise.all(
      (await store.listOutputs(run.id))
        .filter((o) => !caseIds || caseIds.has(o.caseId))
        .map(async (o) => {
          if (!o.scores) return o;
          const stamped = o.scores.map((c) => {
            const level = levels[c.key];
            return level ? { ...c, level } : c;
          });
          if (stamped.some((c, i) => c.level !== o.scores?.[i]?.level))
            await store.setOutputScores(o.id, stamped);
          return { ...o, scores: stamped };
        }),
    );
    const scored: ScoredOutput[] = outputs.map((o) => ({
      caseId: o.caseId,
      repeat: o.repeat,
      checks: o.error ? null : (o.scores ?? []),
      costUsd: o.costUsd,
      ms: o.ms,
      reused: o.reused,
    }));
    return {
      ...suiteMetrics(
        scored,
        suite.checks.map((c) => c.key),
      ),
      judgeCostUsd,
      failureReason: commonError(outputs.map((o) => o.error)),
      levels,
    };
  }

  /**
   * Calls the operation for every case and repeat, then grades. With
   * `fresh`, never reuses an earlier test's output. A leg after the first
   * skips what this test already answered. Never throws.
   */
  async function runEval(runId: string, o: RunEvalOptions = {}) {
    const run = await store.getRun(runId);
    // Stopped meanwhile (marked stuck, or a duplicate hand-off).
    if (!run || run.status !== "RUNNING") return;
    const leg = o.leg ?? 1;
    try {
      const suite = await effectiveSuite(run.suite);
      const cases = await casesFor(suite.key, run.set);
      const since = new Date(Date.now() - REUSE_DAYS * 86_400_000);
      const jobs = cases.flatMap((c) =>
        Array.from({ length: run.repeats }, (_, i) => ({ c, repeat: i + 1 })),
      );
      const given = await store.listOutputs(runId);
      const answered = new Set(given.map((x) => `${x.caseId}:${x.repeat}`));
      const todo = jobs.filter((j) => !answered.has(`${j.c.id}:${j.repeat}`));
      // What this test's new answers have cost, earlier legs included.
      let spent = given.reduce((t, x) => t + (x.reused ? 0 : x.costUsd), 0);
      // The ceiling: a multiple of what every answer this test needs would
      // cost new, or with no estimate, a fixed amount. Null: turned off.
      const times =
        opts.ceilingTimes === undefined ? CEILING_TIMES : opts.ceilingTimes;
      const flat =
        opts.noEstimateCeilingUsd === undefined
          ? NO_ESTIMATE_CEILING_USD
          : opts.noEstimateCeilingUsd;
      const perAnswer =
        times || flat ? await perAnswerCost(suite, run.model) : null;
      const estimateUsd = perAnswer ? perAnswer * jobs.length : null;
      const ceiling =
        estimateUsd === null
          ? flat || null
          : times
            ? times * estimateUsd
            : null;
      const timesText = times === 2 ? "twice" : String(times) + " times";
      // Set inside the answers below, which TypeScript can't follow.
      let halted = null as string | null;
      let stopped = false as boolean;
      let checkedAt = Date.now();
      /** Whether the test was stopped meanwhile (by hand, or as stuck). */
      async function stoppedMeanwhile(): Promise<boolean> {
        if (stopped) return true;
        if (Date.now() - checkedAt < STOP_CHECK_MS) return false;
        checkedAt = Date.now();
        stopped = (await store.getRun(runId))?.status !== "RUNNING";
        return stopped;
      }

      let judgeCost = o.judgeCostUsd ?? 0;
      const onJudge = (usd: number) => (judgeCost += usd);
      // Set inside the answers below, which TypeScript can't follow.
      let outOfCredits = null as string | null;
      const timeout = suite.answerTimeoutMs ?? ANSWER_TIMEOUT_MS;
      const deadline = opts.requestLimitMs
        ? (o.requestStartedAt ?? Date.now()) + opts.requestLimitMs - timeout
        : Infinity;
      const late = Date.now() > deadline;
      let skipped = 0;

      await mapLimit(todo, suite.concurrency ?? 6, async ({ c, repeat }) => {
        if (
          Date.now() > deadline ||
          outOfCredits ||
          halted ||
          (await stoppedMeanwhile())
        ) {
          skipped++;
          return;
        }
        const requestHash = requestHashFor({
          suite: suite.key,
          model: run.model,
          effort: run.reasoningEffort,
          prompt: run.promptVersion,
          input: c.input,
          repeat,
          temperature: run.temperature ?? null,
          maxOutputTokens: run.maxOutputTokens ?? null,
        });
        const earlier = o.fresh
          ? null
          : await store.findReusableOutput(requestHash, since);
        if (earlier) {
          await store.createOutput({
            runId,
            caseId: c.id,
            repeat,
            requestHash,
            output: earlier.output,
            error: null,
            scores: await gradeOutput(suite, c, earlier.output, onJudge, {
              runId,
              during: "test",
            }),
            // What the call cost and took when it was made, so per-answer
            // numbers stay real; the run's spend leaves reused ones out.
            costUsd: earlier.costUsd,
            ms: earlier.ms,
            reused: true,
          });
          return;
        }
        // A new answer costs money: the app's budget may refuse it. If the
        // budget can't be read, the answer goes ahead, as a blip shouldn't
        // fail every test.
        const overCeiling =
          ceiling === null || spent <= ceiling
            ? null
            : estimateUsd === null
              ? "This test has spent " +
                usdText(spent) +
                ", more than " +
                usdText(ceiling) +
                ", the most a test with no cost estimate may spend."
              : "This test has spent " +
                usdText(spent) +
                ", more than " +
                timesText +
                " its estimate (" +
                usdText(estimateUsd) +
                "). Check the model's price, and what an answer pays for.";
        const refused =
          overCeiling ??
          (opts.budget
            ? await Promise.resolve(
                opts.budget({
                  runId,
                  suite: suite.key,
                  operation: suite.operation,
                  model: run.model,
                  kind: "answer",
                  spentUsd: spent,
                }),
              ).catch(() => null)
            : null);
        if (refused) {
          halted = refused;
          skipped++;
          return;
        }
        const started = Date.now();
        let cost = 0;
        try {
          const output = await withTimeout(
            suite.run(suite.input.parse(c.input), {
              model: run.model,
              reasoningEffort: run.reasoningEffort ?? null,
              temperature: run.temperature ?? null,
              maxOutputTokens: run.maxOutputTokens ?? null,
              onCost: (usd) => (cost += usd),
            }),
            timeout,
          );
          await store.createOutput({
            runId,
            caseId: c.id,
            repeat,
            requestHash,
            output,
            error: null,
            scores: await gradeOutput(suite, c, output, onJudge, {
              runId,
              during: "test",
            }),
            costUsd: cost,
            ms: Date.now() - started,
            reused: false,
          });
          spent += cost;
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          if (OUT_OF_CREDITS.test(message)) outOfCredits = message;
          await store.createOutput({
            runId,
            caseId: c.id,
            repeat,
            requestHash,
            output: null,
            error: message.slice(0, 1000),
            scores: null,
            costUsd: cost,
            ms: Date.now() - started,
            reused: false,
          });
          spent += cost;
        }
      });

      // Stopped meanwhile: whoever stopped it has marked it already.
      if (stopped) return;
      if (halted) {
        await store.updateRun(
          runId,
          {
            status: "FAILED",
            finishedAt: new Date(),
            error: `Stopped after ${jobs.length - skipped} of ${jobs.length} answers. ${halted}${/reused/i.test(halted) ? "" : " Answers already given are reused at no cost when you test again."}`,
          },
          { status: "RUNNING" },
        );
        return;
      }
      if (skipped) {
        const next = {
          fresh: !!o.fresh,
          leg: leg + 1,
          judgeCostUsd: judgeCost,
        };
        if (
          shouldContinue({
            left: skipped,
            done: todo.length - skipped,
            leg,
            outOfCredits: !!outOfCredits,
            late,
          }) &&
          opts.continueRun &&
          (await opts.continueRun(runId, next).catch(() => false))
        )
          return;
        await store.updateRun(
          runId,
          {
            status: "FAILED",
            finishedAt: new Date(),
            error: outOfCredits
              ? `The ${providerName(run.model)} account is out of credits, so the test stopped after ${jobs.length - skipped} of ${jobs.length} answers. Add credits, then test again: answers already given are reused at no cost.`
              : `Ran out of time after ${jobs.length - skipped} of ${jobs.length} answers. Test again to finish: answers already given are reused at no cost.`,
          },
          // A stop that came meanwhile stays.
          { status: "RUNNING" },
        );
        return;
      }

      await gradeTogether(run, suite);
      await store.updateRun(
        runId,
        {
          status: "SUCCEEDED",
          finishedAt: new Date(),
          datasetVersion: datasetVersion(cases),
          metrics: await metricsFor(run, suite, judgeCost),
        },
        // A stop that came during the last answers stays.
        { status: "RUNNING" },
      );
    } catch (e) {
      await store.updateRun(runId, {
        status: "FAILED",
        finishedAt: new Date(),
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  /**
   * Regrades a test's stored outputs with today's checks and answers. No
   * new model answers; a suite's judged checks (`CheckDef.judged`) may ask
   * the judge about wording it hasn't seen. It brings a test up to today's
   * answers, but never up to inputs that changed after it ran. Past
   * `deadline` (ms) it grades no more answers and leaves the test as it
   * was (`done: false`); the answers it graded keep their new scores.
   */
  async function rescoreRun(
    runId: string,
    deadline = Infinity,
  ): Promise<{ done: boolean; judgeCostUsd: number; waiting?: string }> {
    const run = await store.getRun(runId);
    if (!run) return { done: true, judgeCostUsd: 0 };
    const suite = await effectiveSuite(run.suite);
    const cases = new Map(
      (await store.listCases(suite.key)).map((c) => [c.id, c]),
    );
    const outputs = (await store.listOutputs(runId)).filter(
      (x) => !x.error && cases.has(x.caseId),
    );
    let judgeCost = 0;
    // Set inside the grading below, which TypeScript can't follow.
    let late = false as boolean;
    let waiting = null as string | null;
    const onJudge = (usd: number) => (judgeCost += usd);
    // Grading may ask the judge, which costs money: the app's budget may
    // refuse it, as it may a new answer. A free regrade never asks.
    const askBudget = usesJudge(suite) ? opts.budget : undefined;
    await mapLimit(outputs, 6, async (x) => {
      if (late || waiting !== null || Date.now() > deadline) {
        late = true;
        return;
      }
      if (askBudget) {
        const refused = await Promise.resolve(
          askBudget({
            runId,
            suite: suite.key,
            operation: suite.operation,
            model: run.model,
            kind: "judge",
            spentUsd: judgeCost,
          }),
        ).catch(() => null);
        if (refused) {
          waiting ??= refused;
          late = true;
          return;
        }
      }
      await store.setOutputScores(
        x.id,
        await gradeOutput(suite, mustGet(cases, x.caseId), x.output, onJudge, {
          runId,
          during: "rescore",
        }),
      );
    });
    if (waiting !== null)
      return { done: false, judgeCostUsd: judgeCost, waiting };
    if (late) return { done: false, judgeCostUsd: judgeCost };
    await gradeTogether(run, suite);
    const used = [...new Set(outputs.map((x) => x.caseId))].map((id) =>
      mustGet(cases, id),
    );
    const madeOnOldInputs = outputs.some(
      (x) => x.createdAt < mustGet(cases, x.caseId).updatedAt,
    );
    await store.updateRun(runId, {
      graderVersion: suite.graderVersion,
      ...(madeOnOldInputs ? {} : { datasetVersion: datasetVersion(used) }),
      // A retired case's answers leave the score, as they left the
      // dataset version.
      metrics: await metricsFor(
        run,
        suite,
        (run.metrics?.judgeCostUsd ?? 0) + judgeCost,
        new Set(cases.keys()),
      ),
    });
    return { done: true, judgeCostUsd: judgeCost };
  }

  /**
   * The tests a rescore covers, most important first: every test the
   * board shows (each model and reasoning setting's latest test on every
   * case), the latest of every model and setting on any set, then the
   * `limit` most recent. Any answer change puts every test out of date
   * until it's regraded, and a test left out of date drops out of the
   * board, its scores, and the answer key's health ("models split").
   */
  async function testsToRescore(
    suiteKey: string,
    limit: number,
  ): Promise<string[]> {
    const runs = await store.listRuns(suiteKey, { status: "SUCCEEDED" });
    const shown = new Map<string, string>();
    const latest = new Map<string, string>();
    for (const r of runs) {
      // The board's rows: tests on every case, by model and the reasoning
      // setting the model really gets (see board).
      if (r.set === "ALL" && !shown.has(boardKey(r.model, r.reasoningEffort)))
        shown.set(boardKey(r.model, r.reasoningEffort), r.id);
      const key = [
        r.model,
        r.reasoningEffort ?? "",
        r.temperature ?? "",
        r.maxOutputTokens ?? "",
        r.set,
      ].join("|");
      if (!latest.has(key)) latest.set(key, r.id);
    }
    return [
      ...new Set([
        ...shown.values(),
        ...latest.values(),
        ...runs.slice(0, limit).map((r) => r.id),
      ]),
    ];
  }

  /**
   * Confirms an answer someone reviewed. A provisional answer already in
   * use keeps its value, so no grade can change: the tests that were up to
   * date are marked up to date again, with nothing regraded, and it
   * returns at once. Any other answer (pending, or not the one in use)
   * changes what's graded against, so recent tests are rescored.
   *
   * @param suiteKey - The suite.
   * @param labelId - The answer to confirm.
   * @returns Whether it rescored.
   */
  async function confirmAnswer(
    suiteKey: string,
    labelId: string,
  ): Promise<{ rescored: boolean }> {
    const suite = suiteOrThrow(suiteKey);
    const before = await store.listCases(suite.key);
    const inUse = before
      .map((c) => confirmedLabel(c.labels))
      .find((l) => l?.id === labelId);
    if (inUse?.status !== "PROVISIONAL") {
      await store.setLabelStatus(labelId, "CONFIRMED");
      await rescoreRecent(suite.key);
      return { rescored: true };
    }
    const runs = (await store.listRuns(suite.key)).filter(
      (r) => r.status === "SUCCEEDED" && r.datasetVersion,
    );
    const sets = [...new Set(runs.map((r) => r.set))];
    const versions = async () =>
      new Map(
        await Promise.all(
          sets.map(
            async (s) =>
              [s, datasetVersion(await casesFor(suite.key, s))] as const,
          ),
        ),
      );
    const old = await versions();
    await store.setLabelStatus(labelId, "CONFIRMED");
    const now = await versions();
    for (const r of runs) {
      const was = old.get(r.set);
      const is = now.get(r.set);
      if (was && is && was !== is && r.datasetVersion === was)
        await store.updateRun(r.id, { datasetVersion: is });
    }
    return { rescored: false };
  }

  /**
   * Regrades a suite's finished tests after answers or checks change:
   * every test the board shows, the latest of every model and setting,
   * and the `limit` most recent (`testsToRescore`). With `requestLimitMs`,
   * it stops before the limit and says how many are left; call it again
   * with the ones it did as `skip` to finish.
   *
   * @param suiteKey - The suite.
   * @param o - How many recent tests, what to skip, and when the request
   *   started; a number is `limit`.
   */
  async function rescoreRecent(
    suiteKey: string,
    o: RescoreOptions | number = {},
  ): Promise<RescoreProgress> {
    const {
      limit = 10,
      skip = new Set<string>(),
      requestStartedAt,
    } = typeof o === "number" ? { limit: o } : o;
    const deadline = opts.requestLimitMs
      ? (requestStartedAt ?? Date.now()) +
        opts.requestLimitMs -
        RESCORE_MARGIN_MS
      : Infinity;
    const ids = await testsToRescore(suiteKey, limit);
    const todo = ids.filter((id) => !skip.has(id));
    const rescored: string[] = [];
    let judgeCostUsd = 0;
    let waiting: string | undefined;
    for (const id of todo) {
      if (Date.now() > deadline) break;
      const r = await rescoreRun(id, deadline);
      judgeCostUsd += r.judgeCostUsd;
      waiting = r.waiting;
      if (!r.done) break;
      rescored.push(id);
    }
    return {
      rescored,
      total: ids.length,
      left: todo.length - rescored.length,
      judgeCostUsd,
      ...(waiting ? { waiting } : {}),
    };
  }

  /**
   * A suite's answer-key health: cases every current model gets right
   * (easy), cases models split on, near-duplicates, old drafts, and how
   * the tags spread, from the board's current tests.
   */
  async function answerKeyHealthOf(suiteKey: string, today = new Date()) {
    const [b, cases, target] = await Promise.all([
      board(suiteKey),
      store.listCases(suiteKey),
      targetCases(suiteKey),
    ]);
    const rounds = await easyRounds(suiteKey, cases, target);
    return answerKeyHealth(
      cases,
      withRounds(b.caseResults, rounds),
      today,
      null,
      target,
    );
  }

  /**
   * A suite's saved settings (its target number of cases), or none saved
   * when there's no `suiteSettings` store or it can't be read: a page
   * still loads, on the suite's values in code.
   */
  async function suiteSettingsOf(suiteKey: string): Promise<SuiteSettings> {
    if (!opts.suiteSettings) return NO_SUITE_SETTINGS;
    try {
      return await opts.suiteSettings.getSuiteSettings(suiteKey);
    } catch {
      return NO_SUITE_SETTINGS;
    }
  }

  /**
   * A suite's target number of cases: saved in its settings, else its
   * `targetCases`, else TARGET_CASES. It sets the floor for retiring easy
   * cases, how many drafts to ask for, and when the page asks for more.
   */
  async function targetCases(suiteKey: string): Promise<number> {
    return targetCasesOf(
      suiteOrThrow(suiteKey),
      await suiteSettingsOf(suiteKey),
    );
  }

  /**
   * A suite with a person's levels and aims (Suite settings) in place of
   * its checks' own: what grading, the board, and the pages use.
   */
  async function effectiveSuite(suiteKey: string): Promise<AnySuite> {
    const suite = suiteOrThrow(suiteKey);
    if (!opts.suiteSettings) return suite;
    const saved = await suiteSettingsOf(suite.key);
    return {
      ...suite,
      checks: effectiveChecks(suite.checks, saved),
      // The person's attack setting, for the suggestion.
      ...(saved.attacks
        ? { priority: { ...suite.priority, attacks: saved.attacks } }
        : {}),
    };
  }

  /**
   * Saves a suite's settings, as a person changed them on its page.
   * Throws without a `suiteSettings` store.
   */
  async function saveSuiteSettings(
    suiteKey: string,
    settings: SuiteSettings,
    by: string | null,
  ): Promise<void> {
    if (!opts.suiteSettings)
      throw new Error(
        "Suite settings need a place to keep them: pass suiteSettings to createRunner.",
      );
    await opts.suiteSettings.saveSuiteSettings(
      suiteOrThrow(suiteKey).key,
      settings,
      by,
    );
  }

  /**
   * Per case, the rounds of testing it passed (EASY_MIN_ROUNDS): days on
   * which at least EASY_MIN_MODELS models were tested on it and every one
   * got it fully right (all repeats), counted only after its answer last
   * changed. Empty when the suite has its floor of cases in use or fewer
   * (its target number of cases, EASY_FLOOR_CASES by default): nothing can
   * be retired then, so the history isn't read.
   */
  async function easyRounds(
    suiteKey: string,
    cases?: readonly CaseRecord[],
    floor: number = EASY_FLOOR_CASES,
  ): Promise<Record<string, number>> {
    const all = cases ?? (await store.listCases(suiteKey));
    const inUse = all.filter(
      (c) => c.status !== "RETIRED" && confirmedLabel(c.labels),
    );
    if (inUse.length <= floor) return {};
    const since = new Map(
      inUse.map((c) => {
        const l = confirmedLabel(c.labels);
        return [c.id, Math.max(+c.updatedAt, l ? +l.updatedAt : 0)];
      }),
    );
    const runs = (await store.listRuns(suiteKey, { status: "SUCCEEDED" })).map(
      (r) => ({ ...r, day: r.startedAt.toISOString().slice(0, 10) }),
    );
    const outputs = await outputsByRun(runs.map((r) => r.id));
    // case → day → model → right on every answer that day
    const seen = new Map<string, Map<string, Map<string, boolean>>>();
    for (const r of runs) {
      for (const o of outputs.get(r.id) ?? []) {
        const after = since.get(o.caseId);
        if (after === undefined || +r.startedAt <= after) continue;
        const days =
          seen.get(o.caseId) ?? new Map<string, Map<string, boolean>>();
        const models = days.get(r.day) ?? new Map<string, boolean>();
        const right = !o.error && allPassed(o.scores ?? []);
        models.set(r.model, (models.get(r.model) ?? true) && right);
        days.set(r.day, models);
        seen.set(o.caseId, days);
      }
    }
    const rounds: Record<string, number> = {};
    for (const [caseId, days] of seen)
      rounds[caseId] = [...days.values()].filter(
        (m) => m.size >= EASY_MIN_MODELS && [...m.values()].every(Boolean),
      ).length;
    return rounds;
  }

  /**
   * Retires a suite's easy cases beyond the floor, then rescores its
   * recent tests (free), so their scores leave the retired cases out.
   * Returns how many it retired.
   */
  async function retireEasy(suiteKey: string): Promise<number> {
    // Regraded first, so every compared case is marked as such (tests
    // graded before the mark existed have none).
    if (suiteOrThrow(suiteKey).gradeTogether) await rescoreRecent(suiteKey);
    const { easyToRetire } = await answerKeyHealthOf(suiteKey);
    for (const c of easyToRetire) await store.setCaseStatus(c.id, "RETIRED");
    if (easyToRetire.length) await rescoreRecent(suiteKey);
    return easyToRetire.length;
  }

  /**
   * Retires a suite's drafts nobody reviewed in STALE_DRAFT_DAYS. Drafts
   * are never graded against, so no test changes. Returns how many.
   */
  async function retireStaleDrafts(
    suiteKey: string,
    today = new Date(),
  ): Promise<number> {
    const cases = await store.listCases(suiteOrThrow(suiteKey).key);
    const { staleDrafts } = answerKeyHealth(cases, {}, today);
    for (const c of staleDrafts) await store.setCaseStatus(c.id, "RETIRED");
    return staleDrafts.length;
  }

  /**
   * Records one suite's weekly drift check without running it: its quick
   * set on its live model, at its live reasoning setting, marked as
   * started by the schedule. Record every suite's first, so a page can show
   * them running, then run each with `runEval(id, { fresh: true })`.
   * Returns the test's id, or null when the suite has no cases in use or
   * its weekly check is already running.
   * Needs `route`.
   */
  async function startDriftCheck(suiteKey: string): Promise<string | null> {
    if (!opts.route) throw new Error("The drift check needs the route option");
    const suite = suiteOrThrow(suiteKey);
    if (!(await casesFor(suite.key, "SMOKE")).length) return null;
    // One check at a time: pressing Run it now twice doesn't start two.
    await stopStuckRuns(suite.key);
    const running = await store.listRuns(suite.key, { status: "RUNNING" });
    if (running.some((r) => r.startedBy === SCHEDULED && r.set === "SMOKE"))
      return null;
    const route = await opts.route(suite.operation);
    const { run } = await createRun({
      suite: suite.key,
      model: route.model,
      set: "SMOKE",
      startedBy: SCHEDULED,
      reasoningEffort: route.reasoningEffort,
      temperature: route.temperature ?? null,
      maxOutputTokens: route.maxOutputTokens ?? null,
    });
    return run.id;
  }

  /**
   * One suite's weekly drift check, start to finish, with fresh answers so
   * a quietly changed model shows. Returns the test's id, or null when the
   * suite has no cases in use.
   */
  async function runDriftCheck(suiteKey: string): Promise<string | null> {
    const id = await startDriftCheck(suiteKey);
    if (id) await runEval(id, { fresh: true });
    return id;
  }

  /**
   * One suite's weekly drafts from your app's activity: asks the suite's
   * `draftFromActivity` for up to `limit` cases a week (default
   * ACTIVITY_DRAFTS_PER_WEEK) and adds new ones as drafts with PENDING
   * answers, skipping anything drafted before. Call it for each suite from
   * the weekly job; suites without the method draft nothing.
   */
  async function draftFromActivity(
    suiteKey: string,
    o: { limit?: number; since?: Date; today?: Date } = {},
  ): Promise<ActivityDraftResult> {
    return draftCases({ store, suite: suiteOrThrow(suiteKey), ...o });
  }

  /**
   * Several tests' outputs by test id: one call where the store can, so a
   * remote database isn't asked once per test.
   */
  async function outputsByRun(
    runIds: string[],
  ): Promise<Map<string, OutputRecord[]>> {
    const byRun = new Map(runIds.map((id) => [id, [] as OutputRecord[]]));
    if (!runIds.length) return byRun;
    const rows = store.listOutputsFor
      ? await store.listOutputsFor(runIds)
      : (await Promise.all(runIds.map((id) => store.listOutputs(id)))).flat();
    for (const o of rows) byRun.get(o.runId)?.push(o);
    return byRun;
  }

  /**
   * Stops running tests now: each is marked failed ("Stopped by hand"),
   * and its leg stops within an answer or two (`STOP_CHECK_MS`). Answers
   * already given are kept and reused when it runs again. Returns how many
   * it stopped. Your `EvalSpending.stopAll` can call it.
   *
   * @param suiteKeys - The suites whose tests to stop; default every suite.
   */
  async function stopTests(
    suiteKeys: readonly string[] = opts.suites.map((s) => s.key),
  ): Promise<number> {
    let n = 0;
    for (const key of suiteKeys)
      for (const r of await store.listRuns(key, { status: "RUNNING" })) {
        await store.updateRun(
          r.id,
          { status: "FAILED", finishedAt: new Date(), error: STOPPED_BY_HAND },
          { status: "RUNNING" },
        );
        n++;
      }
    return n;
  }

  /** Marks tests the server stopped mid-way as failed. */
  async function stopStuckRuns(suiteKey: string, now = Date.now()) {
    const old = (await store.listRuns(suiteKey, { status: "RUNNING" })).filter(
      (r) => now - +r.startedAt > STUCK_MS,
    );
    const outputs = await outputsByRun(old.map((r) => r.id));
    for (const r of old) {
      const outs = outputs.get(r.id) ?? [];
      const last = outs.reduce<Date | null>(
        (m, x) => (!m || x.createdAt > m ? x.createdAt : m),
        null,
      );
      if (isStuck(r.startedAt, last, now, STUCK_MS))
        await store.updateRun(
          r.id,
          {
            status: "FAILED",
            finishedAt: new Date(now),
            error:
              "The test stopped before it finished. Test again: answers already given are reused at no cost.",
          },
          { status: "RUNNING" },
        );
    }
  }

  /**
   * Two finished tests of a suite compared case by case: `a` the one in
   * place, `b` the challenger. Null if either isn't a finished test.
   * `disagreements` lists the cases they graded differently, for reading
   * the two answers side by side.
   */
  async function compare(suiteKey: string, a: string, b: string) {
    const suite = await effectiveSuite(suiteKey);
    const [ra, rb] = await Promise.all([store.getRun(a), store.getRun(b)]);
    if (
      !ra ||
      !rb ||
      a === b ||
      ra.suite !== suite.key ||
      rb.suite !== suite.key ||
      ra.status !== "SUCCEEDED" ||
      rb.status !== "SUCCEEDED"
    )
      return null;
    const asOutputs = async (r: RunRecord): Promise<RunOutput[]> =>
      (await store.listOutputs(r.id)).map((x) => ({
        caseId: x.caseId,
        checks: x.error ? null : (x.scores ?? []),
        costUsd: x.costUsd,
        ms: x.ms,
        reused: x.reused,
      }));
    const [oa, ob] = await Promise.all([asOutputs(ra), asOutputs(rb)]);
    const comparison = compareRuns(
      oa,
      ob,
      suite.checks.map((c) => c.key),
    );
    // Comparable only when measured the same way.
    const caveats = [
      ra.set !== rb.set && `different sets (${ra.set} and ${rb.set})`,
      ra.datasetVersion !== rb.datasetVersion &&
        "cases or answers changed between the tests (rescore both to compare on today's answers)",
      ra.graderVersion !== rb.graderVersion &&
        "graded by different versions of the checks (rescore both)",
      ra.promptVersion !== rb.promptVersion &&
        `different instructions (${ra.promptVersion} and ${rb.promptVersion})`,
    ].filter((x): x is string => Boolean(x));
    return {
      suite,
      a: ra,
      b: rb,
      comparison,
      disagreements: disagreements(oa, ob),
      caveats,
    };
  }

  /**
   * The suite's cases in use or in draft whose text appears in its
   * operation's instructions (see `casesInInstructions`), for a warning on
   * the suite page. Empty without `instructionTexts`.
   */
  async function casesInInstructionsFor(
    suiteKey: string,
  ): Promise<CaseInInstructions[]> {
    const suite = suiteOrThrow(suiteKey);
    if (!opts.instructionTexts) return [];
    const [texts, cases] = await Promise.all([
      opts.instructionTexts(suite.operation),
      store.listCases(suite.key),
    ]);
    return casesInInstructions(
      cases
        .filter((c) => c.status !== "RETIRED")
        .map((c) => {
          const parsed = suite.input.safeParse(c.input);
          return {
            id: c.id,
            title: parsed.success ? suite.title(parsed.data) : "A case",
            input: c.input,
          };
        }),
      texts,
    );
  }

  /**
   * The model board for one suite: every model the operation can use, with
   * its latest test on every case in use, and how it compares with the
   * live model. Needs `route` and `candidates`.
   */
  async function board(suiteKey: string) {
    if (!opts.route || !opts.candidates)
      throw new Error("The board needs the route and candidates options");
    // With a person's levels and aims, so every page reads the same checks.
    const suite = await effectiveSuite(suiteKey);
    const levels = levelsOf(suite.checks);
    const sameLevels = (r: RunRecord) =>
      !r.metrics?.levels ||
      Object.entries(levels).every(([k, l]) => r.metrics?.levels?.[k] === l);
    const [route, listed, prompt] = await Promise.all([
      opts.route(suite.operation),
      store.listCases(suite.key),
      opts.promptVersion(suite.operation),
      stopStuckRuns(suite.key),
    ]);
    const cases = listed.filter((c) => confirmedLabel(c.labels));
    // The cases a rescore keeps: a retired case's answers leave a test's
    // score, so they leave every count read beside it too.
    const kept = new Set(listed.map((c) => c.id));
    const current = datasetVersion(cases);
    const { models, fallbackModels = models } = opts.candidates(
      suite.operation,
    );
    const allowed = new Set([...models, ...fallbackModels]);
    const runs = (await store.listRuns(suite.key)).filter(
      (r) => r.set === "ALL" && allowed.has(r.model),
    );
    const defaultEffort = route.reasoningEffort ?? null;
    // The setting a model actually gets: models without reasoning settings
    // ignore it, so their rows don't split by it.
    const realEffort = (model: string, effort: string | null) =>
      effortFor(opts.models, model, effort) ?? null;
    const keyOf = boardKey;
    const runKey = (r: RunRecord) => keyOf(r.model, r.reasoningEffort);
    const latestDone = new Map<string, RunRecord>();
    const testing = new Set<string>();
    const newest = new Map<string, RunRecord>();
    for (const r of runs) if (!newest.has(runKey(r))) newest.set(runKey(r), r);
    for (const r of runs) {
      if (r.status === "RUNNING") testing.add(runKey(r));
      if (r.status === "SUCCEEDED" && !latestDone.has(runKey(r)))
        latestDone.set(runKey(r), r);
    }
    const liveTemperature = route.temperature ?? null;
    const liveCap = route.maxOutputTokens ?? null;
    // A test at another temperature or output cap than the live ones
    // answered differently.
    // Tests graded at other levels need a rescore (free); tests from
    // before levels were kept count as current.
    const isCurrent = (r: RunRecord) =>
      sameLevels(r) &&
      r.datasetVersion === current &&
      r.promptVersion === prompt &&
      (r.temperature ?? null) === liveTemperature &&
      (r.maxOutputTokens ?? null) === liveCap;

    const liveKey = keyOf(route.model, defaultEffort);
    const liveRun = latestDone.get(liveKey);
    // Tests on the same cases and instructions as the live model's compare
    // with it, even if the answer key has changed since.
    const sameAsLive = (r: RunRecord) =>
      liveRun !== undefined &&
      r.datasetVersion === liveRun.datasetVersion &&
      r.promptVersion === liveRun.promptVersion &&
      (r.temperature ?? null) === (liveRun.temperature ?? null) &&
      (r.maxOutputTokens ?? null) === (liveRun.maxOutputTokens ?? null);
    const outputs = new Map<string, RunOutput[]>();
    for (const [id, outs] of await outputsByRun(
      [...latestDone.values()].map((r) => r.id),
    ))
      outputs.set(
        id,
        outs
          .filter((x) => kept.has(x.caseId))
          .map((x) => ({
            caseId: x.caseId,
            checks: x.error ? null : (x.scores ?? []),
            costUsd: x.costUsd,
            ms: x.ms,
            reused: x.reused,
          })),
      );
    const outputsOf = (runId: string) => outputs.get(runId) ?? [];
    const checkKeys = suite.checks.map((c) => c.key);
    const seriousKeys = new Set(
      suite.checks.filter((c) => c.severity === "serious").map((c) => c.key),
    );

    const seen = new Set<string>();
    let keys = [
      ...models.map((m) => ({
        model: m,
        effort: defaultEffort,
      })),
      ...fallbackModels.map((m) => ({
        model: m,
        effort: defaultEffort,
      })),
      ...[...newest.values()].map((r) => ({
        model: r.model,
        effort: r.reasoningEffort,
      })),
    ].filter(({ model, effort }) => {
      const k = keyOf(model, effort);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    // A retiring model stays on the board only while a feature runs on it.
    const inUse = (model: string) =>
      model === route.model || model === route.fallbackModel;
    if (opts.retiringOnBoard === "inUse")
      keys = keys.filter(
        ({ model }) => !opts.models[model]?.retiring || inUse(model),
      );
    const complete = (r: RunRecord | undefined) => !(r?.metrics?.failed ?? 0);
    const estimates = new Map(
      await Promise.all(
        keys.map(
          async ({ model }) =>
            [model, await perAnswerCost(suite, model)] as const,
        ),
      ),
    );

    const rows: BoardRow[] = keys.map(({ model, effort }) => {
      const key = keyOf(model, effort);
      const variant =
        realEffort(model, effort) !== realEffort(model, defaultEffort);
      const r = latestDone.get(key);
      const lastRun = newest.get(key);
      const m = r?.metrics ?? undefined;
      const fresh = Boolean(r && isCurrent(r));
      // Tests with failed answers are incomplete: never compared or promoted.
      const vsLive =
        r &&
        liveRun &&
        complete(r) &&
        complete(liveRun) &&
        sameAsLive(r) &&
        key !== liveKey
          ? compareRuns(outputsOf(liveRun.id), outputsOf(r.id), checkKeys)
              .verdict
          : null;
      const label = opts.models[model]?.label ?? model;
      const baseline = isBaseline(opts.models, model);
      return {
        key,
        model,
        effort,
        variant,
        label: variant
          ? `${label} · ${realEffort(model, effort) ?? "default"} reasoning`
          : label,
        live: key === liveKey,
        fallback: !variant && model === route.fallbackModel,
        baseline,
        testing: testing.has(key),
        failed:
          lastRun?.status === "FAILED"
            ? (lastRun.error ?? "unknown error").slice(0, 160)
            : null,
        estCostPerAnswer: estimates.get(model) ?? null,
        test:
          r && m
            ? {
                runId: r.id,
                at: r.startedAt,
                right: m.units?.right ?? m.allPass.passed,
                total: m.units?.total ?? m.allPass.n,
                answersRight: m.allPass.passed,
                answers: m.allPass.n,
                answersNoSerious: outputsOf(r.id).filter(
                  (x) =>
                    x.checks !== null &&
                    !x.checks.some(
                      (c) => c.pass === false && seriousKeys.has(c.key),
                    ),
                ).length,
                byCheck: m.byCheck,
                measures: m.measures ?? {},
                avgMs: m.avgMs || null,
                costPerAnswer: m.costPerAnswer ?? null,
                stale: !fresh,
                failedAnswers: m.failed,
                failureReason: m.failureReason ?? null,
              }
            : null,
        vsLive,
        // Only on up-to-date tests: never promote on an old answer key.
        canMakeLive:
          !baseline &&
          models.includes(model) &&
          fresh &&
          complete(r) &&
          (vsLive === "BETTER" || vsLive === "SAME"),
        liveOnly: !fallbackModels.includes(model),
        fallbackOnly: !models.includes(model),
        // The person choosing decides: tested or not, failed answers or
        // not, same provider or not. The board shows the evidence, the
        // suggestion recommends, and the change records its score.
        canMakeFallback:
          !baseline &&
          fallbackModels.includes(model) &&
          !variant &&
          model !== route.model &&
          model !== route.fallbackModel,
      };
    });
    // Live, then fallback, then tested rows by most right, then the rest.
    rows.sort(
      (a, b) =>
        Number(b.live) - Number(a.live) ||
        Number(b.fallback) - Number(a.fallback) ||
        (b.test && !b.test.stale ? b.test.right / b.test.total : -1) -
          (a.test && !a.test.stale ? a.test.right / a.test.total : -1) ||
        a.label.localeCompare(b.label),
    );
    // How each case fared across current, complete tests: easy and split cases.
    const caseResults: Record<string, CaseResult> = {};
    for (const row of rows) {
      if (row.variant || !row.test || row.test.stale || row.test.failedAnswers)
        continue;
      // Each model once per case: right only if every repeat was right.
      const byCase = new Map<string, { right: boolean; ranked: boolean }>();
      for (const x of outputsOf(row.test.runId)) {
        const had = byCase.get(x.caseId) ?? { right: true, ranked: false };
        byCase.set(x.caseId, {
          right: had.right && allPassed(x.checks),
          // Compared with other cases (a ranking): others' results need it.
          ranked:
            had.ranked ||
            Boolean(x.checks?.some((k) => k.together && k.pass !== null)),
        });
      }
      for (const [caseId, r] of byCase) {
        const c = (caseResults[caseId] ??= { passed: 0, models: 0 });
        c.models++;
        if (r.right) c.passed++;
        if (r.ranked) c.ranked = true;
      }
    }
    return {
      suite,
      route,
      cases: cases.length,
      caseResults,
      /** Cases in use on an answer nobody has reviewed yet. */
      provisional: cases.filter((c) => isProvisional(c.labels)).length,
      rows,
      liveRunId: liveRun?.id ?? null,
    };
  }

  /**
   * The injection suites that attack a suite, with their attack cases
   * first brought in step with its confirmed answers (`injectionCases`):
   * the ones with cases in use for `set`.
   */
  async function attacksReady(suiteKey: string, set: EvalSet) {
    const out: AnySuite[] = [];
    for (const a of injectionSuitesOf(
      opts.suites,
      suiteOrThrow(suiteKey).key,
    )) {
      // Trust boundary: injectionSuitesOf returns only suites made by
      // injectionSuite, which is what injectionCases takes.
      await injectionCases(
        store,
        a as unknown as Parameters<typeof injectionCases>[1],
      );
      if ((await casesFor(a.key, set)).length) out.push(a);
    }
    return out;
  }

  /**
   * A test of a model on a feature, as people start one: the suite's cases
   * and, when injection suites attack it, their attack cases too, kept in
   * step with the suite's confirmed answers first. One run per suite; run
   * each with `runEval`. `createRun` tests one suite alone.
   *
   * @param args - As for `createRun`, for the feature's suite.
   * @returns The runs, the suite's first, and what the whole test costs.
   */
  async function createTest(args: Parameters<typeof createRun>[0]) {
    const attacks = await attacksReady(args.suite, args.set ?? "ALL");
    const made = [await createRun(args)];
    for (const a of attacks)
      made.push(await createRun({ ...args, suite: a.key }));
    return {
      runs: made.map((m) => m.run),
      estimate: totalOf(made.map((m) => m.estimate)),
    };
  }

  /**
   * What a test of a model on a feature would cost now (`createTest`): the
   * suite's cases and its attack cases together. Doesn't sync attack
   * cases; it counts the ones in use.
   *
   * @param suiteKey - The feature's suite.
   * @param model - The model to test.
   * @param set - Which cases.
   * @param repeats - How many times each.
   * @param o - As for `estimateRun`.
   */
  async function estimateTest(
    suiteKey: string,
    model: string,
    set: EvalSet,
    repeats: number,
    o: Parameters<typeof estimateRun>[4] = {},
  ) {
    const suites = [
      suiteOrThrow(suiteKey).key,
      ...injectionSuitesOf(opts.suites, suiteKey).map((a) => a.key),
    ];
    return totalOf(
      await Promise.all(
        suites.map((k) => estimateRun(k, model, set, repeats, o)),
      ),
    );
  }

  /**
   * The boards of the injection suites that attack a suite, for the base
   * suite's page and its suggestion (`attacksFrom`). Empty when nothing
   * attacks it.
   */
  async function attackBoards(suiteKey: string) {
    return Promise.all(
      injectionSuitesOf(opts.suites, suiteOrThrow(suiteKey).key).map((s) =>
        board(s.key),
      ),
    );
  }

  /**
   * The models an operation can be tested on: its candidates' `models`,
   * or none without the `candidates` option.
   */
  function modelsFor(operation: string): string[] {
    return opts.candidates?.(operation).models ?? [];
  }

  return {
    startDriftCheck,
    runDriftCheck,
    draftFromActivity,
    board,
    attackBoards,
    modelsFor,
    createTest,
    estimateTest,
    suiteOrThrow,
    casesFor,
    estimateRun,
    createRun,
    runEval,
    gradeOutput,
    rescoreRun,
    rescoreRecent,
    confirmAnswer,
    answerKeyHealth: answerKeyHealthOf,
    retireEasy,
    easyRounds,
    targetCases,
    effectiveSuite,
    suiteSettings: suiteSettingsOf,
    saveSuiteSettings,
    /** Whether suite settings can be saved (a `suiteSettings` store). */
    canSaveSuiteSettings: opts.suiteSettings !== undefined,
    retireStaleDrafts,
    stopStuckRuns,
    stopTests,
    compare,
    casesInInstructions: casesInInstructionsFor,
  };
}

/** What createRunner returns. */
export type Runner = ReturnType<typeof createRunner>;
