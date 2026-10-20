import { priceCall, type ModelCatalog } from "@crowandraven/evalkeeper";

/**
 * What a call cost, from the AI SDK's usage and your catalog's prices;
 * null when the model has no price. Input read from or written to the
 * provider's prompt cache (`usage.inputTokenDetails`) is priced at the
 * catalog's cache prices when it has them. Report it through a suite's
 * `ctx.onCost` so tests show real cost per answer.
 */
export function costOf(
  models: ModelCatalog,
  model: string,
  /** A call's usage: a language model's, or a decision's. */
  usage: {
    inputTokens?: number | undefined;
    outputTokens?: number | undefined;
    inputTokenDetails?:
      | {
          cacheReadTokens?: number | undefined;
          cacheWriteTokens?: number | undefined;
        }
      | undefined;
  },
): number | null {
  return priceCall(models, model, {
    input: usage.inputTokens ?? 0,
    output: usage.outputTokens ?? 0,
    cachedInput: usage.inputTokenDetails?.cacheReadTokens ?? 0,
    cacheWriteInput: usage.inputTokenDetails?.cacheWriteTokens ?? 0,
  });
}
