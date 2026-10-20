import "server-only";
import { createMeaningJudge } from "@evalkeeper/ai-sdk";
import {
  prismaFeedbackStore,
  prismaJudgmentCache,
  prismaStore,
} from "@evalkeeper/prisma";
import { createRunner, type Route } from "evalkeeper/runner";
import { prisma } from "./db";
import { MODELS, availableModels } from "./models";
import { useMatcher } from "./suites/actionItems";
import { demoCost } from "./demo";
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

/** Thumbs up and down on answers in the product. */
export const feedbackStore = prismaFeedbackStore(prisma);

export const runner = createRunner({
  store,
  suites: SUITES,
  models: MODELS,
  promptVersion: (operation) => PROMPT_VERSIONS[operation] ?? "unregistered",
  route: routeFor,
  candidates: () => ({ models: availableModels() }),
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
  const suite = SUITES.find((s) => s.operation === operation);
  if (!suite) return null;
  const last = (await store.listRuns(suite.key, { status: "SUCCEEDED" })).find(
    (r) => r.model === model,
  );
  return last?.metrics?.costPerAnswer ?? null;
}
