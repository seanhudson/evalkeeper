import { describe, expect, it } from "vitest";
import { orderRows, priorityGain } from "./order.js";
import type { BoardRow } from "./board.js";
import type { CheckDef } from "./types.js";

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
  {
    live = false,
    passed = 25,
    right = 25,
    cost = 0.01,
    ms = 2000,
    tested = true,
  } = {},
): BoardRow => ({
  key,
  model: key,
  effort: null,
  variant: false,
  label: key,
  live,
  fallback: false,
  baseline: false,
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
        answersNoSerious: passed,
        measures: {},
        byCheck: {
          rule: { passed, n: 25, rate: passed / 25, low: null, high: null },
        },
        avgMs: ms,
        costPerAnswer: cost,
        stale: false,
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

describe("orderRows", () => {
  it("puts the suggestion and live first, then fewest serious mistakes", () => {
    const rows = [
      row("untested", { tested: false }),
      row("sloppy", { passed: 20, cost: 0.0001 }),
      row("live", { live: true }),
      row("careful", { right: 24 }),
      row("cheap"),
    ];
    const keys = (r: BoardRow[]) => r.map((x) => x.key);
    expect(keys(orderRows(rows, checks, { favor: "cost" }))).toEqual([
      "live",
      "cheap",
      "careful",
      "sloppy",
      "untested",
    ]);
    expect(
      keys(orderRows(rows, checks, { favor: "cost" }, { live: "cheap" })),
    ).toEqual(["cheap", "live", "careful", "sloppy", "untested"]);
  });

  it("breaks ties by the suite's priority, never accuracy", () => {
    const rows = [row("slow", { ms: 9000 }), row("fast", { ms: 1000 })];
    expect(
      orderRows(rows, checks, { favor: "speed" }).map((r) => r.key),
    ).toEqual(["fast", "slow"]);
  });
});

describe("priorityGain", () => {
  it("says how much cheaper or faster, from 1.5 times", () => {
    const live = row("live", { live: true, cost: 0.04, ms: 4000 });
    expect(
      priorityGain(row("a", { cost: 0.01 }), live, { favor: "cost" }),
    ).toBe("4× cheaper");
    expect(priorityGain(row("b", { ms: 1600 }), live, { favor: "speed" })).toBe(
      "2.5× faster",
    );
    expect(
      priorityGain(row("c", { cost: 0.03 }), live, { favor: "cost" }),
    ).toBeNull();
    expect(priorityGain(row("d"), live, { favor: "quality" })).toBeNull();
  });
});
