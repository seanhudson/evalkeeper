import type { ModelCatalog } from "evalkeeper";

/**
 * The models this app can use. Demo models run locally with no key, so the
 * example works out of the box; real ones show up when their key is set.
 * Prices are per 1M tokens, with where they came from.
 */
export const MODELS: ModelCatalog = {
  "demo-careful": {
    label: "Demo Careful",
    provider: "demo-a",
    inputPer1M: 2,
    outputPer1M: 10,
    source: "made up, for the demo",
  },
  "demo-quick": {
    label: "Demo Quick",
    provider: "demo-a",
    inputPer1M: 0.1,
    outputPer1M: 0.5,
    source: "made up, for the demo",
  },
  "demo-steady": {
    label: "Demo Steady",
    provider: "demo-b",
    inputPer1M: 0.5,
    outputPer1M: 2,
    source: "made up, for the demo",
  },
  "demo-legacy": {
    label: "Demo Legacy",
    provider: "demo-b",
    inputPer1M: 1,
    outputPer1M: 4,
    retiring: "2027-01",
    source: "made up, for the demo",
  },
  "claude-sonnet-5-5": {
    label: "Claude Sonnet 5.5",
    provider: "anthropic",
    inputPer1M: 2,
    outputPer1M: 10,
    source: "platform.claude.com/docs/en/about-claude/pricing, Oct 12 2026",
  },
  "claude-haiku-5-5": {
    label: "Claude Haiku 5.5",
    provider: "anthropic",
    inputPer1M: 0.1,
    outputPer1M: 0.5,
    source: "platform.claude.com pricing, Oct 12 2026",
  },
  "gpt-6-luna": {
    label: "GPT-6 Luna",
    provider: "openai",
    inputPer1M: 0.1,
    outputPer1M: 0.5,
    efforts: ["none", "low", "medium", "high"],
    source: "developers.openai.com/api/docs/pricing, Oct 14 2026",
  },
  "gpt-6.1-sol": {
    label: "GPT-6.1 Sol",
    provider: "openai",
    inputPer1M: 2,
    outputPer1M: 10,
    efforts: ["low", "medium", "high"],
    source: "developers.openai.com/api/docs/pricing, Oct 14 2026",
  },
};

const KEYS: Record<string, string | undefined> = {
  anthropic: process.env.ANTHROPIC_API_KEY,
  openai: process.env.OPENAI_API_KEY,
};

/** Models you can test now: the demo ones, plus any whose key is set. */
export function availableModels(): string[] {
  return Object.keys(MODELS).filter((m) => {
    const p = MODELS[m]?.provider ?? "";
    return p.startsWith("demo") || Boolean(KEYS[p]);
  });
}

export const isDemo = (model: string) => model.startsWith("demo-");
