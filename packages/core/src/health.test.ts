import { describe, expect, it } from "vitest";
import { suiteHealth } from "./health";
import type { BoardRow } from "./board";
import type { CheckDef } from "./types";

const checks: CheckDef[] = [
  {
    key: "rule",
    label: "Rule",
    description: "",
    kind: "code",
    severity: "serious",
  },
];
const row = (
  key: string,
  model: string,
  { live = false, passed = 25, right = 25, stale = false, tested = true } = {},
): BoardRow => ({
  key,
  model,
  effort: null,
  variant: false,
  label: key,
  live,
  fallback: false,
  testing: false,
  failed: null,
  estCostPerAnswer: null,
  test: tested
    ? {
        runId: key,
        at: new Date(),
        right,
        total: 25,
        answersRight: right,
        answers: 25,
        byCheck: {
          rule: { passed, n: 25, rate: passed / 25, low: null, high: null },
        },
        avgMs: 2000,
        costPerAnswer: 0.01,
        stale,
        failedAnswers: 0,
        failureReason: null,
      }
    : null,
  vsLive: live ? null : "SAME",
  canMakeLive: !live,
  canMakeFallback: false,
  liveOnly: false,
  fallbackOnly: false,
});
const quality = { favor: "quality" as const };

describe("suiteHealth", () => {
  it("says when the live model isn't tested, or its test is out of date", () => {
    const rows = [row("Luna", "gpt-6-luna", { live: true, tested: false })];
    expect(suiteHealth(rows, checks, quality, 30).status).toBe("untested");
    const stale = [row("Luna", "gpt-6-luna", { live: true, stale: true })];
    expect(suiteHealth(stale, checks, quality, 30).status).toBe("stale");
  });

  it("puts too few cases first, with what's under the bar after", () => {
    const rows = [
      row("Luna", "gpt-6-luna", { live: true, passed: 20 }),
      row("Haiku", "claude-haiku-5-5", { passed: 20 }),
    ];
    const h = suiteHealth(rows, checks, quality, 12);
    expect(h.status).toBe("few");
    expect(h.details[0]).toMatch(/12 of 50 cases/);
    expect(h.details[1]).toMatch(/Rule: 80%, under the 95% bar \(serious\)/);
  });

  it("shows room to improve when live misses a bar", () => {
    const rows = [
      row("Luna", "gpt-6-luna", { live: true, passed: 20 }),
      row("Haiku", "claude-haiku-5-5", { passed: 20 }),
    ];
    const h = suiteHealth(rows, checks, quality, 60);
    expect(h.status).toBe("improve");
  });

  it("is good so far under 50 cases, and in good shape from 50", () => {
    const rows = [
      row("Luna", "gpt-6-luna", { live: true }),
      row("Haiku", "claude-haiku-5-5", { right: 24 }),
    ];
    // Haiku is already the fallback, so nothing changes.
    rows[1].fallback = true;
    expect(suiteHealth(rows, checks, quality, 30).status).toBe("fair");
    expect(suiteHealth(rows, checks, quality, 60).status).toBe("good");
  });

  it("asks for a second model when only one is tested", () => {
    const rows = [row("Luna", "gpt-6-luna", { live: true })];
    expect(suiteHealth(rows, checks, quality, 60).details.join(" ")).toMatch(
      /Only one model tested/,
    );
  });

  it("says when answers are provisional, first", () => {
    const rows = [
      row("Luna", "gpt-6-luna", { live: true }),
      row("Haiku", "claude-haiku-5-5", { right: 24 }),
    ];
    const h = suiteHealth(rows, checks, quality, 30, 12);
    expect(h.details[0]).toMatch(/12 of 30 answers are provisional/);
  });
});
