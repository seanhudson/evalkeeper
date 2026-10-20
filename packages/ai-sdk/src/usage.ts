import { priceCall, type ModelCatalog } from "@crowandraven/evalkeeper";

/**
 * What a call cost, from the AI SDK's usage and your catalog's prices;
 * null when the model has no price. Report it through a suite's
 * `ctx.onCost` so tests show real cost per answer.
 */
export function costOf(
  models: ModelCatalog,
  model: string,
  /** A call's usage: a language model's, or a decision's. */
  usage: {
    inputTokens?: number | undefined;
    outputTokens?: number | undefined;
  },
): number | null {
  return priceCall(models, model, {
    input: usage.inputTokens ?? 0,
    output: usage.outputTokens ?? 0,
  });
}
