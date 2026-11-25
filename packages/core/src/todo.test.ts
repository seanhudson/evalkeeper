import { describe, expect, it } from "vitest";
import type { BoardRow } from "./board.js";
import type { CheckDef } from "./types.js";
import {
  replacedStarters,
  suiteStatus,
  suiteTodos,
  todoText,
  type TodoInput,
} from "./todo.js";

const checks: CheckDef[] = [
  {
    key: "rule",
    label: "Ranks your roles right",
    description: "",
    kind: "code",
    severity: "serious",
    bar: 0.8,
  },
  {
    key: "tone",
    label: "Tone",
    description: "",
    kind: "code",
    severity: "minor",
  },
];
const row = (
  key: string,
  {
    live = false,
    passed = 25,
    tone = 25,
    stale = false,
    tested = true,
    testing = false,
    baseline = false,
    cost = 0.01,
    fallback = false,
  } = {},
): BoardRow => ({
  key,
  model: key,
  effort: null,
  variant: false,
  label: key,
  live,
  fallback,
  baseline,
  testing,
  failed: null,
  estCostPerAnswer: null,
  test: tested
    ? {
        runId: `run-${key}`,
        at: new Date(),
        right: Math.min(passed, tone),
        total: 25,
        answersRight: Math.min(passed, tone),
        answers: 25,
        answersNoSerious: passed,
        measures: {},
        byCheck: {
          rule: { passed, n: 25, rate: passed / 25, low: null, high: null },
          tone: { passed: tone, n: 25, rate: tone / 25, low: null, high: null },
        },
        avgMs: 2000,
        costPerAnswer: cost,
        stale,
        failedAnswers: 0,
        failureReason: null,
      }
    : null,
  vsLive: live || !tested ? null : "SAME",
  canMakeLive: !live,
  canMakeFallback: false,
  liveOnly: false,
  fallbackOnly: false,
});
const input = (over: Partial<TodoInput>): TodoInput => ({
  rows: [],
  checks,
  priority: { favor: "quality" },
  cases: 50,
  provisional: 0,
  target: 50,
  ...over,
});
const kinds = (i: TodoInput) => suiteTodos(i).map((t) => t.kind);

describe("suiteTodos", () => {
  it("asks to test every model while one or none is tested", () => {
    const none = input({
      rows: [
        row("Luna", { live: true, tested: false }),
        row("Sol", { tested: false }),
      ],
    });
    expect(suiteTodos(none)[0]).toEqual({ kind: "testAll", tested: 0 });
    const one = input({
      rows: [row("Luna", { live: true }), row("Sol", { tested: false })],
    });
    expect(suiteTodos(one)[0]).toEqual({ kind: "testAll", tested: 1 });
    expect(todoText({ kind: "testAll", tested: 1 }).why).toMatch(/only one/);
  });

  it("suggests a fallback when there's none", () => {
    const rows = [row("Luna", { live: true }), row("Sol")];
    expect(suiteTodos(input({ rows }))[0]).toMatchObject({
      kind: "makeLive",
      model: "Sol",
      fallback: true,
    });
  });

  it("doesn't ask for more models than the feature has", () => {
    expect(kinds(input({ rows: [row("Luna", { live: true })] }))).toEqual([]);
  });

  it("asks to test again after a change, and nothing while a test runs", () => {
    const rows = [row("Luna", { live: true, stale: true }), row("Sol")];
    expect(kinds(input({ rows }))[0]).toBe("retest");
    const running = [
      row("Luna", { live: true, testing: true }),
      row("Sol", { tested: false }),
    ];
    expect(kinds(input({ rows: running }))).not.toContain("testAll");
  });

  it("suggests a better model, with the suggestion's reason", () => {
    const rows = [
      row("Luna", { live: true, cost: 0.02 }),
      row("Haiku", { cost: 0.001 }),
    ];
    const t = suiteTodos(input({ rows, priority: { favor: "cost" } }))[0];
    expect(t).toMatchObject({
      kind: "makeLive",
      model: "Haiku",
      fallback: false,
    });
    if (t?.kind !== "makeLive") throw new Error("expected makeLive");
    expect(todoText(t).what).toBe("Make Haiku live");
    expect(todoText(t).why).toMatch(/^Haiku scores at least as well/);
  });

  it("names a must-pass check every tested model misses, with how far off", () => {
    const rows = [
      row("Luna", { live: true, passed: 18 }),
      row("Sol", { passed: 19 }),
    ];
    const todos = suiteTodos(input({ rows, missedByCheck: { rule: 6 } }));
    const fix = todos.find((t) => t.kind === "fixCheck");
    expect(fix).toMatchObject({
      check: "rule",
      rate: 0.72,
      aim: 0.8,
      missed: 6,
      runId: "run-Luna",
    });
    if (fix?.kind !== "fixCheck") throw new Error("expected fixCheck");
    expect(todoText(fix)).toEqual({
      what: 'Fix "Ranks your roles right"',
      why: "passes 72% of the time (aim: 80%); every model tested misses it on 6 cases. The fix is in the instructions or the answers, not the model.",
    });
    // Not when one model passes it: then it's a choice of model.
    const one = [
      row("Luna", { live: true, passed: 18 }),
      row("Sol", { passed: 24 }),
    ];
    expect(kinds(input({ rows: one }))).not.toContain("fixCheck");
    // Nice-to-have checks never make the list.
    const tone = [
      row("Luna", { live: true, tone: 5 }),
      row("Sol", { tone: 5 }),
    ];
    expect(kinds(input({ rows: tone }))).not.toContain("fixCheck");
  });

  it("lists the answer key's work after the tests, in order", () => {
    const rows = [row("Luna", { live: true }), row("Sol", { fallback: true })];
    const todos = suiteTodos(
      input({
        rows,
        cases: 40,
        provisional: 3,
        unmadeAttacks: [{ key: "inj", label: "Injection" }],
        replacedStarters: 2,
        splitCases: 1,
      }),
    );
    expect(todos.map((t) => t.kind)).toEqual([
      "confirm",
      "addCases",
      "makeAttacks",
      "retireStarters",
      "reviewSplit",
    ]);
    expect(todos.map((t) => todoText(t).what)).toEqual([
      "Confirm 3 answers",
      "Add 10 cases",
      "Make attack cases",
      "Retire 2 replaced starters",
      "Review 1 case models split on",
    ]);
    expect(
      todoText({ kind: "addCases", add: 10, cases: 40, target: 50 }).why,
    ).toMatch(/^40 of 50/);
  });

  it("aims for the suite's own target", () => {
    const rows = [row("Luna", { live: true }), row("Sol", { fallback: true })];
    expect(kinds(input({ rows, cases: 10, target: 10 }))).toEqual([]);
    expect(kinds(input({ rows, cases: 8, target: 10 }))).toEqual(["addCases"]);
  });

  it("words every kind", () => {
    expect(todoText({ kind: "retest" }).what).toBe("Test again");
    expect(todoText({ kind: "confirm", answers: 1 }).why).toMatch(/^it's/);
    expect(todoText({ kind: "retireStarters", cases: 1 }).why).toMatch(
      /this one is/,
    );
    expect(
      todoText({
        kind: "makeLive",
        model: "x",
        label: "X",
        fallback: true,
        why: "",
      }).what,
    ).toBe("Make X the fallback");
    expect(
      todoText({
        kind: "fixCheck",
        check: "c",
        label: "C",
        rate: 0.5,
        aim: 0.9,
        missed: null,
        runId: null,
      }).why,
    ).toMatch(/every model tested misses it\. /);
  });
});

describe("suiteStatus", () => {
  const rows = [row("Luna", { live: true }), row("Sol", { fallback: true })];
  it("is healthy with nothing to do", () => {
    expect(suiteStatus(input({ rows }))).toBe("healthy");
  });
  it("needs attention with anything to do", () => {
    expect(suiteStatus(input({ rows, cases: 40 }))).toBe("attention");
  });
  it("can't tell untested or with too few cases for its target", () => {
    expect(
      suiteStatus(
        input({ rows: [row("Luna", { live: true, tested: false })] }),
      ),
    ).toBe("unknown");
    expect(suiteStatus(input({ rows, cases: 12 }))).toBe("unknown");
    // At its own target of 10, 10 cases are enough to judge.
    expect(suiteStatus(input({ rows, cases: 10, target: 10 }))).toBe("healthy");
  });
  it("needs attention when every model misses a must-pass check, even on few cases", () => {
    const failing = [
      row("Luna", { live: true, passed: 10 }),
      row("Sol", { passed: 10 }),
    ];
    expect(suiteStatus(input({ rows: failing, cases: 12 }))).toBe("attention");
  });
});

describe("replacedStarters", () => {
  const suite = {
    key: "posting",
    starter: [{ input: { url: "b" } }, { input: { url: "c" } }],
  };
  const c = (sourceRef: string | null, url: string, status = "ACTIVE") => ({
    sourceRef,
    status,
    input: { url },
  });
  it("lists starters whose input no starter has anymore", () => {
    const old = c("starter:posting#1", "a");
    expect(
      replacedStarters(suite, [
        old,
        c("starter:posting#2", "b"),
        c("starter:posting#3", "x", "RETIRED"),
      ]),
    ).toEqual([old]);
  });
  it("never lists a case with no sourceRef, or another suite's", () => {
    expect(
      replacedStarters(suite, [
        c(null, "a"),
        c("starter:other#1", "a"),
        c("IMPORT#1", "a"),
      ]),
    ).toEqual([]);
    expect(
      replacedStarters({ key: "posting" }, [c("starter:posting#1", "a")]),
    ).toHaveLength(1);
  });
});
