import { isInjectionSuite } from "../types.js";
import { injectionCases } from "../suites/injection.js";
import type { EvalWiring } from "./wiring.js";

/** The weekly check, in the two halves a request can split it into. */
export type WeeklyCheck = {
  /**
   * Brings attack cases up to date with newly confirmed answers, then
   * records each suite's test on its live model, so the hub shows them
   * running. Returns the tests' ids for `run`.
   */
  start: () => Promise<string[]>;
  /** Drafts cases from the week's activity, then answers the tests. */
  run: (ids: string[]) => Promise<void>;
};

/**
 * The weekly check: each suite's quick set on its live model. On a
 * platform with a request limit, give the runner `requestLimitMs` and
 * `continueRun` so a slow suite carries on in a fresh request.
 *
 * @param w - Your wiring: its runner, store, and suites.
 */
export function weeklyCheck(
  w: Pick<EvalWiring, "runner" | "store" | "suites">,
): WeeklyCheck {
  /**
   * New draft cases from the week's activity, for suites that can draft
   * them. One suite failing doesn't stop the rest.
   */
  async function draft() {
    for (const suite of w.suites) {
      if (!suite.draftFromActivity) continue;
      try {
        await w.runner.draftFromActivity(suite.key);
      } catch (e) {
        console.error(`Drafting from activity failed for ${suite.key}`, e);
      }
    }
  }

  return {
    async start() {
      for (const suite of w.suites)
        if (isInjectionSuite(suite))
          // Trust boundary: isInjectionSuite means injectionSuite made it.
          await injectionCases(
            w.store,
            suite as unknown as Parameters<typeof injectionCases>[1],
          );
      const ids: string[] = [];
      for (const suite of w.suites) {
        const id = await w.runner.startDriftCheck(suite.key);
        if (id) ids.push(id);
      }
      return ids;
    },
    async run(ids) {
      await draft();
      // runEval never throws: a suite that fails says why on its own test.
      for (const id of ids) await w.runner.runEval(id, { fresh: true });
    },
  };
}
