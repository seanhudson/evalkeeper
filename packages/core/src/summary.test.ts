import { describe, expect, it } from "vitest";
import { suiteMetrics } from "./stats.js";
import { confidenceFor, draftsToTarget, summarize } from "./summary.js";

const checks = [
  {
    key: "a",
    label: "Check A",
    description: "",
    kind: "code" as const,
    severity: "serious" as const,
  },
  {
    key: "b",
    label: "Check B",
    description: "",
    kind: "code" as const,
    severity: "serious" as const,
  },
];
const output = (caseId: string, a: boolean, b: boolean) => ({
  caseId,
  repeat: 1,
  checks: [
    { key: "a", pass: a },
    { key: "b", pass: b },
  ],
  costUsd: 0,
  ms: 0,
  reused: false,
});

describe("summarize", () => {
  it("says how many were right and warns when there are too few", () => {
    const s = summarize(
      suiteMetrics(
        [output("1", true, true), output("2", false, true)],
        ["a", "b"],
      ),
      checks,
    );
    expect(s).toMatchObject({ right: 1, total: 2 });
    expect(s.trust).toMatch(/too few to trust/);
    expect(s.problems).toEqual([
      { key: "a", label: "Check A", failed: 1, of: 2 },
    ]);
  });

  it("calls a larger result rough or solid, and orders problems", () => {
    const outs = Array.from({ length: 40 }, (_, i) =>
      output(String(i), i % 4 !== 0, i % 10 !== 0),
    );
    const s = summarize(suiteMetrics(outs, ["a", "b"]), checks);
    expect(s.total).toBe(40);
    expect(s.trust).toMatch(/rough|solid/i);
    expect(s.problems.map((p) => p.key)).toEqual(["a", "b"]);
  });
});

describe("confidenceFor", () => {
  it("narrows as cases grow", () => {
    expect(confidenceFor(10).level).toBe("too-few");
    expect(confidenceFor(29, 0.75)).toMatchObject({
      level: "rough",
      margin: 16,
    });
    expect(confidenceFor(60).level).toBe("good");
    expect(confidenceFor(200, 0.75)).toMatchObject({
      level: "strong",
      margin: 6,
    });
  });
});

describe("draftsToTarget", () => {
  it("fills the gap to 50, 10 to 30 at a time", () => {
    expect(draftsToTarget(29)).toBe(21);
    expect(draftsToTarget(0)).toBe(30);
    expect(draftsToTarget(48)).toBe(10);
  });
});
