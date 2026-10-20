/**
 * What Evalkeeper needs to know about the models your app can use. You
 * pass a catalog in; Evalkeeper never picks a provider itself. Pure.
 */

/** How hard a reasoning model thinks, where the model takes a setting. */
export const REASONING_EFFORTS = ["none", "low", "medium", "high"] as const;
/** A reasoning setting a model may accept. */
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

/**
 * What Evalkeeper needs to know about one model: its label, provider, prices, reasoning
 * settings, and retirement date.
 */
export type ModelInfo = {
  label: string;
  /** Who serves it ("anthropic", "openai", …): the fallback must differ. */
  provider: string;
  /** USD per 1M tokens, for estimates and the cost of each answer. */
  inputPer1M?: number;
  outputPer1M?: number;
  /**
   * USD per 1M input tokens read from the provider's prompt cache. Unset:
   * cached input costs `inputPer1M`, which overstates rather than flatters.
   */
  cachedInputPer1M?: number;
  /**
   * USD per 1M input tokens written to the prompt cache (Anthropic bills
   * these above the input price). Unset: they cost `inputPer1M`.
   */
  cacheWriteInputPer1M?: number;
  /** Reasoning efforts it accepts, lowest first. */
  efforts?: ReasoningEffort[];
  /**
   * When the provider retires it, as "YYYY-MM" or "YYYY-MM-DD". A retiring
   * model is never suggested, and a retiring live model gets replaced.
   */
  retiring?: string;
  /** Where the price came from, so it can be checked. */
  source?: string;
  /**
   * As a decision model: "native" probabilities come from the model itself
   * (a full distribution for choices and scales); "prompted" ones are the
   * model's own estimate written out, with no distribution for choices.
   */
  decisions?: "native" | "prompted";
  /**
   * Code your app runs instead of a model (a matcher, a rules engine) or
   * alongside it, tested so the board shows whether a model beats it. A
   * baseline is compared like any model but never suggested as live or as
   * the fallback. Give it a label that says what it is.
   */
  baseline?: boolean;
};

/** Your app's models, by id. */
export type ModelCatalog = Record<string, ModelInfo>;

/** Whether a catalog entry is a baseline (code, not a model): never suggested. */
export function isBaseline(models: ModelCatalog, model: string): boolean {
  return models[model]?.baseline === true;
}

/** "January 2027" for a retiring model; null when it isn't retiring. */
export function retiresLabel(
  models: ModelCatalog,
  model: string,
): string | null {
  const when = models[model]?.retiring;
  if (!when) return null;
  const [y = 1970, m = 1] = when.split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * The cost of a call from its token counts; null when the price is unknown.
 * `cachedInput` and `cacheWriteInput` are the parts of `input` read from
 * and written to the provider's prompt cache, priced at the model's cache
 * prices when it has them.
 */
export function priceCall(
  models: ModelCatalog,
  model: string,
  tokens: {
    input: number;
    output: number;
    cachedInput?: number;
    cacheWriteInput?: number;
  },
): number | null {
  const m = models[model];
  if (m?.inputPer1M === undefined || m.outputPer1M === undefined) return null;
  // The cache parts are subsets of input: never count more than it has.
  const cached = Math.min(Math.max(tokens.cachedInput ?? 0, 0), tokens.input);
  const written = Math.min(
    Math.max(tokens.cacheWriteInput ?? 0, 0),
    tokens.input - cached,
  );
  const plain = tokens.input - cached - written;
  return (
    (plain * m.inputPer1M +
      cached * (m.cachedInputPer1M ?? m.inputPer1M) +
      written * (m.cacheWriteInputPer1M ?? m.inputPer1M) +
      tokens.output * m.outputPer1M) /
    1e6
  );
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
