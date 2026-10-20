import { describe, expect, it } from "vitest";
import {
  easyToRetire,
  isEasy,
  isSplit,
  isStaleDraft,
  nearDuplicates,
  tagCounts,
} from "./prune.js";

describe("pruning", () => {
  it("calls a case easy only when enough models all get it right", () => {
    expect(isEasy({ passed: 3, models: 3 })).toBe(true);
    expect(isEasy({ passed: 2, models: 2 })).toBe(false);
    expect(isEasy({ passed: 6, models: 7 })).toBe(false);
  });

  it("calls a case split when models divide about evenly", () => {
    expect(isSplit({ passed: 3, models: 6 })).toBe(true);
    expect(isSplit({ passed: 1, models: 6 })).toBe(false);
    expect(isSplit({ passed: 1, models: 2 })).toBe(false);
  });

  it("keeps a floor of easy cases, smoke cases first", () => {
    const d = (i: number) => new Date(2026, 0, i);
    const easy = [
      { id: "a", smoke: false, createdAt: d(1) },
      { id: "b", smoke: true, createdAt: d(5) },
      { id: "c", smoke: false, createdAt: d(2) },
      { id: "d", smoke: false, createdAt: d(3) },
    ];
    // 20 in use: keep 2 (b for smoke, then a, the oldest).
    expect(easyToRetire(easy, 20).map((c) => c.id)).toEqual(["c", "d"]);
  });

  it("finds near-duplicate inputs", () => {
    const text =
      "fully remote role leading product design for a healthcare startup in Denver";
    const pairs = nearDuplicates([
      { id: "1", input: { text } },
      { id: "2", input: { text: `${text} now` } },
      { id: "3", input: { text: "part-time bookkeeping at a nonprofit" } },
    ]);
    expect(pairs.map(([a, b]) => [a.id, b.id])).toEqual([["1", "2"]]);
  });

  it("flags drafts older than 30 days, and counts tags", () => {
    const today = new Date("2026-10-20");
    expect(isStaleDraft(new Date("2026-09-01"), today)).toBe(true);
    expect(isStaleDraft(new Date("2026-10-01"), today)).toBe(false);
    expect(tagCounts([{ tags: ["a", "b"] }, { tags: ["a"] }])).toEqual([
      ["a", 2],
      ["b", 1],
    ]);
  });
});
