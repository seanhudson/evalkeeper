// Your app's Evalkeeper wiring: the one file the copied eval pages import.
// Written by `npx evalkeeper add pages`; it's yours now. Fill in each TODO.
import "server-only";
import {
  createSettings,
  type AnySuite,
  type ModelCatalog,
  type Settings,
} from "evalkeeper";
import { createRunner, type Route } from "evalkeeper/runner";
import {
  prismaFeedbackStore,
  prismaSettingsStore,
  prismaStore,
} from "@evalkeeper/prisma";
// TODO: your app's Prisma client, with Evalkeeper's models added to the
// schema (node_modules/@evalkeeper/prisma/schema/evalkeeper.prisma).
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
 * TODO: each feature's instructions hash (instructionsHash from
 * @evalkeeper/ai-sdk), so editing a prompt marks older tests out of date.
 */
const PROMPT_VERSIONS: Record<string, string> = {};

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
