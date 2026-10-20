import { describe, expect, it } from "vitest";
import { z } from "zod";
import { CaseImportError, importCases, importStarters } from "./importCases.js";
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
    expect(first).toEqual({ added: 2, skipped: 0 });
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
    expect(again).toEqual({ added: 1, skipped: 2 });
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

describe("importStarters", () => {
  it("adds a suite's starters as pending drafts, once", async () => {
    const store = memoryStore();
    expect(await importStarters(store, shout)).toEqual({
      added: 2,
      skipped: 0,
    });
    expect(await importStarters(store, shout)).toEqual({
      added: 0,
      skipped: 2,
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
    });
  });
});
