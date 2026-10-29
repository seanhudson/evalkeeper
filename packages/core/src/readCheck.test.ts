import { describe, expect, it } from "vitest";
import { z } from "zod";
import { memoryStore } from "./memoryStore.js";
import {
  checkReads,
  checkStoreReads,
  readCheckSummary,
  rowProblems,
  type ReadRow,
  type ReadSource,
} from "./readCheck.js";
import type { EvalStore } from "./store.js";
import type { AnySuite, Suite } from "./types.js";

const when = new Date(1_000);

const goodCase = {
  id: "c1",
  suite: "triage",
  input: { text: "hi" },
  tags: ["a"],
  split: "DEV",
  status: "ACTIVE",
  source: "OWNER",
  sourceRef: null,
  note: null,
  createdAt: when,
  updatedAt: when,
};
const goodAnswer = {
  id: "l1",
  kind: "EXPECTED",
  status: "CONFIRMED",
  value: { want: "HI" },
  raterRole: "OWNER",
  raterId: null,
  note: null,
  createdAt: when,
  updatedAt: when,
};
const goodTest = {
  id: "r1",
  suite: "triage",
  model: "model-a",
  promptVersion: "v1",
  reasoningEffort: null,
  set: "ALL",
  repeats: 1,
  datasetVersion: null,
  graderVersion: "1",
  status: "SUCCEEDED",
  metrics: null,
  error: null,
  estimatedCostUsd: 0.5,
  startedBy: null,
  startedAt: when,
  finishedAt: null,
};
const goodOutput = {
  id: "o1",
  runId: "r1",
  caseId: "c1",
  repeat: 1,
  requestHash: "h",
  output: { text: "HI" },
  error: null,
  scores: [{ key: "match", pass: true }],
  costUsd: 0.01,
  ms: 5,
  reused: false,
  createdAt: when,
};

const suite: Suite<{ text: string }, { text: string }, { want: string }> = {
  key: "triage",
  operation: "triage",
  priority: { favor: "quality" },
  label: "Triage",
  description: "Uppercases text.",
  graderVersion: "1",
  input: z.object({ text: z.string() }),
  labelValue: z.object({ want: z.string() }),
  checks: [],
  run: async (i) => ({ text: i.text.toUpperCase() }),
  grade: async () => [],
  inputFromForm: () => ({ text: "" }),
  title: (i) => i.text,
};
// Trust boundary: a typed suite used where any suite goes, as apps do.
const anySuite = suite as unknown as AnySuite;

function source(rows: {
  cases?: ReadRow[];
  tests?: ReadRow[];
  outputs?: ReadRow[];
}): ReadSource {
  return {
    cases: async () => rows.cases ?? [],
    tests: async (_s, limit) => (rows.tests ?? []).slice(0, limit),
    outputs: async () => rows.outputs ?? [],
  };
}

describe("rowProblems", () => {
  it("finds nothing wrong with rows as the stores write them", () => {
    expect(rowProblems("case", goodCase)).toEqual([]);
    expect(rowProblems("answer", goodAnswer)).toEqual([]);
    expect(rowProblems("test", goodTest)).toEqual([]);
    expect(rowProblems("output", goodOutput)).toEqual([]);
  });

  it("accepts the nulls the stores read on purpose", () => {
    expect(
      rowProblems("test", {
        ...goodTest,
        set: null,
        graderVersion: null,
        estimatedCostUsd: null,
        temperature: undefined,
        maxOutputTokens: null,
        metrics: { allPass: {} },
        finishedAt: when,
      }),
    ).toEqual([]);
    expect(rowProblems("output", { ...goodOutput, scores: null })).toEqual([]);
  });

  it("names each field that's missing or holds what it can't use", () => {
    const { split: _split, ...noSplit } = goodCase;
    expect(
      rowProblems("case", { ...noSplit, status: "LIVE", tags: "a,b" }),
    ).toEqual([
      { field: "tags", problem: 'isn\'t a list of words: "a,b"' },
      {
        field: "split",
        problem: "is missing (no column for it, or not mapped)",
      },
      {
        field: "status",
        problem: '"LIVE" isn\'t one of DRAFT, ACTIVE, RETIRED',
      },
    ]);
    expect(
      rowProblems("answer", {
        ...goodAnswer,
        kind: "REFERENCE",
        createdAt: "yesterday",
        updatedAt: new Date(Number.NaN),
        raterRole: 3,
      }).map((p) => p.field),
    ).toEqual(["kind", "raterRole", "createdAt", "updatedAt"]);
    expect(
      rowProblems("test", {
        ...goodTest,
        repeats: 0,
        estimatedCostUsd: "lots",
        temperature: "warm",
        metrics: "done",
        finishedAt: 5,
      }).map((p) => p.field),
    ).toEqual([
      "temperature",
      "repeats",
      "metrics",
      "estimatedCostUsd",
      "finishedAt",
    ]);
    expect(
      rowProblems("output", {
        ...goodOutput,
        costUsd: -1,
        ms: Number.NaN,
        reused: "no",
        scores: [{ pass: true }],
        output: undefined,
      }).map((p) => p.field),
    ).toEqual(["output", "scores", "costUsd", "ms", "reused"]);
  });
});

describe("checkReads", () => {
  it("counts every row and finds nothing wrong in good ones", async () => {
    const report = await checkReads(
      source({
        cases: [{ ...goodCase, labels: [goodAnswer, goodAnswer] }],
        tests: [goodTest],
        outputs: [goodOutput, goodOutput],
      }),
      { suites: [anySuite] },
    );
    expect(report).toEqual({
      suites: [
        {
          suite: "triage",
          counts: { cases: 1, answers: 2, tests: 1, outputs: 2 },
          problems: [],
        },
      ],
    });
    expect(readCheckSummary(report)).toEqual([
      "triage: 1 case, 2 answers, 1 test, and 2 outputs; no problems.",
    ]);
  });

  it("lists bad rows by suite, kind, id, and field, and sums them up", async () => {
    const report = await checkReads(
      source({
        cases: [
          {
            ...goodCase,
            input: { text: 5 },
            labels: [
              { ...goodAnswer, id: "l1", status: "GOLD" },
              { ...goodAnswer, id: "l2", status: "GOLD" },
              { ...goodAnswer, id: "l3", value: { want: 1 } },
              { ...goodAnswer, id: "l4", status: "SKIPPED", value: null },
              "not a row",
            ],
          },
          { ...goodCase, id: "c2", labels: null },
        ],
        tests: [{ ...goodTest, status: "DONE" }],
        outputs: [{ ...goodOutput, costUsd: "0.01" }],
      }),
      { suites: [anySuite] },
    );
    const [triage] = report.suites;
    expect(triage?.counts).toEqual({
      cases: 2,
      answers: 5,
      tests: 1,
      outputs: 1,
    });
    expect(triage?.problems.map((p) => [p.kind, p.id, p.field])).toEqual([
      ["case", "c1", "input"],
      ["answer", "l1", "status"],
      ["answer", "l2", "status"],
      ["answer", "l3", "value"],
      ["answer", "", "id"],
      ["answer", "", "kind"],
      ["answer", "", "status"],
      ["answer", "", "value"],
      ["answer", "", "raterRole"],
      ["answer", "", "raterId"],
      ["answer", "", "note"],
      ["answer", "", "createdAt"],
      ["answer", "", "updatedAt"],
      ["case", "c2", "labels"],
      ["test", "r1", "status"],
      ["output", "o1", "costUsd"],
    ]);
    expect(triage?.problems[0]?.problem).toBe(
      "doesn't fit the suite's schema (text: Invalid input: expected string, received number)",
    );
    const summary = readCheckSummary(report);
    expect(summary[0]).toBe(
      "triage: 2 cases, 5 answers, 1 test, and 1 output; 16 problems.",
    );
    expect(summary).toContain(
      '  answer status "GOLD" isn\'t one of PENDING, CONFIRMED, PROVISIONAL, REJECTED, SKIPPED: 2 rows (e.g. l1).',
    );
    expect(summary).toContain(
      "  answer id is missing (no column for it, or not mapped): 1 row.",
    );
  });

  it("checks only the stored fields when given a suite's key", async () => {
    const report = await checkReads(
      source({ cases: [{ ...goodCase, input: 5, labels: [] }] }),
      { suites: ["triage"] },
    );
    expect(report.suites[0]?.problems).toEqual([]);
  });

  it("says when rows couldn't be read, and goes on with the rest", async () => {
    const report = await checkReads(
      {
        cases: async () => {
          throw new Error("no such column: answers");
        },
        tests: async () => [goodTest],
        outputs: async () => {
          // A source can fail with something that isn't an Error.
          // eslint-disable-next-line @typescript-eslint/only-throw-error
          throw "offline";
        },
      },
      { suites: ["triage"] },
    );
    expect(report.suites[0]?.problems).toEqual([
      {
        suite: "triage",
        kind: "case",
        id: "",
        field: "",
        problem: "couldn't be read: no such column: answers",
      },
      {
        suite: "triage",
        kind: "output",
        id: "",
        field: "",
        problem: "couldn't be read: offline",
      },
    ]);
    const failing = await checkReads(
      { ...source({}), tests: () => Promise.reject(new Error("down")) },
      { suites: ["triage"] },
    );
    expect(failing.suites[0]?.problems.map((p) => p.kind)).toEqual(["test"]);
  });
});

describe("checkStoreReads", () => {
  async function filled() {
    const store = memoryStore();
    const c = await store.createCase({
      suite: "triage",
      input: { text: "hi" },
      tags: [],
      split: "DEV",
      status: "RETIRED",
      source: "OWNER",
      sourceRef: null,
      note: null,
      labels: [{ ...goodAnswer, status: "CONFIRMED", kind: "EXPECTED" }],
    });
    for (let i = 0; i < 3; i++) {
      const r = await store.createRun({
        suite: "triage",
        model: "model-a",
        promptVersion: "v1",
        reasoningEffort: null,
        set: "ALL",
        repeats: 1,
        datasetVersion: null,
        graderVersion: "1",
        estimatedCostUsd: null,
        startedBy: null,
      });
      await store.createOutput({ ...goodOutput, runId: r.id, caseId: c.id });
    }
    return store;
  }

  it("reads retired cases, tests, and outputs through the store", async () => {
    const store = await filled();
    const report = await checkStoreReads(store, { suites: [anySuite] });
    expect(report.suites[0]).toEqual({
      suite: "triage",
      counts: { cases: 1, answers: 1, tests: 3, outputs: 3 },
      problems: [],
    });
    const fewer = await checkStoreReads(store, {
      suites: ["triage"],
      tests: 2,
    });
    expect(fewer.suites[0]?.counts).toMatchObject({ tests: 2, outputs: 2 });
  });

  it("reads outputs one test at a time from a store without listOutputsFor", async () => {
    const store: EvalStore = { ...(await filled()) };
    delete store.listOutputsFor;
    const report = await checkStoreReads(store, { suites: ["triage"] });
    expect(report.suites[0]?.counts.outputs).toBe(3);
  });

  it("finds what a store passes through as it is", async () => {
    const store = await filled();
    const [run] = store.runs;
    if (run)
      // Trust boundary: a bad value planted the way a store could read one.
      Object.assign(run, { estimatedCostUsd: Number.NaN });
    const report = await checkStoreReads(store, { suites: ["triage"] });
    expect(report.suites[0]?.problems).toMatchObject([
      { kind: "test", field: "estimatedCostUsd" },
    ]);
  });
});
