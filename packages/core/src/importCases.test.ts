import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  CaseImportError,
  importCases,
  importStarters,
  leakNote,
  withoutLeaks,
} from "./importCases.js";
import { memoryStore } from "./memoryStore.js";
import type { Suite } from "./types.js";

const shout: Suite<{ text: string }, { text: string }, { want: string }> = {
  key: "shout",
  operation: "shout",
  priority: { favor: "quality" },
  label: "Shout",
  description: "Says the input in capitals.",
  graderVersion: "1",
  input: z.object({ text: z.string().min(1) }),
  labelValue: z.object({ want: z.string() }),
  checks: [],
  async run(input) {
    return { text: input.text.toUpperCase() };
  },
  async grade() {
    return [];
  },
  inputFromForm: () => ({ text: "" }),
  title: (i) => i.text,
  starter: [
    {
      input: { text: "hello" },
      label: { want: "HELLO" },
      tags: ["greeting"],
      split: "DEV",
      note: "Made up.",
    },
    {
      input: { text: "bye" },
      label: { want: "BYE" },
      tags: [],
      split: "TEST",
      note: "Made up.",
    },
  ],
};

type Row = { id: string; text: string; want?: string };
const map = (r: Row) => ({
  id: r.id,
  input: { text: r.text },
  label: r.want === undefined ? null : { want: r.want },
});

describe("importCases", () => {
  it("adds rows as drafts with pending answers, and skips them on a rerun", async () => {
    const store = memoryStore();
    const rows: Row[] = [
      { id: "a", text: "one", want: "ONE" },
      { id: "b", text: "two" },
    ];
    const first = await importCases({
      store,
      suite: shout,
      source: "dev.json",
      rows,
      map,
      split: "DEV",
    });
    expect(first).toEqual({ added: 2, skipped: 0, removed: [] });
    const cases = await store.listCases("shout");
    expect(cases.map((c) => [c.sourceRef, c.split, c.status])).toEqual([
      ["dev.json#a", "DEV", "DRAFT"],
      ["dev.json#b", "DEV", "DRAFT"],
    ]);
    expect(cases[0]?.labels[0]).toMatchObject({
      status: "PENDING",
      raterRole: "IMPORT",
      value: { want: "ONE" },
    });
    // No answer: no label, for a person to write.
    expect(cases[1]?.labels).toEqual([]);
    // A retired case isn't brought back on a rerun.
    await store.setCaseStatus(cases[0]?.id ?? "", "RETIRED");
    const again = await importCases({
      store,
      suite: shout,
      source: "dev.json",
      rows: [...rows, { id: "c", text: "three", want: "THREE" }],
      map,
      split: "DEV",
    });
    expect(again).toEqual({ added: 1, skipped: 2, removed: [] });
  });

  it("checks every row first, and writes nothing when one is bad", async () => {
    const store = memoryStore();
    const attempt = importCases({
      store,
      suite: shout,
      source: "bad.json",
      rows: [
        { id: "ok", text: "fine", want: "FINE" },
        { id: "empty", text: "" },
        { id: "ok", text: "again" },
        { id: "", text: "no id" },
      ] as Row[],
      map: (r) =>
        r.id === "ok" && r.text === "fine"
          ? { ...map(r), label: { want: 42 } }
          : map(r),
    });
    const error: unknown = await attempt.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CaseImportError);
    const problems = error instanceof CaseImportError ? error.problems : [];
    expect(problems.map((p) => p.id)).toEqual(["ok", "empty", "ok", "row 4"]);
    expect(problems.map((p) => p.problem)).toEqual([
      expect.stringMatching(/^answer:/),
      expect.stringMatching(/^input:/),
      "the same id as an earlier row",
      "no id",
    ]);
    expect(await store.listCases("shout", { includeRetired: true })).toEqual(
      [],
    );
  });

  it("reports a row the map throws on", async () => {
    await expect(
      importCases({
        store: memoryStore(),
        suite: shout,
        source: "x.json",
        rows: [{ id: "a", text: "x" }],
        map: () => {
          throw new Error("missing column");
        },
      }),
    ).rejects.toThrow(/row 1 \(missing column\)/);
  });

  it("splits a held-out file to TEST, and new cases like ones added by hand", async () => {
    const store = memoryStore();
    await importCases({
      store,
      suite: shout,
      source: "heldout.json",
      rows: [{ id: "h", text: "held", want: "HELD" }],
      map,
      split: "TEST",
    });
    const rows = Array.from({ length: 10 }, (_, i) => ({
      id: `n${i}`,
      text: `new ${i}`,
      want: `NEW ${i}`,
    }));
    await importCases({ store, suite: shout, source: "new.json", rows, map });
    const cases = await store.listCases("shout");
    expect(cases.find((c) => c.sourceRef === "heldout.json#h")?.split).toBe(
      "TEST",
    );
    const test = cases.filter((c) => c.split === "TEST").length;
    // About 40% held out across all of them, never all on one side.
    expect(test).toBeGreaterThanOrEqual(3);
    expect(test).toBeLessThanOrEqual(6);
  });

  it("imports provisional answers only as the owner allowed, tagged for review", async () => {
    const store = memoryStore();
    await importCases({
      store,
      suite: shout,
      source: "agent.json",
      rows: [
        { id: "a", text: "one", want: "ONE" },
        { id: "b", text: "two" },
      ],
      map,
      answers: {
        status: "PROVISIONAL",
        rater: "claude",
        allowedBy: "sam",
        at: new Date("2026-10-20T12:00:00Z"),
      },
    });
    const [a, b] = await store.listCases("shout");
    expect(a).toMatchObject({ status: "ACTIVE", tags: ["needs-review"] });
    expect(a?.labels[0]).toMatchObject({
      status: "PROVISIONAL",
      raterRole: "AGENT",
      raterId: "claude",
    });
    expect(a?.labels[0]?.note).toBe(
      "Drafted by claude; sam allowed testing on it before review (2026-10-20).",
    );
    // No answer to use: still a draft, and not in the review queue.
    expect(b).toMatchObject({ status: "DRAFT", tags: [] });
  });
});

describe("importCases with answers people already reviewed", () => {
  type Reviewed = Row & { reviewer?: string; reviewedAt?: string | Date };
  const reviewed = {
    status: "CONFIRMED" as const,
    confirmedBy: (r: Reviewed) => r.reviewer,
    at: (r: Reviewed) => r.reviewedAt,
  };

  it("imports them confirmed, recording who confirmed each and when", async () => {
    const store = memoryStore();
    const result = await importCases({
      store,
      suite: shout,
      source: "old-harness",
      rows: [
        {
          id: "a",
          text: "one",
          want: "ONE",
          reviewer: " pat ",
          reviewedAt: "2026-03-04T10:00:00Z",
        },
        {
          id: "b",
          text: "two",
          reviewer: "lee",
          reviewedAt: new Date("2026-05-06T10:00:00Z"),
        },
      ] satisfies Reviewed[],
      map,
      answers: reviewed,
    });
    expect(result).toEqual({ added: 2, skipped: 0, removed: [] });
    const [a, b] = await store.listCases("shout");
    expect(a).toMatchObject({ status: "ACTIVE", tags: [] });
    expect(a?.labels[0]).toMatchObject({
      status: "CONFIRMED",
      raterRole: "REVIEWER",
      raterId: "pat",
      value: { want: "ONE" },
      note: "Imported as reviewed from old-harness: pat confirmed it there on 2026-03-04.",
    });
    // No answer: nothing confirmed, still a draft.
    expect(b).toMatchObject({ status: "DRAFT", labels: [] });
  });

  it("refuses the import unless every row names a person and a date", async () => {
    const store = memoryStore();
    const attempt = importCases({
      store,
      suite: shout,
      source: "old-harness",
      rows: [
        {
          id: "ok",
          text: "fine",
          want: "FINE",
          reviewer: "pat",
          reviewedAt: "2026-01-02",
        },
        {
          id: "nobody",
          text: "x",
          want: "X",
          reviewer: "  ",
          reviewedAt: "2026-01-02",
        },
        { id: "undated", text: "y", want: "Y", reviewer: "pat" },
        {
          id: "garbled",
          text: "z",
          want: "Z",
          reviewer: "pat",
          reviewedAt: "soon",
        },
        {
          id: "future",
          text: "w",
          want: "W",
          reviewer: "pat",
          reviewedAt: "2999-01-01",
        },
      ] satisfies Reviewed[],
      map,
      answers: reviewed,
    });
    const error: unknown = await attempt.catch((e: unknown) => e);
    const problems = error instanceof CaseImportError ? error.problems : [];
    expect(problems).toEqual([
      { id: "nobody", problem: "no person who confirmed the answer" },
      { id: "undated", problem: "no date the answer was confirmed" },
      { id: "garbled", problem: "no date the answer was confirmed" },
      { id: "future", problem: "a confirmation date in the future" },
    ]);
    // Nothing written, not even the row that was fine.
    expect(await store.listCases("shout", { includeRetired: true })).toEqual(
      [],
    );
  });
});

describe("importCases with a leak check", () => {
  // Removes words the case learned from itself: anything after "|".
  const leaky: typeof shout = {
    ...shout,
    withoutLeaks: (input, { sourceRef }) => {
      const [kept = "", ...rest] = input.text.split("|");
      return {
        input: { text: kept },
        removed: rest.map((r) => `${r} (${sourceRef ?? "by hand"})`),
      };
    },
  };

  it("strips each input before freezing it, and reports what it removed per case", async () => {
    const store = memoryStore();
    const result = await importCases({
      store,
      suite: leaky,
      source: "app.json",
      rows: [
        { id: "a", text: "one|liked Acme", want: "ONE" },
        { id: "b", text: "two", want: "TWO" },
      ],
      map: (r) => ({ ...map(r), note: "From the app." }),
    });
    expect(result.removed).toEqual([
      { id: "a", removed: ["liked Acme (app.json#a)"] },
    ]);
    const [a, b] = await store.listCases("shout");
    expect(a?.input).toEqual({ text: "one" });
    expect(a?.note).toBe(
      "From the app. Removed before freezing, as learned from this case: liked Acme (app.json#a).",
    );
    expect(b?.note).toBe("From the app.");
    // A rerun skips them and reports nothing new.
    const again = await importCases({
      store,
      suite: leaky,
      source: "app.json",
      rows: [{ id: "a", text: "one|liked Acme", want: "ONE" }],
      map,
    });
    expect(again).toEqual({ added: 0, skipped: 1, removed: [] });
  });

  it("runs on starters too", async () => {
    const store = memoryStore();
    const result = await importStarters(store, {
      ...leaky,
      starter: [
        {
          input: { text: "hi|x" },
          label: { want: "HI" },
          tags: [],
          split: "DEV",
          note: "",
        },
      ],
    });
    expect(result.removed).toHaveLength(1);
    const [c] = await store.listCases("shout");
    expect(c?.input).toEqual({ text: "hi" });
  });

  it("refuses rows the leak check breaks or throws on", async () => {
    const attempt = importCases({
      store: memoryStore(),
      suite: leaky,
      source: "app.json",
      // Stripping everything leaves an empty text, which doesn't fit.
      rows: [{ id: "a", text: "|all of it" }],
      map,
    });
    await expect(attempt).rejects.toThrow(
      /a \(the leak check left an input that doesn't fit/,
    );
    await expect(
      importCases({
        store: memoryStore(),
        suite: {
          ...shout,
          withoutLeaks: () => {
            throw new Error("no profile");
          },
        },
        source: "app.json",
        rows: [{ id: "a", text: "x" }],
        map,
      }),
    ).rejects.toThrow(/a \(no profile\)/);
  });
});

describe("withoutLeaks", () => {
  it("returns the input as it was for a suite without a leak check", () => {
    expect(withoutLeaks(shout, { text: "x" }, null)).toEqual({
      input: { text: "x" },
      removed: [],
    });
  });

  it("says nothing when nothing was removed", () => {
    expect(leakNote([])).toBeNull();
    expect(leakNote(["a", "b"])).toBe(
      "Removed before freezing, as learned from this case: a; b.",
    );
  });
});

describe("importStarters", () => {
  it("adds a suite's starters as pending drafts, once", async () => {
    const store = memoryStore();
    expect(await importStarters(store, shout)).toEqual({
      added: 2,
      skipped: 0,
      removed: [],
    });
    expect(await importStarters(store, shout)).toEqual({
      added: 0,
      skipped: 2,
      removed: [],
    });
    const cases = await store.listCases("shout");
    expect(cases.map((c) => [c.split, c.tags, c.labels[0]?.status])).toEqual([
      ["DEV", ["greeting"], "PENDING"],
      ["TEST", [], "PENDING"],
    ]);
  });

  it("does nothing for a suite with no starters", async () => {
    const { starter: _starter, ...noStarters } = shout;
    expect(await importStarters(memoryStore(), noStarters)).toEqual({
      added: 0,
      skipped: 0,
      removed: [],
    });
  });
});
