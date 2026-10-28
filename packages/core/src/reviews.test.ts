import { describe, expect, it } from "vitest";
import { z } from "zod";
import { importStarters } from "./importCases.js";
import { memoryStore } from "./memoryStore.js";
import {
  AUTHOR_REVIEWED,
  EXPERT_REVIEWED,
  addShippedReviews,
  isShippedReview,
  mergeReviews,
  reviewProblems,
  reviewSheet,
  reviewsFromSheet,
  starterKey,
  type ShippedReview,
} from "./reviews.js";
import { suiteContractProblems } from "./suiteContract.js";
import type { Suite } from "./types.js";

const NOW = new Date("2026-06-01T12:00:00Z");

const base: Suite<{ text: string }, { text: string }, { want: string }> = {
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
  fields: {
    input: [
      {
        name: "text",
        label: "Text",
        help: "What to say in capitals.",
        kind: "text",
      },
    ],
    label: [
      {
        name: "want",
        label: "Want",
        help: "The text in capitals.",
        kind: "text",
      },
    ],
  },
  starter: [
    {
      input: { text: "hello" },
      label: { want: "HELLO" },
      tags: [],
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

const HELLO = starterKey({ text: "hello" });
const BYE = starterKey({ text: "bye" });

const author: ShippedReview = {
  case: HELLO,
  label: { want: "HELLO" },
  level: "AUTHOR",
  by: "Pat Example",
  credential: "suite author",
  at: "2026-05-01",
};
const expert: ShippedReview = {
  ...author,
  level: "EXPERT",
  by: "Sam Sample",
  credential: "crisis line counselor",
  at: "2026-05-20",
};

const withReviews = (reviews: ShippedReview[]) => ({ ...base, reviews });

describe("starterKey", () => {
  it("is stable and ignores key order", () => {
    expect(starterKey({ a: 1, b: 2 })).toBe(starterKey({ b: 2, a: 1 }));
    expect(starterKey({ text: "hello" })).toMatch(/^[0-9a-f]{8}$/);
    expect(HELLO).not.toBe(BYE);
  });
});

describe("isShippedReview", () => {
  it("tells shipped reviews from answers given in the app", () => {
    expect(isShippedReview({ raterRole: AUTHOR_REVIEWED })).toBe(true);
    expect(isShippedReview({ raterRole: EXPERT_REVIEWED })).toBe(true);
    expect(isShippedReview({ raterRole: "OWNER" })).toBe(false);
  });
});

describe("reviewProblems", () => {
  it("finds nothing wrong with reviews that match their cases", () => {
    expect(reviewProblems(withReviews([author, expert]), NOW)).toEqual([]);
    expect(reviewProblems(base, NOW)).toEqual([]);
  });

  it("names a review whose case changed or is gone", () => {
    const problems = reviewProblems(
      withReviews([{ ...author, case: starterKey({ text: "hullo" }) }]),
      NOW,
    );
    expect(problems).toEqual([
      expect.stringMatching(/matches no starter case/),
    ]);
  });

  it("names a review of a different answer, or one that doesn't fit", () => {
    expect(
      reviewProblems(withReviews([{ ...author, label: { want: "HI" } }]), NOW),
    ).toEqual([expect.stringMatching(/confirms a different answer/)]);
    expect(
      reviewProblems(withReviews([{ ...author, label: { want: 1 } }]), NOW),
    ).toEqual([expect.stringMatching(/doesn't fit the schema/)]);
  });

  it("asks who reviewed it, what qualifies them, and when", () => {
    const problems = reviewProblems(
      withReviews([{ ...author, by: " ", credential: "", at: "May 1" }]),
      NOW,
    );
    expect(problems).toEqual([
      expect.stringMatching(/doesn't say who reviewed it/),
      expect.stringMatching(/doesn't say what qualifies/),
      expect.stringMatching(/no date as YYYY-MM-DD/),
    ]);
  });

  it("refuses impossible and future dates", () => {
    expect(
      reviewProblems(withReviews([{ ...author, at: "2026-02-30" }]), NOW),
    ).toEqual([expect.stringMatching(/no date/)]);
    expect(
      reviewProblems(withReviews([{ ...author, at: "2026-07-01" }]), NOW),
    ).toEqual([expect.stringMatching(/dated in the future/)]);
  });

  it("names the same review twice", () => {
    expect(reviewProblems(withReviews([author, author]), NOW)).toEqual([
      expect.stringMatching(/the same author review twice/),
    ]);
  });

  it("is part of the suite contract", () => {
    expect(
      suiteContractProblems([withReviews([{ ...author, case: "00000000" }])]),
    ).toEqual([expect.stringMatching(/matches no starter case/)]);
  });
});

describe("importStarters with shipped reviews", () => {
  it("adds reviewed cases confirmed and in use, the rest pending", async () => {
    const store = memoryStore();
    const result = await importStarters(store, withReviews([author]));
    expect(result).toMatchObject({ added: 2, reviewed: 1, disagree: [] });

    const cases = await store.listCases("shout");
    const hello = cases.find((c) => c.sourceRef === `starter:shout#${HELLO}`);
    const bye = cases.find((c) => c.sourceRef === `starter:shout#${BYE}`);
    expect(hello?.status).toBe("ACTIVE");
    expect(hello?.labels.find((l) => l.status === "CONFIRMED")).toMatchObject({
      value: { want: "HELLO" },
      raterRole: AUTHOR_REVIEWED,
      raterId: "Pat Example",
      note: "Reviewed by the suite's author for the Shout suite: Pat Example (suite author) confirmed it on 2026-05-01.",
    });
    expect(bye?.status).toBe("DRAFT");
    expect(bye?.labels.map((l) => l.status)).toEqual(["PENDING"]);
  });

  it("adds nothing twice on a rerun", async () => {
    const store = memoryStore();
    await importStarters(store, withReviews([author]));
    const again = await importStarters(store, withReviews([author]));
    expect(again).toMatchObject({ added: 0, skipped: 2, reviewed: 0 });
  });

  it("adds reviews shipped later to cases already added, expert on top of author", async () => {
    const store = memoryStore();
    await importStarters(store, base);
    expect(await importStarters(store, withReviews([author]))).toMatchObject({
      added: 0,
      reviewed: 1,
    });
    expect(
      await importStarters(store, withReviews([author, expert])),
    ).toMatchObject({ reviewed: 1 });
    const [hello] = (await store.listCases("shout")).filter(
      (c) => c.sourceRef === `starter:shout#${HELLO}`,
    );
    expect(hello?.status).toBe("ACTIVE");
    expect(
      hello?.labels
        .filter((l) => l.status === "CONFIRMED")
        .map((l) => l.raterRole),
    ).toEqual([AUTHOR_REVIEWED, EXPERT_REVIEWED]);
    expect(
      hello?.labels.find((l) => l.raterRole === EXPERT_REVIEWED)?.note,
    ).toMatch(/^Reviewed by an expert .*Sam Sample \(crisis line counselor\)/);
  });

  it("never adds a review over the app's own answer, and reports a different one", async () => {
    const store = memoryStore();
    await importStarters(store, base);
    const cases = await store.listCases("shout");
    const hello = cases.find((c) => c.sourceRef === `starter:shout#${HELLO}`);
    const bye = cases.find((c) => c.sourceRef === `starter:shout#${BYE}`);
    if (!hello || !bye) throw new Error("starters missing");
    await store.addLabel(hello.id, {
      kind: "EXPECTED",
      status: "CONFIRMED",
      value: { want: "HELLO!" },
      raterRole: "OWNER",
      raterId: null,
      note: null,
    });
    await store.addLabel(bye.id, {
      kind: "EXPECTED",
      status: "PROVISIONAL",
      value: { want: "BYE" },
      raterRole: "AGENT",
      raterId: "drafter",
      note: null,
    });
    const result = await importStarters(
      store,
      withReviews([author, { ...author, case: BYE, label: { want: "BYE" } }]),
    );
    expect(result.reviewed).toBe(0);
    expect(result.disagree).toEqual([{ caseId: hello.id, review: author }]);
    for (const c of await store.listCases("shout"))
      expect(c.labels.some(isShippedReview)).toBe(false);
  });

  it("leaves out reviews that don't count", async () => {
    const store = memoryStore();
    const result = await importStarters(
      store,
      withReviews([
        { ...author, label: { want: "HI" } },
        { ...author, case: BYE, label: { want: "BYE" }, by: "" },
      ]),
    );
    expect(result.reviewed).toBe(0);
    for (const c of await store.listCases("shout"))
      expect(c.status).toBe("DRAFT");
  });

  it("skips retired cases and cases added under another source", async () => {
    const store = memoryStore();
    await importStarters(store, base);
    const [hello] = (await store.listCases("shout")).filter(
      (c) => c.sourceRef === `starter:shout#${HELLO}`,
    );
    if (!hello) throw new Error("starter missing");
    await store.setCaseStatus(hello.id, "RETIRED");
    expect(
      await addShippedReviews(
        store,
        withReviews([author]),
        "starter:shout",
        NOW,
      ),
    ).toEqual({ reviewed: 0, disagree: [] });
    await store.setCaseStatus(hello.id, "DRAFT");
    expect(
      await addShippedReviews(store, withReviews([author]), "elsewhere", NOW),
    ).toEqual({ reviewed: 0, disagree: [] });
  });
});

describe("review sheets", () => {
  const reviewer = {
    level: "AUTHOR" as const,
    by: " Pat Example ",
    credential: "suite author",
    at: "2026-05-01",
  };

  it("lists each starter with its key, title, and answer", () => {
    expect(reviewSheet(base)).toEqual([
      {
        case: HELLO,
        title: "hello",
        input: '{"text":"hello"}',
        answer: '{"want":"HELLO"}',
      },
      {
        case: BYE,
        title: "bye",
        input: '{"text":"bye"}',
        answer: '{"want":"BYE"}',
      },
    ]);
    const { starter: _starter, ...none } = base;
    expect(reviewSheet(none)).toEqual([]);
    const described = {
      ...base,
      describe: (i: { text: string }) => `Say ${i.text}`,
    };
    expect(reviewSheet(described)[0]?.input).toBe("Say hello");
  });

  it("signs the rows a reviewer confirmed, in the suite's order", () => {
    const reviews = reviewsFromSheet(
      base,
      [
        { case: BYE, confirm: " Yes " },
        { case: HELLO, confirm: "" },
      ],
      reviewer,
    );
    expect(reviews).toEqual([
      {
        case: BYE,
        label: { want: "BYE" },
        level: "AUTHOR",
        by: "Pat Example",
        credential: "suite author",
        at: "2026-05-01",
      },
    ]);
    expect(reviewProblems(withReviews(reviews), NOW)).toEqual([]);
  });

  it("refuses unknown cases, unknown marks, and a missing reviewer", () => {
    expect(() =>
      reviewsFromSheet(
        base,
        [
          { case: "00000000", confirm: "yes" },
          { case: HELLO, confirm: "change to HI" },
        ],
        { ...reviewer, by: "", credential: " ", at: "soon" },
      ),
    ).toThrow(
      /no reviewer.*no credential.*no date.*00000000 isn't one of shout's starters.*marked "change to HI"/,
    );
  });

  it("replaces one reviewer's reviews and keeps everyone else's", () => {
    const old = { ...author, case: BYE, label: { want: "BYE" } };
    const merged = mergeReviews([old, expert], [author], {
      level: "AUTHOR",
      by: "Pat Example",
    });
    expect(merged).toEqual([expert, author]);
  });
});
