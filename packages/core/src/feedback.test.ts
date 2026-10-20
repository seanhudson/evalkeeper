import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  caseFromFeedback,
  cleanRating,
  thumbsSummary,
  whyNotACase,
  type FeedbackRecord,
} from "./feedback";
import type { AnySuite, Suite } from "./types";

type In = { text: string };
type Out = { label: string };
const suite: Suite<In, Out, Out> = {
  key: "tagger",
  operation: "tagger",
  priority: { favor: "quality" },
  label: "Tagger",
  description: "",
  graderVersion: "1",
  input: z.object({ text: z.string() }),
  labelValue: z.object({ label: z.string() }),
  checks: [],
  run: async () => ({ label: "x" }),
  grade: async () => [],
  inputFromForm: () => ({ text: "" }),
  labelFromOutput: (o) => ({ label: o.label }),
  title: (i) => i.text,
};
const any = suite as unknown as AnySuite;

const fb = (over: Partial<FeedbackRecord> = {}): FeedbackRecord => ({
  id: "fb1",
  operation: "tagger",
  targetId: "t1",
  raterId: "p1",
  rating: "DOWN",
  reason: "Wrong tag",
  excerpt: null,
  input: { text: "hello" },
  output: { label: "spam" },
  status: "OPEN",
  caseId: null,
  createdAt: new Date(0),
  updatedAt: new Date(1000),
  ...over,
});

describe("cleanRating", () => {
  it("trims and bounds text, and keeps a reason only on a thumbs down", () => {
    const c = cleanRating({
      operation: "tagger",
      targetId: "x".repeat(300),
      raterId: "p1",
      rating: "UP",
      reason: "great",
      excerpt: "  ",
    });
    expect(c.targetId).toHaveLength(200);
    expect(c.reason).toBeNull();
    expect(c.excerpt).toBeNull();
    expect(c.input).toBeNull();
    expect(
      cleanRating({ ...c, rating: "DOWN", reason: " " + "y".repeat(2000) })
        .reason,
    ).toHaveLength(1000);
  });
});

describe("caseFromFeedback", () => {
  it("makes a thumbs down a draft case with no answer, for a person to write", () => {
    const c = caseFromFeedback(fb(), any);
    expect(c).toMatchObject({
      suite: "tagger",
      input: { text: "hello" },
      status: "DRAFT",
      source: "FEEDBACK",
      sourceRef: "fb1",
      labels: [],
    });
    expect(c?.note).toMatch(/Wrong tag/);
    expect(c?.tags).toContain("thumbs down");
  });

  it("proposes the model's answer from a thumbs up, pending, never confirmed", () => {
    const c = caseFromFeedback(fb({ rating: "UP", reason: null }), any);
    expect(c?.labels).toEqual([
      expect.objectContaining({
        status: "PENDING",
        value: { label: "spam" },
        raterRole: "FEEDBACK",
      }),
    ]);
  });

  it("proposes nothing when the suite can't turn outputs into answers", () => {
    const plain: Suite<In, Out, Out> = { ...suite };
    delete plain.labelFromOutput;
    const c = caseFromFeedback(fb({ rating: "UP" }), plain);
    expect(c?.labels).toEqual([]);
  });

  it("says why a rating can't become a case", () => {
    expect(whyNotACase(fb(), undefined)).toMatch(/No suite/);
    expect(whyNotACase(fb({ input: null }), any)).toMatch(/wasn't kept/);
    expect(whyNotACase(fb({ input: { nope: 1 } }), any)).toMatch(
      /doesn't match/,
    );
    expect(whyNotACase(fb(), any)).toBeNull();
    expect(caseFromFeedback(fb({ input: null }), any)).toBeNull();
  });
});

describe("thumbsSummary", () => {
  it("counts ratings per feature since a date, flagging a high thumbs-down share", () => {
    const since = new Date(500);
    const list = [
      ...Array.from({ length: 3 }, (_, i) => fb({ id: `u${i}`, rating: "UP" })),
      fb({ id: "d1" }),
      fb({ id: "d2", status: "CASED" }),
      fb({ id: "old", updatedAt: new Date(100) }),
      fb({ id: "other", operation: "summary", rating: "UP" }),
    ];
    const [tagger, summary] = thumbsSummary(list, since);
    expect(tagger).toMatchObject({
      operation: "tagger",
      up: 3,
      down: 2,
      open: 1,
      alert: true,
    });
    expect(tagger?.downShare).toBeCloseTo(0.4);
    expect(summary).toMatchObject({
      operation: "summary",
      up: 1,
      down: 0,
      alert: false,
    });
  });
});
