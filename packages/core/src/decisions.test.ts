import { describe, expect, it } from "vitest";
import {
  calibrationError,
  decisionCheck,
  meanCalibrationError,
  probabilityQuality,
  scoreDecision,
} from "./decisions.js";
import { measuresFor, type ScoredOutput } from "./stats.js";

describe("scoreDecision", () => {
  it("scores a boolean by its threshold, with Brier and log loss", () => {
    const s = scoreDecision({ type: "boolean", probability: 0.8 }, true);
    expect(s.correct).toBe(true);
    expect(s.probabilityOfTruth).toBeCloseTo(0.8);
    expect(s.confidence).toBeCloseTo(0.8);
    expect(s.brier).toBeCloseTo(0.04);
    expect(s.logLoss).toBeCloseTo(-Math.log(0.8));
    const miss = scoreDecision({ type: "boolean", probability: 0.8 }, false);
    expect(miss.correct).toBe(false);
    expect(miss.brier).toBeCloseTo(0.64);
    expect(
      scoreDecision({ type: "boolean", probability: 0.4 }, true, {
        threshold: 0.3,
      }).correct,
    ).toBe(true);
  });

  it("scores a choice over all its options, scaled to 0–1", () => {
    const s = scoreDecision(
      {
        type: "choice",
        choice: "bug",
        probabilities: { bug: 0.7, billing: 0.2, other: 0.1 },
      },
      "bug",
    );
    expect(s.correct).toBe(true);
    // (0.3² + 0.2² + 0.1²) / 2
    expect(s.brier).toBeCloseTo(0.07);
    expect(s.confidence).toBeCloseTo(0.7);
    const sure = scoreDecision(
      { type: "choice", choice: "bug", probabilities: { bug: 1, billing: 0 } },
      "billing",
    );
    expect(sure.brier).toBeCloseTo(1);
    expect(sure.logLoss).toBeCloseTo(-Math.log(1e-4));
  });

  it("scores a choice with no distribution on correctness only (a prompted model)", () => {
    const s = scoreDecision({ type: "choice", choice: "bug" }, "bug");
    expect(s).toMatchObject({
      correct: true,
      brier: null,
      logLoss: null,
      confidence: null,
    });
  });

  it("scores a scale by its rounded level", () => {
    expect(scoreDecision({ type: "score", score: 1.6 }, 2).correct).toBe(true);
    expect(
      scoreDecision(
        { type: "score", score: 2.6, probabilities: { "2": 0.4, "3": 0.6 } },
        2,
      ),
    ).toMatchObject({
      correct: false,
      probabilityOfTruth: 0.4,
    });
  });

  it("counts a refusal as a miss with nothing measured", () => {
    expect(scoreDecision({ type: "refusal" }, true)).toMatchObject({
      correct: false,
      refused: true,
      brier: null,
    });
  });
});

describe("decisionCheck", () => {
  it("passes a right pick and carries its measures", () => {
    const c = decisionCheck(
      "queue",
      {
        type: "choice",
        choice: "bug",
        probabilities: { bug: 0.9, other: 0.1 },
      },
      "bug",
    );
    expect(c.pass).toBe(true);
    expect(c.measures).toMatchObject({ correct: 1, confidence: 0.9 });
    expect(c.measures?.brier).toBeCloseTo(0.01);
  });

  it("says what was expected and given", () => {
    expect(
      decisionCheck("urgent", { type: "boolean", probability: 0.2 }, true).note,
    ).toBe("Expected true, got 20% true");
    expect(
      decisionCheck(
        "queue",
        { type: "choice", choice: "feature_request" },
        "bug",
        { describe: (v) => String(v).replace(/_/g, " ") },
      ).note,
    ).toBe("Expected bug, got feature request");
    expect(decisionCheck("q", { type: "refusal" }, "bug").note).toMatch(
      /refused/,
    );
  });

  it("doesn't apply without a right answer, and fails a missing answer", () => {
    expect(
      decisionCheck("q", { type: "boolean", probability: 1 }, undefined).pass,
    ).toBeNull();
    expect(decisionCheck("q", undefined, true)).toMatchObject({
      pass: false,
      measures: { correct: 0 },
    });
  });
});

describe("calibrationError", () => {
  it("is 0 when how sure matches how often right, and grows when overconfident", () => {
    const honest = [
      ...Array.from({ length: 8 }, () => ({ confidence: 0.8, correct: true })),
      ...Array.from({ length: 2 }, () => ({ confidence: 0.8, correct: false })),
    ];
    expect(calibrationError(honest)).toBeCloseTo(0);
    const overconfident = honest.map((a) => ({ ...a, confidence: 0.99 }));
    expect(calibrationError(overconfident)).toBeCloseTo(0.19);
    expect(calibrationError([])).toBeNull();
  });
});

describe("measures across a test", () => {
  it("averages each measure and computes the calibration error", () => {
    const out = (
      brier: number,
      confidence: number,
      correct: number,
    ): ScoredOutput => ({
      caseId: `c${brier}`,
      repeat: 1,
      checks: [
        {
          key: "queue",
          pass: correct === 1,
          measures: { brier, confidence, correct },
        },
      ],
      costUsd: 0,
      ms: 1,
      reused: false,
    });
    const m = measuresFor([out(0.1, 0.9, 1), out(0.3, 0.9, 0)], "queue");
    expect(m?.n).toBe(2);
    expect(m?.mean.brier).toBeCloseTo(0.2);
    expect(m?.calibrationError).toBeCloseTo(0.4);
    expect(measuresFor([out(0.1, 0.9, 1)], "other")).toBeNull();
  });
});

describe("a test's probability summary", () => {
  it("averages Brier into quality and calibration over the checks that have them", () => {
    const measures = {
      queue: { n: 4, mean: { brier: 0.1 }, calibrationError: 0.2 },
      urgent: { n: 4, mean: { brier: 0.3 }, calibrationError: null },
      prompted: { n: 4, mean: { correct: 1 }, calibrationError: null },
    };
    expect(probabilityQuality(measures)).toBeCloseTo(0.8);
    expect(meanCalibrationError(measures)).toBeCloseTo(0.2);
    expect(
      probabilityQuality({
        q: { n: 1, mean: { correct: 1 }, calibrationError: null },
      }),
    ).toBeNull();
    expect(meanCalibrationError({})).toBeNull();
  });
});
