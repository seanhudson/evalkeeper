/**
 * Demo models: stand-ins that answer locally, with no key, so the example
 * shows real differences between models. Each gets a fixed share of
 * answers wrong (the same ones every time), takes a set time, and reports
 * a made-up cost. Swap in real models by setting an API key.
 */

const PROFILE: Record<string, { miss: number; ms: number; usd: number }> = {
  "demo-careful": { miss: 0.04, ms: 420, usd: 0.0021 },
  "demo-quick": { miss: 0.22, ms: 90, usd: 0.0001 },
  "demo-steady": { miss: 0.12, ms: 200, usd: 0.0005 },
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

export async function demoCall<T>(
  model: string,
  key: string,
  right: () => T,
  wrong: () => T,
  onCost: (usd: number) => void,
): Promise<T> {
  const p = PROFILE[model] ?? PROFILE["demo-steady"];
  await new Promise((r) => setTimeout(r, p.ms * (0.7 + chance(model, key))));
  onCost(p.usd);
  return chance(model, `${key}#miss`) < p.miss ? wrong() : right();
}
