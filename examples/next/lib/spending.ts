import "server-only";
import type { EvalSpending, EvalStore } from "@crowandraven/evalkeeper";
import { isInjectionSuite, type AnySuite } from "@crowandraven/evalkeeper";

/**
 * The example's eval spending: what its tests spent in the last 24 hours
 * (from the tests themselves), against daily limits kept in memory, with a
 * stop. Your app reads its own usage records and keeps limits where an
 * admin can change them without a deploy. The runner asks it before each
 * new answer (`budget: spendingBudget(spending)`), so the limits hold.
 */

/** Demo limits: low, so a few tests show what being over one looks like. */
const DEFAULT_LIMIT_USD = 5;

type State = {
  limitUsd: number;
  featureUsd: Map<string, number>;
  stoppedUntil: Date | null;
};

// Kept on globalThis so a dev server's reloads don't reset the limits.
const g = globalThis as { evalSpendingDemo?: State };
const state: State = (g.evalSpendingDemo ??= {
  limitUsd: DEFAULT_LIMIT_USD,
  featureUsd: new Map(),
  stoppedUntil: null,
});

/**
 * Eval spending for the example, from its store and suites.
 *
 * @param store - Where the tests are.
 * @param suites - Every suite, for its feature.
 * @param stopTests - Stops running tests (`runner.stopTests`).
 */
export function demoSpending(
  store: EvalStore,
  suites: readonly AnySuite[],
  stopTests: () => Promise<number> = async () => 0,
): EvalSpending {
  const since = () => new Date(Date.now() - 24 * 60 * 60 * 1000);
  /** Tests of these suites in the last 24 hours. */
  const runsOf = async (of: readonly AnySuite[]) =>
    (await Promise.all(of.map((s) => store.listRuns(s.key, { limit: 200 }))))
      .flat()
      .filter((r) => r.startedAt >= since());
  const spent = (runs: Awaited<ReturnType<typeof runsOf>>) =>
    runs.reduce((t, r) => t + (r.metrics?.costUsd ?? 0), 0);
  return {
    async read(operation) {
      const all = await runsOf(suites);
      const mine = operation
        ? suites.filter(
            (s) =>
              s.operation === operation ||
              (isInjectionSuite(s) && s.base.operation === operation),
          )
        : [];
      const keys = new Set(mine.map((s) => s.key));
      return {
        spentUsd: spent(all),
        limitUsd: state.limitUsd,
        stoppedUntil:
          state.stoppedUntil && state.stoppedUntil > new Date()
            ? state.stoppedUntil
            : null,
        running: all.filter((r) => r.status === "RUNNING").length,
        ...(operation
          ? {
              feature: {
                operation,
                spentUsd: spent(all.filter((r) => keys.has(r.suite))),
                limitUsd: state.featureUsd.get(operation) ?? null,
                defaultUsd: null,
              },
            }
          : {}),
      };
    },
    async saveLimits(limits) {
      state.limitUsd = limits.allUsd;
      const f = limits.feature;
      if (f) {
        if (f.usd === null) state.featureUsd.delete(f.operation);
        else state.featureUsd.set(f.operation, f.usd);
      }
    },
    async stopAll() {
      state.stoppedUntil = new Date(Date.now() + 15 * 60_000);
      // Running tests stop within an answer or two; the stop keeps new
      // ones from starting answers (the runner's budget).
      return stopTests();
    },
    async allow() {
      state.stoppedUntil = null;
    },
  };
}
