import { describe, expect, it } from "vitest";
import { attention } from "./attention.js";
import type { BoardRow } from "./board.js";

const row = (
  label: string,
  {
    live = false,
    right = 9,
    ms = 2000,
    cost = 0.01,
    stale = false,
    failed = 0,
    baseline = false,
  } = {},
) =>
  ({
    label,
    live,
    baseline,
    test: {
      right,
      total: 10,
      avgMs: ms,
      costPerAnswer: cost,
      stale,
      failedAnswers: failed,
    },
  }) as unknown as BoardRow;

describe("attention", () => {
  it("finds the weakest suite by its best model, and the slowest and costliest live", () => {
    const a = attention([
      {
        key: "a",
        label: "A",
        toReview: 3,
        rows: [
          row("L", { live: true, right: 7, ms: 9000 }),
          row("S", { right: 8 }),
        ],
      },
      {
        key: "b",
        label: "B",
        toReview: 10,
        rows: [row("L", { live: true, right: 9, cost: 0.2 })],
      },
    ]);
    expect(a.improve).toMatchObject({ key: "a", best: 0.8, model: "S" });
    expect(a.slowest).toMatchObject({ key: "a", ms: 9000 });
    expect(a.costliest).toMatchObject({ key: "b", usd: 0.2 });
    expect(a.review).toMatchObject({ total: 13, key: "b", most: 10 });
  });

  it("judges a suite by its best model, not its baseline", () => {
    const a = attention([
      {
        key: "a",
        label: "A",
        toReview: 0,
        rows: [
          row("L", { live: true, right: 6 }),
          row("Code", { right: 10, baseline: true }),
        ],
      },
    ]);
    expect(a.improve).toMatchObject({ best: 0.6, model: "L" });
  });

  it("ignores stale and incomplete tests", () => {
    const a = attention([
      {
        key: "a",
        label: "A",
        toReview: 0,
        rows: [
          row("L", { live: true, right: 1, stale: true }),
          row("X", { right: 2, failed: 3 }),
        ],
      },
    ]);
    expect(a.improve).toBeNull();
    expect(a.slowest).toBeNull();
    expect(a.review.key).toBeNull();
  });
});
