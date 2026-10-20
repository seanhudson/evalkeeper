import { describe, expect, it } from "vitest";
import { cleanPairs } from "./judge";
import { instructionsHash, promptHash, slot } from "./hash";
import { z } from "zod";

describe("cleanPairs", () => {
  it("keeps valid one-to-one pairs only", () => {
    expect(
      cleanPairs(
        [
          { expected: 0, actual: 1, why: "same" },
          { expected: 0, actual: 0, why: "dup expected" },
          { expected: 1, actual: 1, why: "dup actual" },
          { expected: 5, actual: 0, why: "out of range" },
          { expected: 1, actual: 0, why: "ok" },
        ],
        2,
        2,
      ).map((p) => p.why),
    ).toEqual(["same", "ok"]);
  });
});

describe("instructionsHash", () => {
  it("changes when a schema description does", () => {
    const a = instructionsHash({
      texts: ["Summarize", slot("ticket")],
      schemas: [z.object({ summary: z.string().describe("One line") })],
    });
    const b = instructionsHash({
      texts: ["Summarize", slot("ticket")],
      schemas: [z.object({ summary: z.string().describe("Two lines") })],
    });
    expect(a).not.toBe(b);
    expect(promptHash("x")).toHaveLength(8);
  });
});
