import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  ACTIVITY_DRAFTS_PER_WEEK,
  ACTIVITY_SOURCE,
  ACTIVITY_TAG,
  draftFromActivity,
} from "./activity.js";
import { memoryStore } from "./memoryStore.js";
import type { ActivityDraft, Suite } from "./types.js";

type Input = { text: string };
type Label = { want: string };

const DAY = 86_400_000;
// The memory store stamps cases with the real time, so weeks count from now.
const today = new Date();

/** A suite whose activity is the list given; it records what it was asked. */
function suiteWith(activity: ActivityDraft<Input, Label>[]) {
  const asked: {
    since: Date;
    limit: number;
    known: ReadonlySet<string>;
    existing: { input: Input; tags: string[] }[];
  }[] = [];
  const suite: Suite<Input, Input, Label> = {
    key: "echo",
    operation: "echo",
    priority: { favor: "cost" },
    label: "Echo",
    description: "Says it back.",
    graderVersion: "1",
    input: z.object({ text: z.string().min(1) }),
    labelValue: z.object({ want: z.string() }),
    checks: [],
    run: async (i) => i,
    grade: async () => [],
    inputFromForm: () => ({ text: "" }),
    title: (i) => i.text,
    async draftFromActivity(args) {
      asked.push(args);
      return activity
        .filter((a) => !args.known.has(a.sourceRef))
        .slice(0, args.limit);
    },
  };
  return { suite, asked };
}

const draft = (
  ref: string,
  over: Partial<ActivityDraft<Input, Label>> = {},
): ActivityDraft<Input, Label> => ({
  input: { text: `ticket ${ref}` },
  label: { want: `answer ${ref}` },
  tags: ["rated"],
  note: "Rated thumbs down.",
  sourceRef: ref,
  ...over,
});

describe("draftFromActivity", () => {
  it("adds drafts with pending answers, tagged and marked by source", async () => {
    const store = memoryStore();
    const { suite } = suiteWith([draft("a"), draft("b", { label: null })]);
    const r = await draftFromActivity({ store, suite, today });
    expect(r).toEqual({ drafted: 2, skipped: 0, overLimit: 0, rejected: [] });

    const cases = await store.listCases("echo");
    expect(cases.map((c) => c.status)).toEqual(["DRAFT", "DRAFT"]);
    expect(cases.map((c) => c.source)).toEqual([
      ACTIVITY_SOURCE,
      ACTIVITY_SOURCE,
    ]);
    expect(cases.map((c) => c.sourceRef)).toEqual(["a", "b"]);
    expect(cases[0]?.tags).toEqual(["rated", ACTIVITY_TAG]);
    expect(cases[0]?.note).toBe("Rated thumbs down.");
    // Never confirmed: a proposed answer is pending, and a missing one stays missing.
    expect(cases[0]?.labels).toHaveLength(1);
    expect(cases[0]?.labels[0]).toMatchObject({
      status: "PENDING",
      value: { want: "answer a" },
      raterRole: ACTIVITY_SOURCE,
    });
    expect(cases[1]?.labels).toEqual([]);
  });

  it("asks for activity since a week ago, with what's known and in use", async () => {
    const store = memoryStore();
    await store.createCase({
      suite: "echo",
      input: { text: "by hand" },
      tags: ["owner"],
      split: "DEV",
      status: "RETIRED",
      source: "OWNER",
      sourceRef: null,
      note: null,
    });
    const { suite, asked } = suiteWith([]);
    await draftFromActivity({ store, suite, today });
    expect(asked).toHaveLength(1);
    expect(asked[0]?.since).toEqual(new Date(+today - 7 * DAY));
    expect(asked[0]?.limit).toBe(ACTIVITY_DRAFTS_PER_WEEK);
    expect(asked[0]?.existing).toEqual([
      { input: { text: "by hand" }, tags: ["owner"] },
    ]);

    const since = new Date(+today - 30 * DAY);
    await draftFromActivity({ store, suite, today, since });
    expect(asked[1]?.since).toEqual(since);
  });

  it("never drafts the same thing twice, even after it's retired", async () => {
    const store = memoryStore();
    const { suite, asked } = suiteWith([draft("a")]);
    await draftFromActivity({ store, suite, today });
    const [first] = await store.listCases("echo");
    await store.setCaseStatus(first?.id ?? "", "RETIRED");

    const nextWeek = new Date(+today + 7 * DAY);
    const r = await draftFromActivity({ store, suite, today: nextWeek });
    expect(r.drafted).toBe(0);
    expect(asked[1]?.known).toEqual(new Set(["a"]));
    expect(
      await store.listCases("echo", { includeRetired: true }),
    ).toHaveLength(1);
  });

  it("skips a known sourceRef even when the suite returns it", async () => {
    const store = memoryStore();
    const { suite } = suiteWith([draft("a")]);
    await draftFromActivity({ store, suite, today });
    // A suite that ignores `known`.
    suite.draftFromActivity = async () => [draft("a"), draft("a2")];
    const r = await draftFromActivity({
      store,
      suite,
      today: new Date(+today + 8 * DAY),
    });
    expect(r).toMatchObject({ drafted: 1, skipped: 1 });
  });

  it("drafts at most the limit in any week, counting earlier drafts", async () => {
    const store = memoryStore();
    const many = ["a", "b", "c", "d"].map((r) => draft(r));
    const { suite, asked } = suiteWith(many);
    expect(
      (await draftFromActivity({ store, suite, today, limit: 2 })).drafted,
    ).toBe(2);
    // Later the same week: nothing left, so the suite isn't even asked.
    const r = await draftFromActivity({
      store,
      suite,
      today: new Date(+today + DAY),
      limit: 2,
    });
    expect(r.drafted).toBe(0);
    expect(asked).toHaveLength(1);
    // A week on, the allowance is back.
    const later = await draftFromActivity({
      store,
      suite,
      today: new Date(+today + 8 * DAY),
      limit: 2,
    });
    expect(later.drafted).toBe(2);
    expect(asked[1]?.limit).toBe(2);
  });

  it("leaves drafts past the limit for later, if the suite returns too many", async () => {
    const store = memoryStore();
    const { suite } = suiteWith([]);
    suite.draftFromActivity = async () => [draft("a"), draft("b"), draft("c")];
    const r = await draftFromActivity({ store, suite, today, limit: 2 });
    expect(r).toMatchObject({ drafted: 2, overLimit: 1 });
  });

  it("drafts nothing with a limit of zero or less", async () => {
    const store = memoryStore();
    const { suite, asked } = suiteWith([draft("a")]);
    expect(
      (await draftFromActivity({ store, suite, today, limit: -1 })).drafted,
    ).toBe(0);
    expect(asked).toHaveLength(0);
  });

  it("rejects drafts that don't fit the suite, and keeps the rest", async () => {
    const store = memoryStore();
    const { suite } = suiteWith([]);
    suite.draftFromActivity = async () => [
      draft("empty", { input: { text: "" } }),
      draft("bad", { label: { want: 3 } as unknown as Label }),
      draft("  "),
      draft("good"),
    ];
    const r = await draftFromActivity({ store, suite, today });
    expect(r.drafted).toBe(1);
    expect(r.rejected.map((p) => p.sourceRef)).toEqual(["empty", "bad", ""]);
    expect(r.rejected[0]?.problem).toMatch(/^input: /);
    expect(r.rejected[1]?.problem).toMatch(/^answer: /);
    expect(r.rejected[2]?.problem).toBe("no sourceRef");
  });

  it("splits drafts like cases added by hand", async () => {
    const store = memoryStore();
    const { suite } = suiteWith(["a", "b", "c", "d", "e"].map((r) => draft(r)));
    await draftFromActivity({ store, suite, today });
    const splits = (await store.listCases("echo")).map((c) => c.split);
    expect(splits).toContain("TEST");
    expect(splits).toContain("DEV");
  });

  it("does nothing for a suite without the method", async () => {
    const store = memoryStore();
    const { suite } = suiteWith([draft("a")]);
    delete suite.draftFromActivity;
    expect(await draftFromActivity({ store, suite, today })).toEqual({
      drafted: 0,
      skipped: 0,
      overLimit: 0,
      rejected: [],
    });
  });

  it("keeps an empty note as none", async () => {
    const store = memoryStore();
    const { suite } = suiteWith([draft("a", { note: "" })]);
    await draftFromActivity({ store, suite, today });
    expect((await store.listCases("echo"))[0]?.note).toBeNull();
  });
});
