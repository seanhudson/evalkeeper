import "server-only";
import { createMeaningJudge } from "@crowandraven/evalkeeper/ai-sdk";
import {
  prismaFeedbackStore,
  prismaJudgmentCache,
  prismaSettingsStore,
  prismaStore,
} from "@crowandraven/evalkeeper/prisma";
import {
  createSettings,
  isInjectionSuite,
  type AnswerEditorProps,
  type Settings,
} from "@crowandraven/evalkeeper";
import type { ComponentType } from "react";
import { ActionItemsEditor } from "../../components/ActionItemsEditor";
import { createRunner, type Route } from "@crowandraven/evalkeeper/runner";
import type { EvalWiring } from "@crowandraven/evalkeeper/next";
import { prisma } from "../db";
import { MODELS, availableModels } from "../models";
import { useMatcher } from "../suites/actionItems";
import { demoCost } from "../demo";
import {
  DECISION_OPERATIONS,
  INSTRUCTION_TEXTS,
  PROMPT_VERSIONS,
  SUITES,
} from "../suites";

/**
 * Evalkeeper wired to this app: the Prisma store, the suites, the model
 * catalog, and where routing lives (the Route table). Your app does the
 * same in one file like this.
 */

/** Each feature's settings in code, used until someone changes them. */
const DEFAULTS: Record<string, Settings> = {
  ticket_triage: {
    model: "demo-legacy",
    fallbackModel: null,
    reasoningEffort: null,
    maxOutputTokens: null,
  },
  action_items: {
    model: "demo-quick",
    fallbackModel: null,
    reasoningEffort: null,
    maxOutputTokens: null,
  },
  route_ticket: {
    model: "demo-quick",
    fallbackModel: null,
    reasoningEffort: null,
    maxOutputTokens: null,
  },
  detect_crisis_risk: {
    model: "demo-careful",
    fallbackModel: null,
    reasoningEffort: null,
    maxOutputTokens: null,
  },
};

/**
 * Which model each feature runs on, as numbered versions with a history
 * and rollback. Your app's AI calls read `settings.route(operation)` too.
 */
export const settings = createSettings({
  store: prismaSettingsStore(prisma),
  defaults: (operation) => {
    const d = DEFAULTS[operation];
    if (!d) throw new Error(`No default settings for ${operation}`);
    return d;
  },
  promptVersion: (operation) => PROMPT_VERSIONS[operation] ?? "unregistered",
});

export const routeFor = (operation: string): Promise<Route> =>
  settings.route(operation);

// A judge model for matching by meaning, when a key is set.
const judgeModel = process.env.ANTHROPIC_API_KEY
  ? "claude-haiku-5-5"
  : process.env.OPENAI_API_KEY
    ? "gpt-6-luna"
    : null;
if (judgeModel) {
  const { languageModel } = await import("../ai");
  const judge = createMeaningJudge({
    model: languageModel(judgeModel),
    modelId: judgeModel,
    models: MODELS,
    cache: prismaJudgmentCache(prisma),
  });
  const { wordPairs } = await import("@crowandraven/evalkeeper");
  useMatcher((e, a, onCost) => judge.match(e, a, wordPairs, onCost));
}

/** Where cases, answers, and tests live: these tables, through Prisma. */
export const store = prismaStore(prisma);

/** Thumbs up and down on answers in the product. */
export const feedbackStore = prismaFeedbackStore(prisma);

export const runner = createRunner({
  store,
  suites: SUITES,
  models: MODELS,
  promptVersion: (operation) => PROMPT_VERSIONS[operation] ?? "unregistered",
  instructionTexts: (operation) => INSTRUCTION_TEXTS[operation] ?? [],
  route: routeFor,
  candidates: (operation) => ({ models: modelsFor(operation) }),
  estimateCallCost,
});

/**
 * What one answer costs on a model, for estimates: the demo model's own
 * price, or what the model's last finished test averaged on this feature.
 * Your app might average its usage records instead.
 */
async function estimateCallCost(
  operation: string,
  model: string,
): Promise<number | null> {
  const demo = demoCost(model);
  if (demo !== null) return demo;
  const suite = SUITES.find(
    (s) => s.operation === operation && !isInjectionSuite(s),
  );
  if (!suite) return null;
  const last = (await store.listRuns(suite.key, { status: "SUCCEEDED" })).find(
    (r) => r.model === model,
  );
  return last?.metrics?.costPerAnswer ?? null;
}

export { MODELS, availableModels } from "../models";

/** The models a feature can be tested on now: decision models for decision features. */
export function modelsFor(operation: string): string[] {
  return availableModels(
    DECISION_OPERATIONS.has(operation) ? "decisions" : "text",
  );
}
export { SUITES, SUITE_BY_KEY } from "../suites";

/**
 * Your own editors for answers plain fields can't edit well, keyed by
 * suite: the answer key, "Add a case", and blind rating use them in place
 * of the suite's answer fields. Leave it empty if you have none.
 */
export const answerEditors: Partial<
  Record<string, ComponentType<AnswerEditorProps>>
> = {
  action_items: ActionItemsEditor,
};

/**
 * Who may use the eval pages. Every page and action calls this first, and
 * what it returns is recorded as who made each change. The example has no
 * accounts, so everyone is the example admin; in your app, check your
 * session and throw when the person isn't an admin.
 */
export async function requireAdmin(): Promise<{ id: string; name: string }> {
  return { id: "example-admin", name: "Example admin" };
}

/**
 * Everything Evalkeeper's pages, actions, and weekly check need from your
 * app, in one object. Where the pages live is in `./paths`.
 */
export const wiring = {
  runner,
  settings,
  store,
  feedbackStore,
  models: MODELS,
  suites: SUITES,
  routeFor,
  answerEditors,
  requireAdmin,
} satisfies Omit<EvalWiring, "basePath">;
