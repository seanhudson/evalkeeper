import { describe, expect, it } from "vitest";
import type { ThumbsSummary } from "./feedback";
import type { ModelCatalog } from "./models";
import type { RunMetrics, RunRecord } from "./store";
import { SCHEDULED, headline, weeklySummary } from "./weekly";

const DAY = 86_400_000;
const today = new Date("2026-10-20T12:00:00Z");
const MODELS: ModelCatalog = {
  live: { label: "Live", provider: "acme" },
  old: { label: "Old", provider: "acme", retiring: "2026-12" },
  later: { label: "Later", provider: "other", retiring: "2027-06" },
};
const SUITES = [
  { key: "triage", label: "Triage", operation: "triage" },
  { key: "summary", label: "Summary", operation: "summary" },
];

const metrics = (rate: number, costUsd = 0.01): RunMetrics =>
  ({
    allPass: {
      passed: Math.round(rate * 8),
      n: 8,
      rate,
      low: null,
      high: null,
    },
    units: null,
    costUsd,
  }) as unknown as RunMetrics;

let n = 0;
const run = (over: Partial<RunRecord>): RunRecord => ({
  id: `r${++n}`,
  suite: "triage",
  model: "live",
  promptVersion: "v1",
  reasoningEffort: null,
  set: "SMOKE",
  repeats: 1,
  datasetVersion: "d",
  graderVersion: "1",
  status: "SUCCEEDED",
  metrics: metrics(0.9),
  error: null,
  estimatedCostUsd: null,
  startedBy: SCHEDULED,
  startedAt: new Date(+today - 60_000),
  finishedAt: today,
  ...over,
});

const routes = {
  triage: { model: "live", fallbackModel: null },
  summary: { model: "live", fallbackModel: null },
};

describe("weeklySummary", () => {
  it("hasn't run before the first scheduled check", () => {
    const s = weeklySummary({
      runs: [run({ startedBy: "someone" })],
      suites: SUITES,
      routes,
      models: MODELS,
      today,
    });
    expect(s.lastAt).toBeNull();
    expect(s.clear).toBe(false);
  });

  it("flags drift against last week's check of the same model, instructions, and grading", () => {
    const lastWeek = run({
      startedAt: new Date(+today - 7 * DAY),
      metrics: metrics(0.9),
    });
    const now = run({ metrics: metrics(0.6) });
    const s = weeklySummary({
      runs: [now, lastWeek],
      suites: SUITES,
      routes,
      models: MODELS,
      today,
    });
    expect(s.drift).toEqual([
      {
        suite: "triage",
        label: "Triage",
        model: "Live",
        previous: 0.9,
        latest: 0.6,
      },
    ]);
    expect(s.clear).toBe(false);
  });

  it("doesn't call it drift when the instructions, grading, or model changed", () => {
    const now = run({ metrics: metrics(0.5) });
    for (const changed of [
      { promptVersion: "v0" },
      { graderVersion: "0" },
      { model: "old" },
    ]) {
      const lastWeek = run({
        startedAt: new Date(+today - 7 * DAY),
        ...changed,
      });
      expect(
        weeklySummary({
          runs: [now, lastWeek],
          suites: SUITES,
          routes,
          models: MODELS,
          today,
        }).drift,
      ).toEqual([]);
    }
  });

  it("ignores a small drop, and compares only with checks a day or more earlier", () => {
    const small = weeklySummary({
      runs: [
        run({ metrics: metrics(0.8) }),
        run({ startedAt: new Date(+today - 7 * DAY), metrics: metrics(0.9) }),
      ],
      suites: SUITES,
      routes,
      models: MODELS,
      today,
    });
    expect(small.drift).toEqual([]);
    const sameDay = weeklySummary({
      runs: [
        run({ metrics: metrics(0.5) }),
        run({ startedAt: new Date(+today - 3_600_000), metrics: metrics(0.9) }),
      ],
      suites: SUITES,
      routes,
      models: MODELS,
      today,
    });
    expect(sameDay.drift).toEqual([]);
  });

  it("lists quick sets that failed or are still running, and adds up the cost", () => {
    const s = weeklySummary({
      runs: [
        run({
          suite: "summary",
          status: "FAILED",
          error: "Out of credits",
          metrics: null,
        }),
        run({ status: "RUNNING", metrics: null }),
        run({ metrics: metrics(0.9, 0.25) }),
        // An older batch doesn't count.
        run({
          startedAt: new Date(+today - 7 * DAY),
          metrics: metrics(0.9, 5),
        }),
      ],
      suites: SUITES,
      routes,
      models: MODELS,
      today,
    });
    expect(s.failed).toEqual([
      { suite: "summary", label: "Summary", error: "Out of credits" },
    ]);
    expect(s.running).toBe(1);
    expect(s.costUsd).toBeCloseTo(0.25);
  });

  it("warns about live and fallback models retiring within 60 days", () => {
    const s = weeklySummary({
      runs: [run({})],
      suites: SUITES,
      routes: {
        triage: { model: "old", fallbackModel: "later" },
        summary: { model: "live", fallbackModel: "old" },
      },
      models: MODELS,
      today,
    });
    expect(s.retiring.map((r) => [r.suite, r.role, r.model, r.when])).toEqual([
      ["triage", "live", "Old", "December 2026"],
      ["summary", "fallback", "Old", "December 2026"],
    ]);
    expect(s.retiring[0]?.days).toBe(41);
  });

  it("shows only flagged thumbs, and is all clear when nothing needs a look", () => {
    const thumbs: ThumbsSummary[] = [
      {
        operation: "triage",
        up: 2,
        down: 4,
        downShare: 4 / 6,
        alert: true,
        open: 4,
      },
      {
        operation: "summary",
        up: 9,
        down: 1,
        downShare: 0.1,
        alert: false,
        open: 1,
      },
    ];
    const flagged = weeklySummary({
      runs: [run({})],
      suites: SUITES,
      routes,
      models: MODELS,
      thumbs,
      today,
    });
    expect(flagged.thumbs.map((t) => t.operation)).toEqual(["triage"]);
    const clear = weeklySummary({
      runs: [run({})],
      suites: SUITES,
      routes,
      models: MODELS,
      today,
    });
    expect(clear.clear).toBe(true);
  });

  it("scores with partial credit when a suite gives it", () => {
    expect(headline({ ...metrics(0.5), units: { right: 3, total: 4 } })).toBe(
      0.75,
    );
    expect(headline(metrics(0.5))).toBe(0.5);
    expect(headline(null)).toBeNull();
  });
});
