import "server-only";
import {
  thumbsSummary,
  weeklySummary,
  type WeeklySummary,
} from "@crowandraven/evalkeeper";
import { MODELS, SUITES, feedbackStore, routeFor, runner, store } from ".";
import { daysAgo } from "./time";

/**
 * The weekly check: each suite's quick set on its live model. `start`
 * records every suite's test first (so the hub shows them running), then
 * `run` drafts cases from the week's activity and answers the tests one
 * suite after another. On a platform with a request limit, give the runner
 * `requestLimitMs` and `continueRun` so a slow suite carries on in a fresh
 * request.
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

/** Where the weekly check stands, for the evals hub. */
export async function loadWeekly(): Promise<WeeklySummary> {
  const [runs, routes, feedback, cases] = await Promise.all([
    Promise.all(SUITES.map((s) => store.listRuns(s.key, { limit: 50 }))).then(
      (r) => r.flat(),
    ),
    Promise.all(
      SUITES.map(
        async (s) => [s.operation, await routeFor(s.operation)] as const,
      ),
    ).then((r) => Object.fromEntries(r)),
    feedbackStore.listFeedback({ since: daysAgo(7) }),
    Promise.all(SUITES.map((s) => store.listCases(s.key))).then((c) =>
      c.flat(),
    ),
  ]);
  return weeklySummary({
    runs,
    suites: SUITES,
    routes,
    models: MODELS,
    thumbs: thumbsSummary(feedback, daysAgo(7)),
    cases,
  });
}
