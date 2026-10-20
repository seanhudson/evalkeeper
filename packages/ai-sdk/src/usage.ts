import { priceCall, type ModelCatalog } from "evalkeeper";
import type { LanguageModelUsage } from "ai";

/**
 * What a call cost, from the AI SDK's usage and your catalog's prices;
 * null when the model has no price. Report it through a suite's
 * `ctx.onCost` so tests show real cost per answer.
 */
export function costOf(
  models: ModelCatalog,
  model: string,
  usage: LanguageModelUsage,
): number | null {
  return priceCall(models, model, {
    input: usage.inputTokens ?? 0,
    output: usage.outputTokens ?? 0,
  });
}
