import "server-only";
import { thumbsSummary, weeklySummary, type WeeklySummary } from "evalkeeper";
import { MODELS, SUITES, feedbackStore, routeFor, runner, store } from ".";
import { daysAgo } from "./time";

/**
 * The weekly check: each suite's quick set on its live model. `start`
 * records every suite's test first (so the hub shows them running), then
 * `run` answers them one suite after another. On a platform with a request
 * limit, give the runner `requestLimitMs` and `continueRun` so a slow suite
 * carries on in a fresh request.
 */
export async function startWeeklyCheck(): Promise<string[]> {
  const ids: string[] = [];
  for (const suite of SUITES) {
    const id = await runner.startDriftCheck(suite.key);
    if (id) ids.push(id);
  }
  return ids;
}

export async function runWeeklyCheck(ids: string[]): Promise<void> {
  // runEval never throws: a suite that fails says why on its own test.
  for (const id of ids) await runner.runEval(id, { fresh: true });
}

/** Where the weekly check stands, for the evals hub. */
export async function loadWeekly(): Promise<WeeklySummary> {
  const [runs, routes, feedback] = await Promise.all([
    Promise.all(SUITES.map((s) => store.listRuns(s.key, { limit: 50 }))).then(
      (r) => r.flat(),
    ),
    Promise.all(
      SUITES.map(
        async (s) => [s.operation, await routeFor(s.operation)] as const,
      ),
    ).then((r) => Object.fromEntries(r)),
    feedbackStore.listFeedback({ since: daysAgo(7) }),
  ]);
  return weeklySummary({
    runs,
    suites: SUITES,
    routes,
    models: MODELS,
    thumbs: thumbsSummary(feedback, daysAgo(7)),
  });
}
