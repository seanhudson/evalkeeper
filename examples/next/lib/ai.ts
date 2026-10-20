import "server-only";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { typeSafeAi } from "@ai-sdk/typesafe-ai";
import type { Experimental_DecisionModel, LanguageModel } from "ai";
import { MODELS } from "./models";

/** The AI SDK model for a real model id. */
export function languageModel(model: string): LanguageModel {
  const provider = MODELS[model]?.provider;
  if (provider === "anthropic") return anthropic(model);
  if (provider === "openai") return openai(model);
  throw new Error(`No provider for ${model}`);
}

/** The AI SDK decision model for a real model id. */
export function decisionModel(model: string): Experimental_DecisionModel {
  const provider = MODELS[model]?.provider;
  if (provider === "anthropic") return anthropic.decisionModel(model);
  if (provider === "openai") return openai.decisionModel(model);
  if (provider === "typesafe") return typeSafeAi.decisionModel(model);
  throw new Error(`No decision model for ${model}`);
}
