import "server-only";
import { isInjectionSuite } from "@crowandraven/evalkeeper";
import { injectionCases } from "@crowandraven/evalkeeper/suites";
import { SUITES, runner, store } from ".";

/**
 * The weekly check: each suite's quick set on its live model. `start`
 * records every suite's test first (so the hub shows them running), then
 * `run` drafts cases from the week's activity and answers the tests one
 * suite after another. On a platform with a request limit, give the runner
 * `requestLimitMs` and `continueRun` so a slow suite carries on in a fresh
 * request.
 */
export async function startWeeklyCheck(): Promise<string[]> {
  // Attack cases follow the week's newly confirmed answers first.
  for (const suite of SUITES)
    if (isInjectionSuite(suite))
      // Trust boundary: isInjectionSuite means injectionSuite made it.
      await injectionCases(
        store,
        suite as unknown as Parameters<typeof injectionCases>[1],
      );
  const ids: string[] = [];
  for (const suite of SUITES) {
    const id = await runner.startDriftCheck(suite.key);
    if (id) ids.push(id);
  }
  return ids;
}

export async function runWeeklyCheck(ids: string[]): Promise<void> {
  await draftWeekly();
  // runEval never throws: a suite that fails says why on its own test.
  for (const id of ids) await runner.runEval(id, { fresh: true });
}

/**
 * New draft cases from the week's activity, for suites that can draft
 * them: at most a few per suite a week, pending until a person reviews
 * them, never the same input twice. One suite failing doesn't stop the
 * rest.
 */
export async function draftWeekly(): Promise<void> {
  for (const suite of SUITES) {
    if (!suite.draftFromActivity) continue;
    try {
      await runner.draftFromActivity(suite.key);
    } catch (e) {
      console.error(`Drafting from activity failed for ${suite.key}`, e);
    }
  }
}

// Where the weekly check stands, for the hub, is loadWeekly in
// @crowandraven/evalkeeper/react.
