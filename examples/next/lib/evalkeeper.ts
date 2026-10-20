import "server-only";
import { createMeaningJudge } from "@evalkeeper/ai-sdk";
import { prismaJudgmentCache, prismaStore } from "@evalkeeper/prisma";
import { createRunner, type Route } from "evalkeeper/runner";
import { prisma } from "./db";
import { MODELS, availableModels } from "./models";
import { useMatcher } from "./suites/actionItems";
import { PROMPT_VERSIONS, SUITES } from "./suites";

/**
 * Evalkeeper wired to this app: the Prisma store, the suites, the model
 * catalog, and where routing lives (the Route table). Your app does the
 * same in one file like this.
 */

const DEFAULT_ROUTE: Record<string, Route> = {
  ticket_triage: {
    model: "demo-legacy",
    fallbackModel: null,
    reasoningEffort: null,
  },
  action_items: {
    model: "demo-quick",
    fallbackModel: null,
    reasoningEffort: null,
  },
};

export async function routeFor(operation: string): Promise<Route> {
  const r = await prisma.route.findUnique({ where: { operation } });
  return r
    ? { model: r.model, fallbackModel: r.fallbackModel, reasoningEffort: null }
    : (DEFAULT_ROUTE[operation] ??
        Promise.reject(new Error(`No route for ${operation}`)));
}

// A judge model for matching by meaning, when a key is set.
const judgeModel = process.env.ANTHROPIC_API_KEY
  ? "claude-haiku-5-5"
  : process.env.OPENAI_API_KEY
    ? "gpt-6-luna"
    : null;
if (judgeModel) {
  const { languageModel } = await import("./ai");
  const judge = createMeaningJudge({
    model: languageModel(judgeModel),
    modelId: judgeModel,
    models: MODELS,
    cache: prismaJudgmentCache(prisma),
  });
  const { wordPairs } = await import("evalkeeper");
  useMatcher((e, a, onCost) => judge.match(e, a, wordPairs, onCost));
}

/** Where cases, answers, and tests live: these tables, through Prisma. */
export const store = prismaStore(prisma);

export const runner = createRunner({
  store,
  suites: SUITES,
  models: MODELS,
  promptVersion: (operation) => PROMPT_VERSIONS[operation] ?? "unregistered",
  route: routeFor,
  candidates: () => ({ models: availableModels() }),
});
