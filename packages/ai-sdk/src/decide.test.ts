import { describe, expect, it } from "vitest";
import type { Experimental_DecisionModel } from "ai";
import { decisionCheck } from "evalkeeper";
import { decideAndPrice } from "./decide.js";

/** A decision model that answers from a fixed result, through the real SDK path. */
function fakeDecisionModel(
  answers: Record<string, unknown>,
  usage = { inputTokens: 1_000_000, outputTokens: 0 },
): Experimental_DecisionModel {
  return {
    specificationVersion: "v4",
    provider: "fake",
    modelId: "fake-decider",
    supportedQuestionTypes: ["choice", "boolean", "score"],
    doDecide: async () => ({ answers, usage, warnings: [] }),
  } as unknown as Experimental_DecisionModel;
}

const MODELS = {
  "fake-decider": {
    label: "Fake",
    provider: "fake",
    inputPer1M: 0.05,
    outputPer1M: 0.05,
  },
};

describe("decideAndPrice", () => {
  it("returns typed answers, reports the cost, and grades with decisionCheck", async () => {
    let spent = 0;
    const r = await decideAndPrice({
      model: fakeDecisionModel({
        queue: {
          type: "choice",
          choice: "bug",
          probabilities: { bug: 0.9, billing: 0.1 },
        },
        urgent: { type: "boolean", probability: 0.2 },
      }),
      modelId: "fake-decider",
      models: MODELS,
      state: "The board is blank.",
      questions: {
        queue: {
          type: "choice",
          criteria: { bug: "Broken", billing: "Charges" },
        },
        urgent: { type: "boolean", instructions: "Can people not work?" },
      },
      onCost: (u) => (spent += u),
    });
    expect(r.answers.queue.choice).toBe("bug");
    expect(spent).toBeCloseTo(0.05);
    expect(decisionCheck("queue", r.answers.queue, "bug").pass).toBe(true);
    expect(decisionCheck("urgent", r.answers.urgent, true)).toMatchObject({
      pass: false,
      note: "Expected true, got 20% true",
    });
  });
});
