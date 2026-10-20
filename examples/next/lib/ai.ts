import "server-only";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import { MODELS } from "./models";

/** The AI SDK model for a real model id. */
export function languageModel(model: string): LanguageModel {
  const provider = MODELS[model]?.provider;
  if (provider === "anthropic") return anthropic(model);
  if (provider === "openai") return openai(model);
  throw new Error(`No provider for ${model}`);
}
