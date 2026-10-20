import { describe, expect, it } from "vitest";
import { suiteMetrics, wilson } from "./stats.js";

describe("wilson", () => {
  it("is honest about small samples", () => {
    const small = wilson(9, 10);
    expect(small.rate).toBe(0.9);
    expect(small.low!).toBeLessThan(0.65);
    const big = wilson(900, 1000);
    expect(big.low!).toBeGreaterThan(0.87);
    expect(wilson(0, 0).rate).toBeNull();
  });
});

describe("suiteMetrics", () => {
  const pass = { key: "a", pass: true };
  const fail = { key: "a", pass: false };
  const na = { key: "b", pass: null };

  it("counts pass rates per check, failures, and consistency across repeats", () => {
    const m = suiteMetrics(
      [
        {
          caseId: "1",
          repeat: 1,
          checks: [pass, na],
          costUsd: 0.01,
          ms: 100,
          reused: false,
        },
        {
          caseId: "1",
          repeat: 2,
          checks: [fail, na],
          costUsd: 0.01,
          ms: 300,
          reused: false,
        },
        {
          caseId: "2",
          repeat: 1,
          checks: [pass, na],
          costUsd: 0,
          ms: 0,
          reused: true,
        },
        {
          caseId: "2",
          repeat: 2,
          checks: [pass, na],
          costUsd: 0,
          ms: 0,
          reused: true,
        },
        {
          caseId: "3",
          repeat: 1,
          checks: null,
          costUsd: 0,
          ms: 50,
          reused: false,
        },
      ],
      ["a", "b"],
    );
    expect(m.cases).toBe(3);
    expect(m.failed).toBe(1);
    expect(m.byCheck.a).toMatchObject({ passed: 3, n: 4 });
    expect(m.byCheck.b!.n).toBe(0);
    // Case 1 passed once and failed once; case 2 passed both times.
    expect(m.consistency).toMatchObject({ passed: 1, n: 2 });
    expect(m.allPass).toMatchObject({ passed: 3, n: 5 });
    expect(m.reused).toBe(2);
    // Time and cost per answer: answers with a recorded time only.
    expect(m.avgMs).toBe(200);
    expect(m.costPerAnswer).toBeCloseTo(0.01);
    expect(m.costUsd).toBeCloseTo(0.02);
  });
});
