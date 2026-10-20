import { describe, expect, it } from "vitest";
import { suggest as suggestWith, type SuggestRow } from "./suggest.js";
import type { ModelCatalog } from "./models.js";
import type { CheckDef } from "./types.js";

const checks: CheckDef[] = [
  {
    key: "rule",
    label: "Rule",
    description: "",
    kind: "code",
    severity: "serious",
  },
  {
    key: "style",
    label: "Style",
    description: "",
    kind: "code",
    severity: "minor",
  },
];
const MODELS: ModelCatalog = {
  "claude-sonnet-5-5": { label: "Claude Sonnet 5.5", provider: "anthropic" },
  "claude-haiku-5-5": { label: "Claude Haiku 5.5", provider: "anthropic" },
  "gpt-6.1-sol": { label: "GPT-6.1 Sol", provider: "openai" },
  "gpt-6-luna": { label: "GPT-6 Luna", provider: "openai" },
  "gpt-4o": { label: "GPT-4o", provider: "openai", retiring: "2027-01" },
  "gpt-4o-mini": {
    label: "GPT-4o mini",
    provider: "openai",
    retiring: "2027-01",
  },
  "classifier-1": { label: "Classifier", provider: "acme-ml" },
  matcher: { label: "Matcher (code)", provider: "app", baseline: true },
};
const suggest = (
  rows: SuggestRow[],
  c: CheckDef[],
  priority?: Parameters<typeof suggestWith>[2],
) => suggestWith(rows, c, priority, MODELS);

const row = (
  key: string,
  model: string,
  {
    rule = 0,
    style = 0,
    right = 25,
    cost = 0.01,
    ms = 2000,
    live = false,
    fallback = false,
  } = {},
): SuggestRow => ({
  key,
  model,
  label: key,
  variant: false,
  live,
  fallback,
  vsLive: live ? null : "SAME",
  test: {
    right,
    total: 25,
    byCheck: {
      rule: { passed: 25 - rule, n: 25, rate: null, low: null, high: null },
      style: { passed: 25 - style, n: 25, rate: null, low: null, high: null },
    },
    avgMs: ms,
    costPerAnswer: cost,
    stale: false,
  },
});

describe("suggest", () => {
  it("never suggests a baseline as live, the fallback, or one to watch", () => {
    const rows = [
      row("Luna", "gpt-6-luna", { rule: 2, right: 22, live: true }),
      // Scores best of all, but it's code, not a model.
      row("Matcher", "matcher", { rule: 0, right: 25, cost: 0 }),
      row("Haiku", "claude-haiku-5-5", { rule: 2, right: 22 }),
    ];
    const s = suggest(rows, checks)!;
    expect(s.live.key).toBe("Luna");
    expect(s.fallback?.key).toBe("Haiku");
    expect(s.reasons.join(" ")).not.toMatch(/Matcher/);
    // Only a baseline tested: nothing to suggest.
    expect(suggest([row("Matcher", "matcher")], checks)).toBeNull();
  });

  it("puts fewest serious mistakes first, and a fallback from another provider", () => {
    const s = suggest(
      [
        row("Sonnet", "claude-sonnet-5-5", {
          rule: 3,
          live: true,
          cost: 0.019,
        }),
        row("Sol", "gpt-6.1-sol", { rule: 0, cost: 0.0086, fallback: true }),
        row("Mini", "gpt-4o-mini", { rule: 9 }),
        row("Haiku", "claude-haiku-5-5", { rule: 2 }),
      ],
      checks,
    )!;
    expect(s.live.key).toBe("Sol");
    expect(s.fallback?.key).toBe("Haiku");
    expect(s.same).toBe(false);
    expect(s.reasons[0]).toMatch(/fewer serious mistakes.*0 against 3/);
  });

  it("ignores minor mistakes until serious ones tie, and keeps what's live", () => {
    const s = suggest(
      [
        row("Luna", "gpt-6-luna", { live: true, style: 4 }),
        row("Haiku", "claude-haiku-5-5", {
          style: 0,
          right: 24,
          fallback: true,
        }),
      ],
      checks,
    )!;
    expect(s.live.key).toBe("Luna");
    expect(s.same).toBe(true);
  });

  it("doesn't switch for a difference too small to tell from noise", () => {
    const s = suggest(
      [
        row("Low", "gpt-6.1-sol", {
          live: true,
          right: 24,
          cost: 0.002,
          ms: 5700,
        }),
        row("Default", "gpt-6.1-sol", { right: 25, cost: 0.003, ms: 8100 }),
        {
          ...row("Sonnet", "claude-sonnet-5-5", { right: 21, fallback: true }),
          vsLive: "WORSE" as const,
        },
      ],
      checks,
    )!;
    expect(s.live.key).toBe("Low");
    // A fallback needn't beat live.
    expect(s.fallback?.key).toBe("Sonnet");
    expect(s.same).toBe(true);
  });

  it("never suggests a lower score, and names the one to watch", () => {
    // From a real suite: Sol had fewer serious mistakes but scored
    // far lower than live; GPT-4o scored higher but within noise.
    const s = suggest(
      [
        row("Luna", "gpt-6-luna", { live: true, right: 11, rule: 1 }),
        row("Sol", "gpt-6.1-sol", { right: 7, rule: 0 }),
        row("4o", "gpt-4o", { right: 18, rule: 1 }),
        row("Haiku", "claude-haiku-5-5", { right: 9, rule: 2 }),
        row("Sonnet", "claude-sonnet-5-5", { right: 10, rule: 0 }),
      ],
      checks,
    )!;
    expect(s.live.key).toBe("Luna");
    expect(s.keepLive).toBe(true);
    // GPT-4o scored highest, but it's retiring: never suggested or watched.
    expect(s.reasons.join(" ")).not.toMatch(/4o/);
    // Fallback by accuracy first.
    expect(s.fallback?.key).toBe("Sonnet");
  });

  it("switches for a clearly cheaper model only when the suite favors cost", () => {
    const rows = [
      row("Big", "gpt-6.1-sol", { live: true, cost: 0.02, ms: 2000 }),
      row("Small", "gpt-6-luna", { cost: 0.01, ms: 4000 }),
    ];
    const cost = suggest(rows, checks, { favor: "cost" })!;
    expect(cost.live.key).toBe("Small");
    expect(cost.reasons[0]).toMatch(/50% less per answer/);
    expect(suggest(rows, checks, { favor: "speed" })!.keepLive).toBe(true);
    expect(suggest(rows, checks, { favor: "quality" })!.keepLive).toBe(true);
  });

  it("switches for a clearly faster model only when the suite favors speed", () => {
    const rows = [
      row("Slow", "gpt-6.1-sol", { live: true, cost: 0.01, ms: 8000 }),
      row("Quick", "gpt-6-luna", { cost: 0.02, ms: 3000 }),
    ];
    expect(suggest(rows, checks, { favor: "speed" })!.live.key).toBe("Quick");
    expect(suggest(rows, checks, { favor: "cost" })!.keepLive).toBe(true);
  });

  it("rules out models over the time limit, live included", () => {
    const s = suggest(
      [
        row("Slow", "gpt-6.1-sol", { live: true, ms: 9000 }),
        row("Quick", "gpt-6-luna", { right: 22, ms: 2000 }),
        row("Haiku", "claude-haiku-5-5", { right: 20, ms: 1500 }),
      ],
      checks,
      { favor: "speed", maxSeconds: 4 },
    )!;
    expect(s.live.key).toBe("Quick");
    expect(s.reasons[0]).toMatch(/9\.0s, over this suite's 4s limit/);
  });

  it("replaces a retiring live model", () => {
    const s = suggest(
      [
        row("4o", "gpt-4o", { live: true, right: 25 }),
        row("Luna", "gpt-6-luna", { right: 20 }),
        row("Haiku", "claude-haiku-5-5", { right: 22 }),
      ],
      checks,
    )!;
    expect(s.live.key).toBe("Haiku");
    expect(s.reasons[0]).toMatch(/GPT-4o|4o retires in January 2027/);
    expect(s.fallback?.key).toBe("Luna");
  });

  it("trades a little accuracy for half the cost, only when the suite favors cost", () => {
    // From a real suite: Sol live at 88%, Luna 82% and ~95% cheaper.
    const rows = [
      row("Sol", "gpt-6.1-sol", { live: true, right: 22, cost: 0.013 }),
      row("Luna", "gpt-6-luna", { right: 20, cost: 0.00072 }),
      row("Sonnet", "claude-sonnet-5-5", {
        right: 21,
        cost: 0.023,
        fallback: true,
      }),
    ];
    const s = suggest(rows, checks, { favor: "cost" })!;
    expect(s.live.key).toBe("Luna");
    expect(s.reasons[0]).toMatch(/about as accurate as Sol \(80% against 88%/);
    expect(s.reasons[0]).toMatch(/94% less per answer/);
    expect(suggest(rows, checks, { favor: "quality" })!.keepLive).toBe(true);
    // Saving time doesn't count for a cost suite.
    expect(suggest(rows, checks, { favor: "speed" })!.keepLive).toBe(true);
  });

  it("doesn't trade when the drop is large, serious mistakes rise, or the gap is clear", () => {
    const live = row("Sol", "gpt-6.1-sol", {
      live: true,
      right: 22,
      cost: 0.013,
    });
    const cheap = { right: 20, cost: 0.001 };
    const cost = { favor: "cost" as const };
    // More than 10 points lower.
    expect(
      suggest(
        [live, row("Luna", "gpt-6-luna", { ...cheap, right: 18 })],
        checks,
        cost,
      )!.keepLive,
    ).toBe(true);
    // More serious mistakes.
    expect(
      suggest(
        [live, row("Luna", "gpt-6-luna", { ...cheap, rule: 1 })],
        checks,
        cost,
      )!.keepLive,
    ).toBe(true);
    // Clearly less accurate.
    expect(
      suggest(
        [
          live,
          { ...row("Luna", "gpt-6-luna", cheap), vsLive: "WORSE" as const },
        ],
        checks,
        cost,
      )!.keepLive,
    ).toBe(true);
    // Cheaper, but not by half.
    expect(
      suggest(
        [live, row("Luna", "gpt-6-luna", { right: 20, cost: 0.008 })],
        checks,
        cost,
      )!.keepLive,
    ).toBe(true);
  });

  it("prefers a model that scores as well over a trade-off", () => {
    const s = suggest(
      [
        row("Sol", "gpt-6.1-sol", { live: true, right: 22, cost: 0.013 }),
        row("Luna", "gpt-6-luna", { right: 20, cost: 0.0007 }),
        row("Haiku", "claude-haiku-5-5", { right: 22, cost: 0.0014 }),
      ],
      checks,
      { favor: "cost" },
    )!;
    expect(s.live.key).toBe("Haiku");
  });

  it("trades a little accuracy for half the time when the suite favors speed", () => {
    const s = suggest(
      [
        row("Slow", "claude-sonnet-5-5", { live: true, right: 22, ms: 9000 }),
        row("Quick", "claude-haiku-5-5", { right: 21, ms: 3000 }),
      ],
      checks,
      { favor: "speed" },
    )!;
    expect(s.live.key).toBe("Quick");
    expect(s.reasons[0]).toMatch(
      /3\.0s against 9\.0s\. This suite favors speed/,
    );
  });

  it("never suggests a live-only model as the fallback", () => {
    const s = suggest(
      [
        row("Luna", "gpt-6-luna", { live: true }),
        { ...row("Classifier", "classifier-1", { right: 25 }), liveOnly: true },
        row("Haiku", "claude-haiku-5-5", { right: 22 }),
      ],
      checks,
    )!;
    expect(s.fallback?.key).toBe("Haiku");
  });

  it("never suggests a fallback-only model as live", () => {
    const s = suggest(
      [
        row("Luna", "gpt-6-luna", { live: true, right: 20 }),
        {
          ...row("Stand-in", "claude-haiku-5-5", { right: 25 }),
          fallbackOnly: true,
          vsLive: "BETTER" as const,
        },
      ],
      checks,
    )!;
    expect(s.live.key).toBe("Luna");
    expect(s.fallback?.key).toBe("Stand-in");
  });

  it("leaves out tests with failed answers", () => {
    const broken = row("Sol", "gpt-6.1-sol", { right: 25, cost: 0.001 });
    broken.test!.failedAnswers = 26;
    const s = suggest(
      [row("Luna", "gpt-6-luna", { live: true, right: 20 }), broken],
      checks,
      { favor: "cost" },
    )!;
    expect(s.live.key).toBe("Luna");
    expect(s.fallback?.key ?? null).toBeNull();
  });

  it("leaves out stale tests and models worse than live", () => {
    const worse = { ...row("Bad", "gpt-4o"), vsLive: "WORSE" as const };
    const s = suggest(
      [row("Live", "gpt-6-luna", { live: true, rule: 5 }), worse],
      checks,
    )!;
    expect(s.live.key).toBe("Live");
  });
});
