import { describe, expect, it } from "vitest";
import { newStarters, stableJson } from "./stableJson.js";

describe("stableJson", () => {
  it("ignores key order at every depth, not array order", () => {
    expect(stableJson({ b: 1, a: { d: [2, 1], c: null } })).toBe(
      stableJson({ a: { c: null, d: [2, 1] }, b: 1 }),
    );
    expect(stableJson([1, 2])).not.toBe(stableJson([2, 1]));
  });

  it("finds drafts not yet added, however their keys were saved", () => {
    const starter = [
      { input: { who: "a", n: 1 } },
      { input: { who: "b", n: 2 } },
    ];
    expect(newStarters(starter, [{ input: { n: 1, who: "a" } }])).toEqual([
      starter[1],
    ]);
  });
});
