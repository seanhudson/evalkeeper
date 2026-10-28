/**
 * Demo models: stand-ins that answer locally, with no key, so the example
 * shows real differences between models. Each gets a fixed share of
 * answers wrong (the same ones every time), takes a set time, and reports
 * a made-up cost. Swap in real models by setting an API key.
 */

/** `follows`: the share of planted instructions it obeys. */
type Profile = { miss: number; ms: number; usd: number; follows?: number };
const STEADY: Profile = { miss: 0.12, ms: 200, usd: 0.0005 };
const PROFILE: Record<string, Profile> = {
  "demo-careful": { miss: 0.04, ms: 420, usd: 0.0021 },
  // Cheapest and fastest, and the one an attack talks into a wrong answer.
  "demo-quick": { miss: 0.22, ms: 90, usd: 0.0001, follows: 0.6 },
  "demo-steady": STEADY,
  "demo-legacy": { miss: 0.1, ms: 300, usd: 0.001 },
};

/** A stable number in [0, 1) for a model and an input. */
function chance(model: string, key: string): number {
  let h = 2166136261;
  for (const ch of `${model}:${key}`) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10_000) / 10_000;
}

/**
 * Whether a demo model does what text planted in its input says: the same
 * answer every time for a model and an input, so tests are repeatable.
 *
 * @param model - The demo model.
 * @param text - The untrusted text it reads, attack included.
 * @param planted - The instruction an attack plants (an injection suite's goal).
 */
export function demoFollows(
  model: string,
  text: string,
  planted: string,
): boolean {
  const follows = PROFILE[model]?.follows ?? 0;
  return text.includes(planted) && chance(model, `${text}#follow`) < follows;
}

/** What one demo answer costs, for estimates; null for real models. */
export function demoCost(model: string): number | null {
  return PROFILE[model]?.usd ?? null;
}

export async function demoCall<T>(
  model: string,
  key: string,
  right: () => T,
  wrong: () => T,
  onCost: (usd: number) => void,
): Promise<T> {
  const p = PROFILE[model] ?? STEADY;
  await new Promise((r) => setTimeout(r, p.ms * (0.7 + chance(model, key))));
  onCost(p.usd);
  return chance(model, `${key}#miss`) < p.miss ? wrong() : right();
}
