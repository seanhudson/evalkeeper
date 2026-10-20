import type { ModelCatalog } from "@crowandraven/evalkeeper";

/**
 * The models this app can use. Demo models run locally with no key, so the
 * example works out of the box; real ones show up when their key is set.
 * Prices are per 1M tokens, with where they came from.
 */
export const MODELS: ModelCatalog = {
  "demo-careful": {
    decisions: "native",
    label: "Demo Careful",
    provider: "demo-a",
    inputPer1M: 2,
    outputPer1M: 10,
    source: "made up, for the demo",
  },
  "demo-quick": {
    decisions: "native",
    label: "Demo Quick",
    provider: "demo-a",
    inputPer1M: 0.1,
    outputPer1M: 0.5,
    source: "made up, for the demo",
  },
  "demo-steady": {
    decisions: "native",
    label: "Demo Steady",
    provider: "demo-b",
    inputPer1M: 0.5,
    outputPer1M: 2,
    source: "made up, for the demo",
  },
  "demo-legacy": {
    decisions: "prompted",
    label: "Demo Legacy",
    provider: "demo-b",
    inputPer1M: 1,
    outputPer1M: 4,
    retiring: "2027-01",
    source: "made up, for the demo",
  },
  "claude-sonnet-5-5": {
    decisions: "prompted",
    label: "Claude Sonnet 5.5",
    provider: "anthropic",
    inputPer1M: 2,
    outputPer1M: 10,
    source: "platform.claude.com/docs/en/about-claude/pricing, Oct 12 2026",
  },
  "claude-haiku-5-5": {
    decisions: "prompted",
    label: "Claude Haiku 5.5",
    provider: "anthropic",
    inputPer1M: 0.1,
    outputPer1M: 0.5,
    source: "platform.claude.com pricing, Oct 12 2026",
  },
  "gpt-6-luna": {
    decisions: "native",
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
  "jev-latest": {
    label: "Jev",
    provider: "typesafe",
    // Decisions only: it answers typed questions, not text. Its answers are
    // a few tokens, costed at the input rate.
    decisions: "native",
    inputPer1M: 0.042,
    outputPer1M: 0.042,
    source: "typesafe.ai pricing, Oct 2026",
  },
};

const KEYS: Record<string, string | undefined> = {
  anthropic: process.env.ANTHROPIC_API_KEY,
  openai: process.env.OPENAI_API_KEY,
  typesafe: process.env.TYPESAFE_AI_API_KEY,
};

/** Providers whose models write text (Jev only answers decisions). */
const TEXT_PROVIDERS = new Set(["demo-a", "demo-b", "anthropic", "openai"]);

/**
 * Models you can test now, the demo ones plus any whose key is set: for a
 * text feature, those that write text; for a decision feature, those that
 * answer decisions.
 */
export function availableModels(kind: "text" | "decisions" = "text"): string[] {
  return Object.keys(MODELS).filter((m) => {
    const info = MODELS[m];
    const p = info?.provider ?? "";
    const usable = p.startsWith("demo") || Boolean(KEYS[p]);
    return (
      usable &&
      (kind === "decisions" ? Boolean(info?.decisions) : TEXT_PROVIDERS.has(p))
    );
  });
}

export const isDemo = (model: string) => model.startsWith("demo-");
