/**
 * What Evalkeeper needs to know about the models your app can use. You
 * pass a catalog in; Evalkeeper never picks a provider itself. Pure.
 */

/** How hard a reasoning model thinks, where the model takes a setting. */
export const REASONING_EFFORTS = ["none", "low", "medium", "high"] as const;
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

export type ModelInfo = {
  label: string;
  /** Who serves it ("anthropic", "openai", …): the fallback must differ. */
  provider: string;
  /** USD per 1M tokens, for estimates and the cost of each answer. */
  inputPer1M?: number;
  outputPer1M?: number;
  /** Reasoning efforts it accepts, lowest first. */
  efforts?: ReasoningEffort[];
  /**
   * When the provider retires it, as "YYYY-MM" or "YYYY-MM-DD". A retiring
   * model is never suggested, and a retiring live model gets replaced.
   */
  retiring?: string;
  /** Where the price came from, so it can be checked. */
  source?: string;
};

export type ModelCatalog = Record<string, ModelInfo>;

/** "January 2027" for a retiring model; null when it isn't retiring. */
export function retiresLabel(
  models: ModelCatalog,
  model: string,
): string | null {
  const when = models[model]?.retiring;
  if (!when) return null;
  const [y, m] = when.split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** The cost of a call from its token counts; null when the price is unknown. */
export function priceCall(
  models: ModelCatalog,
  model: string,
  tokens: { input: number; output: number },
): number | null {
  const m = models[model];
  if (m?.inputPer1M === undefined || m.outputPer1M === undefined) return null;
  return (tokens.input * m.inputPer1M + tokens.output * m.outputPer1M) / 1e6;
}

/**
 * The effort a model actually gets for a requested one: the same if it
 * takes it; for "none" on a model without it, its lowest; otherwise its own
 * default. Undefined: send nothing.
 */
export function effortFor(
  models: ModelCatalog,
  model: string,
  requested: ReasoningEffort | null | undefined,
): ReasoningEffort | undefined {
  const efforts = models[model]?.efforts;
  if (!requested || !efforts) return undefined;
  if (efforts.includes(requested)) return requested;
  return requested === "none" ? efforts[0] : undefined;
}
