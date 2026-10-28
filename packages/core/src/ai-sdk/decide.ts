import {
  experimental_decide,
  type Experimental_DecisionModel,
  type Experimental_DecisionQuestion,
  type Experimental_DecisionResult,
  type Experimental_DecisionState,
} from "ai";
import type { ModelCatalog } from "../index.js";
import { costOf } from "./usage.js";

/**
 * Asks a decision model its questions about one state (the AI SDK's
 * `experimental_decide`) and reports what the call cost, so a decision
 * suite's `run` stays one call. Grade the answers with `decisionCheck`
 * from `evalkeeper`.
 *
 * @example
 * ```ts
 * const { answers } = await decideAndPrice({
 *   model: openai.decisionModel("gpt-6-luna"),
 *   modelId: "gpt-6-luna",
 *   models: MODELS,
 *   state: ticket.body,
 *   questions: {
 *     queue: { type: "choice", criteria: { billing: "Charges", bug: "Broken" } },
 *     urgent: { type: "boolean", instructions: "Can people not work?" },
 *   },
 *   onCost: ctx.onCost,
 * });
 * ```
 */
export async function decideAndPrice<
  const QUESTIONS extends Record<string, Experimental_DecisionQuestion>,
>(opts: {
  model: Experimental_DecisionModel;
  /** The model's id in your catalog, for its price. */
  modelId: string;
  models: ModelCatalog;
  state: Experimental_DecisionState;
  questions: QUESTIONS;
  /** Gets the call's cost, when the catalog has a price. */
  onCost?: (usd: number) => void;
  /** Passed to the provider, e.g. a reasoning setting. */
  providerOptions?: Parameters<
    typeof experimental_decide
  >[0]["providerOptions"];
}): Promise<Experimental_DecisionResult<QUESTIONS>> {
  const result = await experimental_decide({
    model: opts.model,
    state: opts.state,
    questions: opts.questions,
    ...(opts.providerOptions ? { providerOptions: opts.providerOptions } : {}),
  });
  const usd = costOf(opts.models, opts.modelId, result.usage);
  if (usd !== null) opts.onCost?.(usd);
  return result;
}
