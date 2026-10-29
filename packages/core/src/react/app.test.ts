import { describe, expect, it } from "vitest";
import { memoryStore } from "../memoryStore.js";
import type { AnySuite } from "../types.js";
import type { FeedbackStore } from "../feedback.js";
import type { BoardRow } from "../board.js";
import {
  attacksResisted,
  daysAgo,
  defineEvals,
  evalsPath,
  loadWeekly,
  type EvalApp,
} from "./app.js";

const suite = {
  key: "triage",
  operation: "triage_op",
  label: "Triage",
} as unknown as AnySuite;
const feedback: FeedbackStore = {
  listFeedback: async () => [],
} as unknown as FeedbackStore;

// Trust boundary: the screens read only what each test sets.
const app = (over: Partial<EvalApp> = {}): EvalApp =>
  ({
    store: memoryStore(),
    feedbackStore: feedback,
    models: {},
    suites: [suite],
    routeFor: async () => ({
      model: "m",
      fallbackModel: null,
      reasoningEffort: null,
    }),
    answerEditors: {},
    basePath: "/admin/evals/",
    ...over,
  }) as unknown as EvalApp;

describe("the screens' configuration", () => {
  it("finds suites by key, and trims the base path", () => {
    const evals = defineEvals(app());
    expect(evals.suiteByKey.triage).toBe(suite);
    expect(evals.basePath).toBe("/admin/evals");
    expect(defineEvals(app({ basePath: "/" })).basePath).toBe("/");
    expect(
      defineEvals(app({ basePath: "/evals" + "/".repeat(10_000) })).basePath,
    ).toBe("/evals");
  });

  it("links to a page below the base, escaping each part", () => {
    expect(evalsPath({ basePath: "/evals" }, "triage", "runs", "a b")).toBe(
      "/evals/triage/runs/a%20b",
    );
  });

  it("counts days back from now", () => {
    expect(Date.now() - +daysAgo(7)).toBeGreaterThanOrEqual(7 * 864e5 - 50);
  });

  it("loads where the weekly check stands", async () => {
    const weekly = await loadWeekly(app());
    expect(weekly).toMatchObject({ drift: [], failed: [] });
  });

  it("counts attacks resisted across a feature's attack suites", () => {
    // Trust boundary: only what attacksResisted reads.
    const row = (key: string, answers: number, ok: number, stale = false) =>
      ({
        key,
        test: { answers, answersNoSerious: ok, stale, failedAnswers: 0 },
      }) as unknown as BoardRow;
    const boards = [{ rows: [row("m", 10, 9)] }, { rows: [row("m", 6, 6)] }];
    expect(attacksResisted("m", boards)).toEqual({ resisted: 15, of: 16 });
    // Untested on one, or out of date: not known yet.
    expect(attacksResisted("other", boards)).toBeNull();
    expect(attacksResisted("m", [{ rows: [row("m", 4, 4, true)] }])).toBeNull();
    expect(attacksResisted("m", [])).toBeNull();
  });
});
