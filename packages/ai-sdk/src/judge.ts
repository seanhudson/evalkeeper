import { createHash } from "node:crypto";
import { generateText, Output, type LanguageModel } from "ai";
import { z } from "zod";
import { priceCall, type ModelCatalog } from "evalkeeper";

/**
 * Matching expected items to a model's items by meaning, not wording: a
 * small judge model pairs each expected item, written however the reviewer
 * likes, with the actual item that says the same thing. Answers are kept
 * in a cache, so the same question is never paid for twice and regrading
 * unchanged answers is free.
 */

export type Pair = { expected: number; actual: number; why: string };
export type Pairing = {
  pairs: Pair[];
  /** "meaning": the judge decided; "words": it was unavailable, so a fallback did. */
  by: "meaning" | "words";
};

export type JudgmentCache = {
  get(key: string): Promise<unknown | null>;
  set(key: string, value: unknown, model: string): Promise<void>;
};

export const MATCH_SYSTEM = `You check an AI's output against a reviewer's answer key.

You get the EXPECTED items, each written by a reviewer in their own words, and the ACTUAL items the AI wrote. Pair each expected item with the actual item that expresses the same idea.

- Judge the idea only. Wording can differ completely, and a number can stand for the concern behind it: "60-hour weeks" matches "long hours well above normal".
- Ignore labels attached to items (weights, categories); they're checked separately.
- If one actual item combines two expected ideas, pair it with the closer one only.
- Each expected item and each actual item appears in at most one pair. Leave out anything with no match.
- For each pair, give a short reason, under 15 words.`;

const schema = z.object({
  pairs: z.array(
    z.object({
      expected: z.number().int(),
      actual: z.number().int(),
      why: z.string(),
    }),
  ),
});

/** Keeps valid, one-to-one pairs only, in the order the judge gave them. */
export function cleanPairs(
  pairs: Pair[],
  expectedCount: number,
  actualCount: number,
): Pair[] {
  const usedE = new Set<number>();
  const usedA = new Set<number>();
  const out: Pair[] = [];
  for (const p of pairs) {
    if (
      p.expected < 0 ||
      p.expected >= expectedCount ||
      p.actual < 0 ||
      p.actual >= actualCount ||
      usedE.has(p.expected) ||
      usedA.has(p.actual)
    )
      continue;
    usedE.add(p.expected);
    usedA.add(p.actual);
    out.push({ ...p, why: p.why.slice(0, 200) });
  }
  return out;
}

export function createMeaningJudge(opts: {
  /** A small, cheap model is enough; test it with its own suite. */
  model: LanguageModel;
  /** Its id in your catalog, for pricing and the cache. */
  modelId: string;
  models?: ModelCatalog;
  cache?: JudgmentCache;
  /** Replaces MATCH_SYSTEM, e.g. to describe your domain. */
  system?: string;
}) {
  const system = opts.system ?? MATCH_SYSTEM;
  const version = createHash("sha256").update(system).digest("hex").slice(0, 8);

  /** One call to the judge, uncached. */
  async function judge(
    expected: string[],
    actual: string[],
    onCost?: (usd: number) => void,
  ): Promise<Pair[]> {
    if (!expected.length || !actual.length) return [];
    const r = await generateText({
      model: opts.model,
      maxOutputTokens: 1_500,
      system,
      prompt: JSON.stringify({
        expected: expected.map((text, index) => ({ index, text })),
        actual: actual.map((text, index) => ({ index, text })),
      }),
      output: Output.object({ schema }),
    });
    const usd = priceCall(opts.models ?? {}, opts.modelId, {
      input: r.usage.inputTokens ?? 0,
      output: r.usage.outputTokens ?? 0,
    });
    if (usd !== null) onCost?.(usd);
    return cleanPairs(r.output.pairs, expected.length, actual.length);
  }

  /**
   * Pairs by meaning, from the cache when it has this exact question. When
   * the judge fails, `fallback` (e.g. word overlap) decides, and says so.
   */
  async function match(
    expected: string[],
    actual: string[],
    fallback: (expected: string[], actual: string[]) => Pair[],
    onCost?: (usd: number) => void,
  ): Promise<Pairing> {
    if (!expected.length || !actual.length) return { pairs: [], by: "meaning" };
    const key = createHash("sha256")
      .update(JSON.stringify({ v: version, m: opts.modelId, expected, actual }))
      .digest("hex");
    const kept = await opts.cache?.get(key).catch(() => null);
    if (kept) return { pairs: kept as Pair[], by: "meaning" };
    try {
      const pairs = await judge(expected, actual, onCost);
      await opts.cache?.set(key, pairs, opts.modelId).catch(() => undefined);
      return { pairs, by: "meaning" };
    } catch {
      return { pairs: fallback(expected, actual), by: "words" };
    }
  }

  return { judge, match, version };
}
