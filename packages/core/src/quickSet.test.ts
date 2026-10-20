import { describe, expect, it } from "vitest";
import { nextSplit, pickQuickSet } from "./quickSet.js";

const c = (id: string, tags: string[], confirmed = true, day = 1) => ({
  id,
  tags,
  confirmed,
  createdAt: new Date(2026, 9, day),
});

describe("pickQuickSet", () => {
  it("covers as many tags as it can, confirmed cases first", () => {
    const picked = pickQuickSet(
      [
        c("a", ["remote", "hedge"], true, 1),
        c("b", ["remote"], true, 2),
        c("c", ["academia"], true, 3),
        c("d", ["intern", "number"], false, 4),
        c("e", ["number"], true, 5),
      ],
      3,
    );
    expect(picked.map((p) => p.id)).toEqual(["a", "c", "e"]);
  });

  it("is stable and returns everything when there are few cases", () => {
    const cases = [c("x", []), c("y", [])];
    expect(pickQuickSet(cases).map((p) => p.id)).toEqual(["x", "y"]);
    expect(pickQuickSet(cases)).toEqual(pickQuickSet(cases));
  });
});

describe("nextSplit", () => {
  it("keeps about 40% of cases in TEST", () => {
    const counts = { DEV: 0, TEST: 0 };
    for (let i = 0; i < 50; i++) counts[nextSplit(counts)]++;
    expect(counts.TEST).toBe(20);
    expect(counts.DEV).toBe(30);
  });
});
