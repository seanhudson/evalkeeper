import { createHash } from "node:crypto";
import { compareRuns, type RunOutput } from "./compare";
import { isStuck, shouldContinue } from "./legs";
import { effortFor, type ModelCatalog, type ReasoningEffort } from "./models";
import type { BoardRow } from "./board";
import { allPassed } from "./stats";
import { pickQuickSet } from "./quickSet";
import { stableJson } from "./stableJson";
import { suiteMetrics, type ScoredOutput } from "./stats";
import type {
  CaseRecord,
  EvalSet,
  EvalStore,
  RunMetrics,
  RunRecord,
} from "./store";
import { withTimeout } from "./timeout";
import { confirmedLabel, isProvisional } from "./labels";
export { confirmedLabel, isProvisional };
import type { AnySuite, CheckResult } from "./types";
import { at } from "./util";
import { mustGet } from "./util";

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

export type RunnerOptions = {
  store: EvalStore;
  suites: AnySuite[];
  /** Your models, for providers, prices, and retirements. */
  models: ModelCatalog;
  /**
   * The current instructions' hash for an operation (see instructionsHash
   * in @evalkeeper/ai-sdk). A test records it, so editing the instructions
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
};

export type Route = {
  model: string;
  fallbackModel: string | null;
  reasoningEffort: ReasoningEffort | null;
};

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

  async function estimateRun(
    suiteKey: string,
    model: string,
    set: EvalSet,
    repeats: number,
  ): Promise<{ cases: number; costUsd: number | null }> {
    const suite = suiteOrThrow(suiteKey);
    const [cases, perCall] = await Promise.all([
      casesFor(suite.key, set).then((c) => c.length),
      opts.estimateCallCost?.(suite.operation, model) ?? null,
    ]);
    return {
      cases,
      costUsd: perCall === null ? null : perCall * cases * repeats,
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
  }) {
    const suite = suiteOrThrow(args.suite);
    const set = args.set ?? "ALL";
    const repeats = args.repeats ?? 1;
    const [estimate, promptVersion, liveEffort] = await Promise.all([
      estimateRun(suite.key, args.model, set, repeats),
      opts.promptVersion(suite.operation),
      // The live setting: from liveEffort, else the route's.
      opts.liveEffort
        ? opts.liveEffort(suite.operation)
        : opts.route
          ? Promise.resolve(opts.route(suite.operation)).then(
              (r) => r.reasoningEffort,
            )
          : null,
    ]);
    const run = await store.createRun({
      suite: suite.key,
      model: args.model,
      promptVersion,
      reasoningEffort:
        args.reasoningEffort !== undefined ? args.reasoningEffort : liveEffort,
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
        const requestHash = sha(
          stableJson({
            suite: suite.key,
            model: run.model,
            effort: run.reasoningEffort,
            prompt: run.promptVersion,
            input: c.input,
            repeat,
          }),
          64,
        );
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
              reasoningEffort:
                (run.reasoningEffort as ReasoningEffort | null) ?? null,
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

  /** Marks tests the server stopped mid-way as failed. */
  async function stopStuckRuns(suiteKey: string, now = Date.now()) {
    for (const r of await store.listRuns(suiteKey, { status: "RUNNING" })) {
      if (now - +r.startedAt <= STUCK_MS) continue;
      const outs = await store.listOutputs(r.id);
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
    const comparison = compareRuns(
      await asOutputs(ra),
      await asOutputs(rb),
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
    return { suite, a: ra, b: rb, comparison, caveats };
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
    await stopStuckRuns(suite.key);
    const [route, cases] = await Promise.all([
      opts.route(suite.operation),
      casesFor(suite.key, "ALL"),
    ]);
    const prompt = await opts.promptVersion(suite.operation);
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
      effortFor(opts.models, model, effort as ReasoningEffort | null) ?? null;
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
    const isCurrent = (r: RunRecord) =>
      r.datasetVersion === current && r.promptVersion === prompt;

    const liveKey = keyOf(route.model, defaultEffort);
    const liveRun = latestDone.get(liveKey);
    // Tests on the same cases and instructions as the live model's compare
    // with it, even if the answer key has changed since.
    const sameAsLive = (r: RunRecord) =>
      liveRun !== undefined &&
      r.datasetVersion === liveRun.datasetVersion &&
      r.promptVersion === liveRun.promptVersion;
    const outputs = new Map<string, RunOutput[]>();
    for (const r of latestDone.values())
      outputs.set(
        r.id,
        (await store.listOutputs(r.id)).map((x) => ({
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
    const keys = [
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
          models.includes(model) &&
          fresh &&
          complete(r) &&
          (vsLive === "BETTER" || vsLive === "SAME"),
        liveOnly: !fallbackModels.includes(model),
        fallbackOnly: !models.includes(model),
        canMakeFallback:
          fallbackModels.includes(model) &&
          !variant &&
          model !== route.model &&
          model !== route.fallbackModel &&
          opts.models[model]?.provider !== opts.models[route.model]?.provider &&
          // A fallback only runs during an outage: it needs to be tested on
          // these cases, not to beat the live model.
          fresh &&
          complete(r),
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

export type Runner = ReturnType<typeof createRunner>;
