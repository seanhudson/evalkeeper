import { describe, expect, it } from "vitest";
import {
  bootstrapMean,
  compareRuns,
  verdictFor,
  verdictSentence,
  type RunOutput,
} from "./compare";

const out = (
  caseId: string,
  pass: boolean,
  extra: Partial<RunOutput> = {},
): RunOutput => ({
  caseId,
  checks: [{ key: "a", pass }],
  costUsd: 0.01,
  ms: 1000,
  reused: false,
  ...extra,
});

describe("bootstrapMean", () => {
  it("is reproducible and brackets the mean", () => {
    const diffs = [0, 0, 1, 0, 1, 0, 0, 1, 0, 0];
    const a = bootstrapMean(diffs);
    expect(bootstrapMean(diffs)).toEqual(a);
    expect(a.mean).toBeCloseTo(0.3);
    expect(a.low).toBeLessThanOrEqual(0.3);
    expect(a.high).toBeGreaterThanOrEqual(0.3);
    // 3 of 10 improved can't rule out none: 0.7^10 ≈ 2.8% of resamples
    // have no improvement, more than the 2.5% tail. Small samples, wide ranges.
    expect(a.low).toBe(0);
  });
});

describe("verdictFor", () => {
  it("reads the verdict off the range", () => {
    expect(verdictFor(20, 0.02, 0.2)).toBe("BETTER");
    expect(verdictFor(20, -0.2, -0.01)).toBe("WORSE");
    expect(verdictFor(20, -0.05, 0.1)).toBe("SAME");
    expect(verdictFor(3, 0.5, 0.9)).toBe("TOO_FEW");
  });
});

describe("compareRuns", () => {
  const ids = Array.from({ length: 20 }, (_, i) => `c${i}`);

  it("calls a clear, consistent improvement better, and lists what changed", () => {
    // Champion fails 8 of 20; the challenger fixes all 8 and breaks none.
    const champion = ids.map((id, i) => out(id, i >= 8));
    const challenger = ids.map((id) => out(id, true, { costUsd: 0.005 }));
    const c = compareRuns(champion, challenger, ["a"]);
    expect(c.n).toBe(20);
    expect(c.verdict).toBe("BETTER");
    expect(c.fixed).toHaveLength(8);
    expect(c.broke).toHaveLength(0);
    expect(c.byCheck.a.challenger.rate).toBe(1);
    expect(verdictSentence(c, "Model B")).toMatch(
      /Model B is better.*50% less/,
    );
  });

  it("says no clear difference when changes go both ways", () => {
    const champion = ids.map((id, i) => out(id, i % 2 === 0));
    const challenger = ids.map((id, i) => out(id, i % 2 === 1));
    const c = compareRuns(champion, challenger, ["a"]);
    expect(c.verdict).toBe("SAME");
    expect(c.fixed).toHaveLength(10);
    expect(c.broke).toHaveLength(10);
  });

  it("only compares cases both runs have, and ignores reused outputs for cost", () => {
    const champion = ids.slice(0, 4).map((id) => out(id, true));
    const challenger = [
      ...ids
        .slice(0, 4)
        .map((id) => out(id, true, { reused: true, costUsd: 0 })),
      out("other", false),
    ];
    const c = compareRuns(champion, challenger, ["a"]);
    expect(c.n).toBe(4);
    expect(c.verdict).toBe("TOO_FEW");
    expect(c.cost.challenger).toBeCloseTo(0.01);
  });
});

describe("comparing by parts right", () => {
  it("weighs long cases by their parts, like the headline", () => {
    const units = (caseId: string, right: number, total: number) => ({
      caseId,
      checks: [{ key: "f", pass: right === total, units: { right, total } }],
      costUsd: 0,
      ms: 1,
      reused: false,
    });
    // 10 short cases both get right; 10 long ones where b gets 2 more of 9.
    const a = [
      ...Array.from({ length: 10 }, (_, i) => units(`s${i}`, 1, 1)),
      ...Array.from({ length: 10 }, (_, i) => units(`l${i}`, 6, 9)),
    ];
    const b = [
      ...Array.from({ length: 10 }, (_, i) => units(`s${i}`, 1, 1)),
      ...Array.from({ length: 10 }, (_, i) => units(`l${i}`, 8, 9)),
    ];
    const c = compareRuns(a, b, ["f"]);
    expect(c.mean).toBeCloseTo(20 / 100);
    expect(c.verdict).toBe("BETTER");
  });
});
