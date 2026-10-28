// Your app's Evalkeeper wiring: the one file the copied eval pages import.
// Written by `npx @crowandraven/evalkeeper add pages`; it's yours now. Fill in each TODO.
import "server-only";
import {
  createSettings,
  type AnswerEditorProps,
  type AnySuite,
  type ModelCatalog,
  type Settings,
} from "@crowandraven/evalkeeper";
import type { ComponentType } from "react";
import { createRunner, type Route } from "@crowandraven/evalkeeper/runner";
import {
  prismaFeedbackStore,
  prismaSettingsStore,
  prismaStore,
} from "@crowandraven/evalkeeper/prisma";
// TODO: your app's Prisma client, with Evalkeeper's models added to the
// schema (node_modules/@crowandraven/evalkeeper/schema/evalkeeper.prisma).
import { prisma } from "@/lib/prisma";

/** TODO: the models your app can use, with prices and retirement dates. */
export const MODELS: ModelCatalog = {};

/** Models you can test now, e.g. only those whose API key is set. */
export function availableModels(): string[] {
  return Object.keys(MODELS);
}

/**
 * The models a feature can be tested on now. TODO: return decision models
 * for features graded as decisions, if you have any.
 */
export function modelsFor(_operation: string): string[] {
  return availableModels();
}

/** TODO: one suite per AI feature (see the README's "Write a suite"). */
export const SUITES: AnySuite[] = [];
export const SUITE_BY_KEY: Record<string, AnySuite> = Object.fromEntries(
  SUITES.map((s) => [s.key, s]),
);

/**
 * Your own editors for answers plain fields can't edit well, keyed by
 * suite (see `AnswerEditorProps`). The answer key, "Add a case", and blind
 * rating use them in place of the suite's answer fields. Empty is fine.
 */
export const answerEditors: Partial<
  Record<string, ComponentType<AnswerEditorProps>>
> = {};

/**
 * TODO: each feature's instructions hash (instructionsHash from
 * @crowandraven/evalkeeper/ai-sdk), so editing a prompt marks older tests out of date.
 */
const PROMPT_VERSIONS: Record<string, string> = {};

/**
 * TODO: each feature's instructions as text (instructionParts from
 * @crowandraven/evalkeeper/ai-sdk, on the parts you hash), so the suite
 * page warns when a case was copied into them.
 */
const INSTRUCTION_TEXTS: Record<string, string[]> = {};

/** TODO: each feature's settings in code, used until someone changes them. */
const DEFAULTS: Record<string, Settings> = {};

export const store = prismaStore(prisma);
export const feedbackStore = prismaFeedbackStore(prisma);

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

export const runner = createRunner({
  store,
  suites: SUITES,
  models: MODELS,
  promptVersion: (operation) => PROMPT_VERSIONS[operation] ?? "unregistered",
  instructionTexts: (operation) => INSTRUCTION_TEXTS[operation] ?? [],
  route: routeFor,
  candidates: (operation) => ({ models: modelsFor(operation) }),
});

/**
 * TODO: who may use the eval pages. Every page and action calls this
 * first. Check your session, throw when the person isn't an admin, and
 * return who they are (recorded as who made each change). Until you do,
 * nobody can open the pages.
 */
export async function requireAdmin(): Promise<{ id: string; name: string }> {
  throw new Error(
    "Evalkeeper: write requireAdmin in lib/evalkeeper/index.ts so only admins can use the eval pages.",
  );
}
