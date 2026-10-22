/**
 * The runner: creates, runs, rescores, and compares tests, and builds each
 * suite's model board. Server-only.
 *
 * @module evalkeeper/runner
 */
import { createHash } from "node:crypto";
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
  draftFromActivity as draftCases,
  type ActivityDraftResult,
} from "./activity.js";
import { SCHEDULED } from "./weekly.js";
import { confirmedLabel, isProvisional } from "./labels.js";
export { confirmedLabel, isProvisional };
import type { AnySuite, CheckResult } from "./types.js";
import { at } from "./util.js";
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
export const OUT_OF_CREDITS =
  /no credits remaining|credit balance is too low|insufficient_quota|exceeded your current quota|billing/i;

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
   * in `@crowandraven/evalkeeper-ai-sdk`). A test records it, so editing the instructions
   * marks older tests out of date.
   */
  promptVersion: (operation: string) => string | Promise<string>;
  /**
   * The live reasoning setting for an operation; null: the model's own.
   * Defaults to the route's, when `route` is given.
   */
  liveEffort?: (
    operation: string,
  ) => ReasoningEffort | null | Promise<ReasoningEffort | null>;
  /** What one answer costs on a model, from your usage records; null: unknown. */
  estimateCallCost?: (
    operation: string,
    model: string,
  ) => Promise<number | null>;
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
    opts: Required<RunEvalOptions>,
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
};

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
};

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
        opts.estimateCallCost?.(suite.operation, model) ?? null,
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
  ): Promise<CheckResult[]> {
    const input = suite.input.parse(c.input);
    const label = confirmedLabel(c.labels);
    const parsed = label ? suite.labelValue.safeParse(label.value) : null;
    return suite.grade(
      input,
      output,
      parsed?.success ? parsed.data : null,
      onCost ? { onCost } : undefined,
    );
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
      const extra = suite.gradeTogether(answers);
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
  ): Promise<RunMetrics> {
    const outputs = await store.listOutputs(run.id);
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
      const suite = suiteOrThrow(run.suite);
      const cases = await casesFor(suite.key, run.set);
      const since = new Date(Date.now() - REUSE_DAYS * 86_400_000);
      const jobs = cases.flatMap((c) =>
        Array.from({ length: run.repeats }, (_, i) => ({ c, repeat: i + 1 })),
      );
      const answered = new Set(
        (await store.listOutputs(runId)).map((x) => `${x.caseId}:${x.repeat}`),
      );
      const todo = jobs.filter((j) => !answered.has(`${j.c.id}:${j.repeat}`));

      let judgeCost = o.judgeCostUsd ?? 0;
      const onJudge = (usd: number) => (judgeCost += usd);
      // Set inside the answers below, which TypeScript can't follow.
      let outOfCredits = null as string | null;
      const timeout = suite.answerTimeoutMs ?? ANSWER_TIMEOUT_MS;
      const deadline = opts.requestLimitMs
        ? Date.now() + opts.requestLimitMs - timeout
        : Infinity;
      let skipped = 0;

      await mapLimit(todo, suite.concurrency ?? 6, async ({ c, repeat }) => {
        if (Date.now() > deadline || outOfCredits) {
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
            scores: await gradeOutput(suite, c, earlier.output, onJudge),
            // What the call cost and took when it was made, so per-answer
            // numbers stay real; the run's spend leaves reused ones out.
            costUsd: earlier.costUsd,
            ms: earlier.ms,
            reused: true,
          });
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
            scores: await gradeOutput(suite, c, output, onJudge),
            costUsd: cost,
            ms: Date.now() - started,
            reused: false,
          });
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
        }
      });

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
          }) &&
          opts.continueRun &&
          (await opts.continueRun(runId, next).catch(() => false))
        )
          return;
        await store.updateRun(runId, {
          status: "FAILED",
          finishedAt: new Date(),
          error: outOfCredits
            ? `The ${providerName(run.model)} account is out of credits, so the test stopped after ${jobs.length - skipped} of ${jobs.length} answers. Add credits, then test again: answers already given are reused at no cost.`
            : `Ran out of time after ${jobs.length - skipped} of ${jobs.length} answers. Test again to finish: answers already given are reused at no cost.`,
        });
        return;
      }

      await gradeTogether(run, suite);
      await store.updateRun(runId, {
        status: "SUCCEEDED",
        finishedAt: new Date(),
        datasetVersion: datasetVersion(cases),
        metrics: await metricsFor(run, suite, judgeCost),
      });
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
   * model calls. It brings a test up to today's answers, but never up to
   * inputs that changed after it ran.
   */
  async function rescoreRun(runId: string) {
    const run = await store.getRun(runId);
    if (!run) return;
    const suite = suiteOrThrow(run.suite);
    const cases = new Map(
      (await store.listCases(suite.key)).map((c) => [c.id, c]),
    );
    const outputs = (await store.listOutputs(runId)).filter(
      (x) => !x.error && cases.has(x.caseId),
    );
    let judgeCost = 0;
    const onJudge = (usd: number) => (judgeCost += usd);
    await mapLimit(outputs, 6, async (x) =>
      store.setOutputScores(
        x.id,
        await gradeOutput(suite, mustGet(cases, x.caseId), x.output, onJudge),
      ),
    );
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
      metrics: await metricsFor(
        run,
        suite,
        (run.metrics?.judgeCostUsd ?? 0) + judgeCost,
      ),
    });
  }

  /** Regrades a suite's recent finished tests, e.g. after answers change. */
  async function rescoreRecent(suiteKey: string, limit = 10) {
    for (const r of await store.listRuns(suiteKey, {
      status: "SUCCEEDED",
      limit,
    }))
      await rescoreRun(r.id);
  }

  /**
   * Records one suite's weekly drift check without running it: its quick
   * set on its live model, at its live reasoning setting, marked as
   * started by the schedule. Record every suite's first, so a page can show
   * them running, then run each with `runEval(id, { fresh: true })`.
   * Returns the test's id, or null when the suite has no cases in use.
   * Needs `route`.
   */
  async function startDriftCheck(suiteKey: string): Promise<string | null> {
    if (!opts.route) throw new Error("The drift check needs the route option");
    const suite = suiteOrThrow(suiteKey);
    if (!(await casesFor(suite.key, "SMOKE")).length) return null;
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
    const suite = suiteOrThrow(suiteKey);
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
   * The model board for one suite: every model the operation can use, with
   * its latest test on every case in use, and how it compares with the
   * live model. Needs `route` and `candidates`.
   */
  async function board(suiteKey: string) {
    if (!opts.route || !opts.candidates)
      throw new Error("The board needs the route and candidates options");
    const suite = suiteOrThrow(suiteKey);
    const [route, cases, prompt] = await Promise.all([
      opts.route(suite.operation),
      casesFor(suite.key, "ALL"),
      opts.promptVersion(suite.operation),
      stopStuckRuns(suite.key),
    ]);
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
    const keyOf = (model: string, effort: string | null) =>
      `${model}|${realEffort(model, effort) ?? ""}`;
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
    const isCurrent = (r: RunRecord) =>
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
        outs.map((x) => ({
          caseId: x.caseId,
          checks: x.error ? null : (x.scores ?? []),
          costUsd: x.costUsd,
          ms: x.ms,
          reused: x.reused,
        })),
      );
    const outputsOf = (runId: string) => outputs.get(runId) ?? [];
    const checkKeys = suite.checks.map((c) => c.key);

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
            [
              model,
              (await opts.estimateCallCost?.(suite.operation, model)) ?? null,
            ] as const,
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
    const caseResults: Record<string, { passed: number; models: number }> = {};
    for (const row of rows) {
      if (row.variant || !row.test || row.test.stale || row.test.failedAnswers)
        continue;
      for (const x of outputsOf(row.test.runId)) {
        const c = (caseResults[x.caseId] ??= { passed: 0, models: 0 });
        c.models++;
        if (allPassed(x.checks)) c.passed++;
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

  return {
    startDriftCheck,
    runDriftCheck,
    draftFromActivity,
    board,
    suiteOrThrow,
    casesFor,
    estimateRun,
    createRun,
    runEval,
    gradeOutput,
    rescoreRun,
    rescoreRecent,
    stopStuckRuns,
    compare,
  };
}

/** What createRunner returns. */
export type Runner = ReturnType<typeof createRunner>;
