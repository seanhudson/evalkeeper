import type { ComponentType } from "react";
import type { EvalStore } from "../store.js";
import type { FeedbackStore } from "../feedback.js";
import { thumbsSummary } from "../feedback.js";
import type { ModelCatalog } from "../models.js";
import type { Route, Runner } from "../runner.js";
import type { VersionedSettings } from "../settings.js";
import type { AnswerEditorProps, AnySuite } from "../types.js";
import { weeklySummary, type WeeklySummary } from "../weekly.js";

/** A form action: a server action the screens' forms submit to. */
export type FormAction = (form: FormData) => Promise<void>;

/**
 * The server actions the screens' forms submit to. On Next.js, a
 * `"use server"` module of your app makes them (`evalActions` does it in
 * one line); the screens never import your modules themselves.
 */
export type EvalActions = {
  testModel: FormAction;
  testAll: FormAction;
  makeLive: FormAction;
  makeFallback: FormAction;
  useSuggestion: FormAction;
  rescore: FormAction;
  rollBackSettings: FormAction;
  confirmAnswer: FormAction;
  addCase: FormAction;
  editAnswer: FormAction;
  retireCase: FormAction;
  runWeeklyNow: () => Promise<void>;
};

/**
 * Everything Evalkeeper's screens need from your app, in one object: your
 * runner, settings, and stores, your models and suites, where the pages
 * live, your answer editors, and the actions their forms submit to. Make
 * it once in your wiring module with `defineEvals`, and pass it to the
 * screens.
 */
export type EvalApp = {
  runner: Runner;
  settings: VersionedSettings;
  store: EvalStore;
  feedbackStore: FeedbackStore;
  /** Your model catalog: labels, providers, prices, and retirements. */
  models: ModelCatalog;
  suites: AnySuite[];
  /** What's live for an operation, as your router sees it. */
  routeFor: (operation: string) => Promise<Route>;
  /** Your own editors for answers plain fields edit badly, by suite. */
  answerEditors: Partial<Record<string, ComponentType<AnswerEditorProps>>>;
  actions: EvalActions;
  /** Where the eval pages live, as a URL path: "/evals", "/admin/evals". */
  basePath: string;
};

/** An `EvalApp` with its suites by key, as the screens read it. */
export type EvalAppConfig = EvalApp & {
  /** Each suite by its key. */
  suiteByKey: Readonly<Record<string, AnySuite>>;
};

/** A path without its trailing slashes, in one pass (no regex to backtrack). */
function withoutTrailingSlashes(path: string): string {
  let end = path.length;
  while (end > 0 && path[end - 1] === "/") end--;
  return path.slice(0, end);
}

/**
 * Makes the object the screens read everything from. Call it once in your
 * wiring module and pass the result to the pages.
 *
 * @example
 * ```ts
 * export const evals = defineEvals({
 *   runner, settings, store, feedbackStore, models: MODELS, suites: SUITES,
 *   routeFor, answerEditors: {}, actions, basePath: "/admin/evals",
 * });
 * ```
 *
 * @param app - Your runner, stores, models, suites, editors, actions, and
 *   where the pages live.
 */
export function defineEvals(app: EvalApp): EvalAppConfig {
  return {
    ...app,
    basePath: withoutTrailingSlashes(app.basePath) || "/",
    suiteByKey: Object.fromEntries(app.suites.map((s) => [s.key, s])),
  };
}

/**
 * A link to an eval page: the base path, then each part, escaped.
 *
 * @param app - Your screens' configuration (for the base path).
 * @param parts - The path below it: a suite's key, "runs", a test's id.
 */
export function evalsPath(app: { basePath: string }, ...parts: string[]) {
  return [app.basePath, ...parts.map(encodeURIComponent)].join("/");
}

/** The moment `days` days before now. */
export const daysAgo = (days: number) => new Date(Date.now() - days * 864e5);

/**
 * Where the weekly check stands, for the hub: the last week's tests,
 * what's live, thumbs, and drafts.
 *
 * @param app - Your screens' configuration.
 */
export async function loadWeekly(app: EvalApp): Promise<WeeklySummary> {
  const [runs, routes, feedback, cases] = await Promise.all([
    Promise.all(
      app.suites.map((s) => app.store.listRuns(s.key, { limit: 50 })),
    ).then((r) => r.flat()),
    Promise.all(
      app.suites.map(
        async (s) => [s.operation, await app.routeFor(s.operation)] as const,
      ),
    ).then((r) => Object.fromEntries(r)),
    app.feedbackStore.listFeedback({ since: daysAgo(7) }),
    Promise.all(app.suites.map((s) => app.store.listCases(s.key))).then((c) =>
      c.flat(),
    ),
  ]);
  return weeklySummary({
    runs,
    suites: app.suites,
    routes,
    models: app.models,
    thumbs: thumbsSummary(feedback, daysAgo(7)),
    cases,
  });
}
