import { describe, expect, it } from "vitest";
import {
  answerKeyHealth,
  easyToRetire,
  isEasy,
  isSplit,
  isStaleDraft,
  nearDuplicates,
  tagCounts,
  type CaseResult,
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

  describe("answer-key health", () => {
    // Inputs that share no words, so only the cases meant to be
    // near-duplicates are.
    const WORDS = [
      "",
      "apple banana",
      "cherry damson",
      "elder fig",
      "grape hazel",
      "iris juniper",
      "kiwi lemon",
      "mango nectar",
      "olive peach",
      "quince rowan",
      "sloe tamarind",
      "ugli vanilla",
      "walnut yarrow",
      "zest amber",
      "basil cumin",
      "dill fennel",
      "ginger hops",
      "indigo jasmine",
    ];
    const today = new Date("2026-10-20");
    const confirmed = [{ status: "CONFIRMED", updatedAt: today }];
    const kase = (
      id: string,
      o: {
        text?: string;
        tags?: string[];
        status?: string;
        labels?: { status: string; updatedAt: Date }[];
        createdAt?: Date;
      } = {},
    ) => ({
      id,
      input: { text: o.text ?? WORDS[Number(id)] },
      tags: o.tags ?? [],
      status: o.status ?? "ACTIVE",
      createdAt: o.createdAt ?? new Date(`2026-01-${id.padStart(2, "0")}`),
      labels: o.labels ?? confirmed,
    });

    it("sorts the answer key: easy with a floor, split, duplicates, old drafts, and tags", () => {
      const cases = [
        ...Array.from({ length: 12 }, (_, i) =>
          kase(String(i + 1), { tags: i < 2 ? ["billing"] : ["login"] }),
        ),
        kase("13", { text: "Refund my order from last Tuesday, please!" }),
        kase("14", { text: "refund my order from last tuesday please" }),
        kase("15", { labels: [], createdAt: new Date("2026-09-01") }),
        kase("16", {
          labels: [{ status: "PENDING", updatedAt: today }],
          createdAt: new Date("2026-10-15"),
        }),
        kase("17", { status: "RETIRED" }),
      ];
      const easy = { passed: 3, models: 3 };
      const results: Record<string, CaseResult> = {
        "1": easy,
        "2": easy,
        "3": easy,
        "4": easy,
        "5": { passed: 2, models: 4 },
        "6": { passed: 1, models: 4 },
        "17": easy,
      };
      const h = answerKeyHealth(cases, results, today);
      expect(h.inUse).toBe(14);
      expect(h.easy.map((c) => c.id)).toEqual(["1", "2", "3", "4"]);
      // 14 in use keeps 2 easy cases as a floor, quick-set cases first.
      expect(h.easyToRetire).toHaveLength(2);
      expect(h.split.map((c) => c.id)).toEqual(["5"]);
      expect(h.duplicates.map(([a, b]) => [a.id, b.id])).toEqual([
        ["13", "14"],
      ]);
      expect(h.staleDrafts.map((c) => c.id)).toEqual(["15"]);
      expect(h.tags).toEqual([
        ["login", 10],
        ["billing", 2],
      ]);
    });

    it("needs nothing when every case still tells models apart", () => {
      const h = answerKeyHealth([kase("1"), kase("2")], {}, today);
      expect(h).toMatchObject({
        inUse: 2,
        easy: [],
        easyToRetire: [],
        split: [],
        duplicates: [],
        staleDrafts: [],
      });
    });
  });
});
