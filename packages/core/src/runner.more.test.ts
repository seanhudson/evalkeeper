import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { memoryStore } from "./memoryStore.js";
import {
  STOPPED_BY_HAND,
  commonError,
  createRunner,
  datasetVersion,
  type BudgetCall,
  type JudgeCharge,
  NO_ESTIMATE_CEILING_USD,
} from "./runner.js";
import type { EvalStore, NewCase } from "./store.js";
import { SCHEDULED } from "./weekly.js";
import type { Suite } from "./types.js";

/**
 * The runner's features beyond a basic test: sets, repeats, estimates,
 * provisional answers, checks across answers, comparing two tests,
 * rescoring, reasoning settings on the board, and its error paths.
 */

type In = { n: number; group: string };
type Out = { n: number };
type Want = { n: number };

// Doubles a number; "bad" models get odd numbers wrong.
const double: Suite<In, Out, Want> = {
  key: "double",
  operation: "double",
  priority: { favor: "cost" },
  label: "Double",
  description: "Doubles numbers.",
  graderVersion: "1",
  input: z.object({ n: z.number(), group: z.string() }),
  labelValue: z.object({ n: z.number() }),
  checks: [
    {
      key: "right",
      label: "Right",
      description: "",
      kind: "label",
      severity: "serious",
    },
    {
      key: "biggest",
      label: "Biggest in its group",
      description: "",
      kind: "code",
      severity: "minor",
    },
  ],
  async run(i, ctx) {
    if (i.n < 0) throw new Error("Negative numbers aren't allowed");
    ctx.onCost(0.002);
    return { n: ctx.model === "bad" && i.n % 2 ? i.n * 2 + 1 : i.n * 2 };
  },
  async grade(_i, out, want, ctx) {
    ctx?.onCost(0.0005);
    return [{ key: "right", pass: want ? out.n === want.n : null }];
  },
  // Marks the biggest answer in each group: compares answers with each other.
  gradeTogether(answers) {
    return answers.map((a) => {
      const peers = answers.filter((b) => b.input.group === a.input.group);
      const max = Math.max(...peers.map((b) => b.output.n));
      return [{ key: "biggest", pass: a.output.n === max }];
    });
  },
  inputFromForm: () => ({ n: 0, group: "" }),
  title: (i) => String(i.n),
};

/** Answers (and cases) last changed `days` ago, before any test round. */
function answersFrom(store: ReturnType<typeof memoryStore>, days: number) {
  const at = new Date(Date.now() - days * 86_400_000);
  for (const c of store.cases) {
    c.updatedAt = at;
    for (const l of c.labels) l.updatedAt = at;
  }
}

/** A runner with three models that get every case right. */
function threeModels(
  store: ReturnType<typeof memoryStore>,
  suite: typeof double,
  { settings = false } = {},
) {
  return createRunner({
    ...(settings ? { suiteSettings: store } : {}),
    store,
    suites: [suite],
    models: {
      a: { label: "A", provider: "one" },
      b: { label: "B", provider: "two" },
      c: { label: "C", provider: "three" },
    },
    promptVersion: () => "v1",
    route: () => ({ model: "a", fallbackModel: null, reasoningEffort: null }),
    candidates: () => ({ models: ["a", "b", "c"] }),
  });
}

/** A round of tests of all three models on each of these days ago. */
async function testRounds(
  runner: ReturnType<typeof threeModels>,
  store: ReturnType<typeof memoryStore>,
  daysAgo: number[],
) {
  for (const days of daysAgo)
    for (const model of ["a", "b", "c"]) {
      const { run } = await runner.createRun({ suite: "double", model });
      await runner.runEval(run.id);
      const r = store.runs.find((x) => x.id === run.id);
      if (r) r.startedAt = new Date(Date.now() - days * 86_400_000);
    }
}

/** The suite without its check that compares answers with each other. */
const single = Object.fromEntries(
  Object.entries(double).filter(([k]) => k !== "gradeTogether"),
) as typeof double;

const kase = (n: number, over: Partial<NewCase> = {}): NewCase => ({
  suite: "double",
  input: { n, group: n < 3 ? "small" : "big" },
  tags: [`t${n}`],
  split: n % 2 ? "TEST" : "DEV",
  status: "ACTIVE",
  source: "OWNER",
  sourceRef: null,
  note: null,
  labels: [
    {
      kind: "EXPECTED",
      status: "CONFIRMED",
      value: { n: n * 2 },
      raterRole: "OWNER",
      raterId: null,
      note: null,
    },
  ],
  ...over,
});

const MODELS = {
  good: { label: "Good", provider: "acme" },
  bad: { label: "Bad", provider: "other" },
  thinker: {
    label: "Thinker",
    provider: "acme",
    efforts: ["low" as const, "high" as const],
  },
};

async function setup(ns = [1, 2, 3, 4, 5, 6], { batch = true } = {}) {
  const store = memoryStore();
  for (const n of ns) await store.createCase(kase(n));
  // Without batch: a store written before listOutputsFor and
  // findReusableHashes, which the runner must still serve.
  const plain: EvalStore = { ...store };
  delete plain.listOutputsFor;
  delete plain.findReusableHashes;
  const runner = createRunner({
    store: batch ? store : plain,
    suites: [double],
    models: MODELS,
    promptVersion: () => "v1",
    estimateCallCost: async (_op, model) => (model === "good" ? 0.01 : null),
    route: () => ({
      model: "good",
      fallbackModel: null,
      reasoningEffort: "low",
    }),
    candidates: () => ({
      models: ["good", "thinker"],
      fallbackModels: ["good", "bad"],
    }),
  });
  return { store, runner };
}

describe("runner, beyond a basic test", () => {
  it("picks cases by set: all, DEV, TEST, and a quick set", async () => {
    const { runner } = await setup();
    expect(await runner.casesFor("double", "ALL")).toHaveLength(6);
    expect(await runner.casesFor("double", "DEV")).toHaveLength(3);
    expect(await runner.casesFor("double", "TEST")).toHaveLength(3);
    expect((await runner.casesFor("double", "SMOKE")).length).toBeGreaterThan(
      0,
    );
  });

  it("estimates a test's cost from the price per call, or says it can't", async () => {
    const { runner } = await setup();
    expect(await runner.estimateRun("double", "good", "ALL", 2)).toEqual({
      cases: 6,
      answers: 12,
      reused: 0,
      costUsd: 0.12,
    });
    expect(
      (await runner.estimateRun("double", "bad", "ALL", 1)).costUsd,
    ).toBeNull();
  });

  it("prices only the answers that won't be reused", async () => {
    const { runner } = await setup([2, 4, 6]);
    const first = await runner.createRun({ suite: "double", model: "good" });
    await runner.runEval(first.run.id);
    // The same test again: every answer is reused, so it's free.
    expect(await runner.estimateRun("double", "good", "ALL", 1)).toMatchObject({
      answers: 3,
      reused: 3,
      costUsd: 0,
    });
    // A second repeat was never asked: those three are new calls.
    const two = await runner.estimateRun("double", "good", "ALL", 2);
    expect(two).toMatchObject({ answers: 6, reused: 3 });
    expect(two.costUsd).toBeCloseTo(0.03);
    // Fresh, or another reasoning setting: nothing to reuse.
    const fresh = await runner.estimateRun("double", "good", "ALL", 1, {
      fresh: true,
    });
    expect(fresh.reused).toBe(0);
    expect(fresh.costUsd).toBeCloseTo(0.03);
    expect(
      await runner.estimateRun("double", "good", "ALL", 1, {
        reasoningEffort: "high",
      }),
    ).toMatchObject({ reused: 0 });
  });

  it("stores the estimate a test starts with, counting reuse", async () => {
    const { runner } = await setup([2, 4]);
    const first = await runner.createRun({ suite: "double", model: "good" });
    expect(first.run.estimatedCostUsd).toBeCloseTo(0.02);
    await runner.runEval(first.run.id);
    const again = await runner.createRun({ suite: "double", model: "good" });
    expect(again.run.estimatedCostUsd).toBe(0);
    const fresh = await runner.createRun({
      suite: "double",
      model: "good",
      fresh: true,
    });
    expect(fresh.run.estimatedCostUsd).toBeCloseTo(0.02);
  });

  it("uses the operation's live reasoning setting unless told otherwise", async () => {
    const { runner } = await setup();
    const live = await runner.createRun({ suite: "double", model: "thinker" });
    expect(live.run.reasoningEffort).toBe("low");
    const other = await runner.createRun({
      suite: "double",
      model: "thinker",
      reasoningEffort: "high",
    });
    expect(other.run.reasoningEffort).toBe("high");
  });

  it("repeats each case, measures consistency, and records the judge's cost", async () => {
    const { store, runner } = await setup([2, 4]);
    const { run } = await runner.createRun({
      suite: "double",
      model: "good",
      repeats: 2,
    });
    await runner.runEval(run.id, { fresh: true });
    const m = (await store.getRun(run.id))?.metrics;
    expect(m?.outputs).toBe(4);
    expect(m?.consistency?.passed).toBe(2);
    expect(m?.judgeCostUsd).toBeCloseTo(0.002);
  });

  it("confirms a provisional answer at once, its tests still up to date", async () => {
    const { store, runner } = await setup([2]);
    const answer = (status: "PROVISIONAL" | "PENDING", n: number) =>
      kase(n, {
        labels: [
          {
            kind: "EXPECTED",
            status,
            value: { n: n * 2 },
            raterRole: "MODEL",
            raterId: null,
            note: null,
          },
        ],
      });
    const provisional = await store.createCase(answer("PROVISIONAL", 7));
    const pending = await store.createCase(answer("PENDING", 8));
    const { run } = await runner.createRun({ suite: "double", model: "good" });
    await runner.runEval(run.id);
    const stale = async () =>
      (await runner.board("double")).rows.find((r) => r.model === "good")?.test
        ?.stale;
    expect(await stale()).toBe(false);
    // A later moment, so the confirmation changes the answer's date.
    await new Promise((r) => setTimeout(r, 5));
    const regrade = vi.spyOn(store, "setOutputScores");
    const id = (c: { labels: { id: string }[] }) => c.labels[0]?.id ?? "";
    expect(await runner.confirmAnswer("double", id(provisional))).toEqual({
      rescored: false,
    });
    expect(regrade).not.toHaveBeenCalled();
    expect(await stale()).toBe(false);
    // A pending answer changes what's graded against: rescored.
    expect(await runner.confirmAnswer("double", id(pending))).toEqual({
      rescored: true,
    });
    regrade.mockRestore();
  });

  it("grades provisional answers, and never pending ones", async () => {
    const { store, runner } = await setup([]);
    await store.createCase(
      kase(7, {
        labels: [
          {
            kind: "EXPECTED",
            status: "PROVISIONAL",
            value: { n: 14 },
            raterRole: "MODEL",
            raterId: null,
            note: null,
          },
        ],
      }),
    );
    await store.createCase(
      kase(8, {
        labels: [
          {
            kind: "EXPECTED",
            status: "PENDING",
            value: { n: 16 },
            raterRole: "MODEL",
            raterId: null,
            note: null,
          },
        ],
      }),
    );
    const cases = await runner.casesFor("double", "ALL");
    expect(cases.map((c) => (c.input as In).n)).toEqual([7]);
  });

  it("adds checks across answers, per group", async () => {
    const { store, runner } = await setup([1, 2, 3, 4]);
    const { run } = await runner.createRun({ suite: "double", model: "good" });
    await runner.runEval(run.id);
    const byN = new Map(
      (await store.listOutputs(run.id)).map((o) => [
        (o.output as Out).n / 2,
        o.scores?.find((c) => c.key === "biggest")?.pass,
      ]),
    );
    expect(byN.get(2)).toBe(true);
    expect(byN.get(1)).toBe(false);
    expect(byN.get(4)).toBe(true);
  });

  it("records a failed answer with its reason, and the test still finishes", async () => {
    const { store, runner } = await setup([2]);
    await store.createCase(kase(-1));
    const { run } = await runner.createRun({ suite: "double", model: "good" });
    await runner.runEval(run.id);
    const r = await store.getRun(run.id);
    expect(r?.status).toBe("SUCCEEDED");
    expect(r?.metrics?.failed).toBe(1);
    expect(r?.metrics?.failureReason).toMatch(/Negative/);
  });

  it("fails a test on an unknown suite, and never throws", async () => {
    const { store, runner } = await setup();
    const r = await store.createRun({
      suite: "missing",
      model: "good",
      promptVersion: "v1",
      reasoningEffort: null,
      set: "ALL",
      repeats: 1,
      datasetVersion: null,
      graderVersion: "1",
      estimatedCostUsd: null,
      startedBy: null,
    });
    await runner.runEval(r.id);
    expect((await store.getRun(r.id))?.error).toMatch(/Unknown suite/);
    await expect(
      runner.createRun({ suite: "missing", model: "good" }),
    ).rejects.toThrow(/Unknown suite/);
  });

  it("leaves a test alone once it isn't running", async () => {
    const { store, runner } = await setup([2]);
    const { run } = await runner.createRun({ suite: "double", model: "good" });
    await store.updateRun(run.id, { status: "FAILED", error: "stopped" });
    await runner.runEval(run.id);
    expect(await store.listOutputs(run.id)).toHaveLength(0);
  });

  it("compares two tests case by case, with caveats when they differ", async () => {
    const { runner } = await setup();
    const a = await runner.createRun({ suite: "double", model: "good" });
    await runner.runEval(a.run.id);
    const b = await runner.createRun({ suite: "double", model: "bad" });
    await runner.runEval(b.run.id);
    const c = await runner.compare("double", a.run.id, b.run.id);
    expect(c?.comparison.n).toBe(6);
    expect(c?.comparison.byCheck.right?.champion.passed).toBe(6);
    expect(c?.comparison.byCheck.right?.challenger.passed).toBe(3);
    expect(c?.caveats).toEqual([]);
    // The cases graded differently, for reading side by side. The first
    // test misses them only on a nice-to-have check, which never fails an
    // answer, so these are cases the second broke.
    expect(c?.disagreements.map((d) => [d.caseId, d.kind])).toEqual([
      ["case_1", "broke"],
      ["case_5", "broke"],
      ["case_9", "broke"],
    ]);
    expect(await runner.compare("double", a.run.id, a.run.id)).toBeNull();
    expect(await runner.compare("double", a.run.id, "missing")).toBeNull();
  });

  it("retires easy cases past the floor of 50, after 4 rounds, and old drafts", async () => {
    const store = memoryStore();
    // Each case in its own group, so "biggest in its group" passes too.
    for (let n = 1; n <= 53; n++)
      await store.createCase(kase(n, { input: { n, group: `g${n}` } }));
    answersFrom(store, 30);
    await store.createCase(
      kase(99, {
        labels: [
          {
            kind: "EXPECTED",
            status: "PENDING",
            value: { n: 198 },
            raterRole: "MODEL",
            raterId: null,
            note: null,
          },
        ],
      }),
    );
    const draft = store.cases.find((c) => c.labels[0]?.status === "PENDING");
    if (!draft) throw new Error("setup");
    draft.createdAt = new Date(Date.now() - 40 * 86_400_000);
    // Three models that get every case right: every case is easy. (The
    // suite without its ranking: a compared case is never easy.)
    const runner = threeModels(store, single);

    // Three rounds: easy, but not proven yet.
    await testRounds(runner, store, [4, 3, 2]);
    let h = await runner.answerKeyHealth("double");
    expect(h.inUse).toBe(53);
    expect(h.easy).toHaveLength(53);
    expect(h.easyToRetire).toHaveLength(0);
    expect(h.staleDrafts.map((c) => c.id)).toEqual([draft.id]);

    // The fourth: proven, and 3 can go before the suite reaches 50.
    await testRounds(runner, store, [1]);
    h = await runner.answerKeyHealth("double");
    expect(h.easyToRetire).toHaveLength(3);
    expect(await runner.retireEasy("double")).toBe(3);
    expect(store.cases.filter((c) => c.status === "RETIRED")).toHaveLength(3);
    // Rescored: the tests now count only the 50 kept.
    const [latest] = await store.listRuns("double", { status: "SUCCEEDED" });
    expect(latest?.metrics?.byCheck.right?.n).toBe(50);
    expect(await runner.retireEasy("double")).toBe(0);

    expect(await runner.retireStaleDrafts("double")).toBe(1);
    expect(draft.status).toBe("RETIRED");
    expect(await runner.retireStaleDrafts("double")).toBe(0);
  });

  it("keeps a suite's own target as the floor, saved or in code", async () => {
    const store = memoryStore();
    for (let n = 1; n <= 20; n++)
      await store.createCase(kase(n, { input: { n, group: `g${n}` } }));
    answersFrom(store, 30);
    // Under 50 cases, nothing is retired by default.
    const plain = threeModels(store, single);
    await testRounds(plain, store, [4, 3, 2, 1]);
    expect(await plain.targetCases("double")).toBe(50);
    expect((await plain.answerKeyHealth("double")).easyToRetire).toHaveLength(
      0,
    );
    expect(plain.canSaveSuiteSettings).toBe(false);
    await expect(
      plain.saveSuiteSettings("double", { targetCases: 10, checks: {} }, "p"),
    ).rejects.toThrow(/pass suiteSettings/);
    // The suite's own target of 15 in code: 5 can go.
    const own = threeModels(store, { ...single, targetCases: 15 });
    expect(await own.targetCases("double")).toBe(15);
    expect((await own.answerKeyHealth("double")).easyToRetire).toHaveLength(5);
    // A saved target of 18 wins over the code's.
    const saved = threeModels(
      store,
      { ...single, targetCases: 15 },
      { settings: true },
    );
    expect(saved.canSaveSuiteSettings).toBe(true);
    await saved.saveSuiteSettings(
      "double",
      { targetCases: 18, checks: {} },
      "person-1",
    );
    expect(await saved.suiteSettings("double")).toEqual({
      targetCases: 18,
      checks: {},
    });
    expect(await saved.targetCases("double")).toBe(18);
    expect(await saved.retireEasy("double")).toBe(2);
  });

  it("removes a model from one suite's tests, and adds it back", async () => {
    const store = memoryStore();
    for (const n of [1, 2]) await store.createCase(kase(n));
    const runner = threeModels(store, double, { settings: true });
    await testRounds(runner, store, [0]);
    await runner.saveSuiteSettings(
      "double",
      { targetCases: 18, checks: {} },
      "person-1",
    );
    await runner.setModelRemoved("double", "c", true, "person-1");
    // Off the board and Test every model; its tests are kept.
    const board = await runner.board("double");
    expect(board.rows.map((r) => r.model)).toEqual(
      expect.not.arrayContaining(["c"]),
    );
    expect(board.removedModels).toEqual(["c"]);
    expect(await runner.modelsForSuite("double")).toEqual(["a", "b"]);
    expect(runner.modelsFor("double")).toEqual(["a", "b", "c"]);
    expect((await store.listRuns("double")).some((r) => r.model === "c")).toBe(
      true,
    );
    // Other settings stay as they were.
    expect(await runner.suiteSettings("double")).toEqual({
      targetCases: 18,
      checks: {},
      removedModels: ["c"],
    });
    // Removing it twice keeps one entry; adding it back clears the list.
    await runner.setModelRemoved("double", "c", true, "person-1");
    expect((await runner.suiteSettings("double")).removedModels).toEqual(["c"]);
    await runner.setModelRemoved("double", "c", false, "person-1");
    expect(await runner.suiteSettings("double")).toEqual({
      targetCases: 18,
      checks: {},
    });
    expect((await runner.board("double")).rows.map((r) => r.model)).toContain(
      "c",
    );
  });

  it("never removes the live model, and refuses a model the feature can't use", async () => {
    const store = memoryStore();
    const runner = threeModels(store, double, { settings: true });
    await expect(
      runner.setModelRemoved("double", "a", true, null),
    ).rejects.toThrow(
      "A is this feature's live model. Make another model live first.",
    );
    await expect(
      runner.setModelRemoved("double", "z", true, null),
    ).rejects.toThrow("Unknown model");
    // Saved by hand anyway, the live model stays on the board and is tested.
    await runner.saveSuiteSettings(
      "double",
      { targetCases: null, checks: {}, removedModels: ["a", "b"] },
      null,
    );
    expect(await runner.modelsForSuite("double")).toEqual(["a", "c"]);
    const board = await runner.board("double");
    expect(board.rows.map((r) => r.model)).toContain("a");
    expect(board.removedModels).toEqual(["b"]);
  });

  it("grades at the levels a person set, and records them on each test", async () => {
    const store = memoryStore();
    for (const n of [1, 2, 3, 4]) await store.createCase(kase(n));
    const runner = threeModels(store, double, { settings: true });
    const runOf = async () =>
      (await store.listRuns("double", { status: "SUCCEEDED" }))[0];

    const { run } = await runner.createRun({ suite: "double", model: "a" });
    await runner.runEval(run.id);
    // "Biggest in its group" is nice to have: its misses fail no answer.
    let done = await runOf();
    expect(done?.metrics?.allPass.passed).toBe(4);
    expect(done?.metrics?.levels).toEqual({
      right: "serious",
      biggest: "minor",
    });
    const [scored] = await store.listOutputs(run.id);
    expect(scored?.scores?.find((c) => c.key === "biggest")?.level).toBe(
      "minor",
    );

    // Made a must-pass check: the test was graded at other levels.
    await runner.saveSuiteSettings(
      "double",
      { targetCases: null, checks: { biggest: { severity: "serious" } } },
      "person-1",
    );
    let board = await runner.board("double");
    expect(board.suite.checks.find((c) => c.key === "biggest")?.severity).toBe(
      "serious",
    );
    expect(board.rows.find((r) => r.model === "a")?.test?.stale).toBe(true);

    // A free rescore grades it at the new levels: one biggest per group.
    await runner.rescoreRecent("double");
    done = await runOf();
    expect(done?.metrics?.allPass.passed).toBe(2);
    expect(done?.metrics?.levels?.biggest).toBe("serious");
    board = await runner.board("double");
    expect(board.rows.find((r) => r.model === "a")?.test?.stale).toBe(false);
  });

  it("counts a test graded before levels were kept as current", async () => {
    const store = memoryStore();
    for (const n of [1, 2]) await store.createCase(kase(n));
    const runner = threeModels(store, double, { settings: true });
    const { run } = await runner.createRun({ suite: "double", model: "a" });
    await runner.runEval(run.id);
    const r = store.runs.find((x) => x.id === run.id);
    if (r?.metrics) delete r.metrics.levels;
    const board = await runner.board("double");
    expect(board.rows.find((x) => x.model === "a")?.test?.stale).toBe(false);
  });

  it("puts a person's attack setting in the suite's priority", async () => {
    const store = memoryStore();
    const runner = threeModels(store, double, { settings: true });
    await runner.saveSuiteSettings(
      "double",
      { targetCases: null, checks: {}, attacks: "balanced" },
      "person-1",
    );
    expect((await runner.board("double")).suite.priority).toEqual({
      favor: "cost",
      attacks: "balanced",
    });
  });

  it("reads suite settings it can't load as none saved", async () => {
    const store = memoryStore();
    const runner = createRunner({
      store,
      suites: [single],
      models: {},
      promptVersion: () => "v1",
      suiteSettings: {
        getSuiteSettings: () => Promise.reject(new Error("no table")),
        saveSuiteSettings: () => Promise.resolve(),
      },
    });
    expect(await runner.suiteSettings("double")).toEqual({
      targetCases: null,
      checks: {},
    });
    expect(await runner.targetCases("double")).toBe(50);
  });

  it("counts a round only after a case's answer last changed", async () => {
    const store = memoryStore();
    for (let n = 1; n <= 52; n++)
      await store.createCase(kase(n, { input: { n, group: `g${n}` } }));
    answersFrom(store, 30);
    const runner = threeModels(store, single);
    await testRounds(runner, store, [4, 3, 2, 1]);
    // One answer changed yesterday afternoon: its earlier rounds don't count.
    const c = store.cases[0];
    const l = c?.labels[0];
    if (!c || !l) throw new Error("setup");
    l.updatedAt = new Date(Date.now() - 1.5 * 86_400_000);
    const rounds = await runner.easyRounds("double");
    expect(rounds[c.id]).toBe(1);
    expect(rounds[store.cases[1]?.id ?? ""]).toBe(4);
  });

  it("never retires as easy a case a ranking compares with others", async () => {
    const store = memoryStore();
    for (let n = 1; n <= 60; n++)
      await store.createCase(kase(n, { input: { n, group: `g${n}` } }));
    answersFrom(store, 30);
    // Only the even cases are compared with others (a ranking of them).
    const ranking = {
      ...double,
      gradeTogether: (answers: { input: { n: number } }[]) =>
        answers.map((a) => [
          { key: "biggest", pass: a.input.n % 2 === 0 ? true : null },
        ]),
    } as typeof double;
    const runner = threeModels(store, ranking);
    await testRounds(runner, store, [4, 3, 2, 1]);
    const h = await runner.answerKeyHealth("double");
    // Every model gets all 60 right, but only the 30 odd ones are easy.
    expect(h.easy.map((c) => (c.input as { n: number }).n % 2)).toEqual(
      Array(30).fill(1),
    );
    // Room for 10 before the floor of 50, all odd.
    expect(await runner.retireEasy("double")).toBe(10);
    const retired = store.cases.filter((c) => c.status === "RETIRED");
    expect(retired.every((c) => (c.input as { n: number }).n % 2 === 1)).toBe(
      true,
    );
  });

  it("leaves a retired case out of a rescored test's score", async () => {
    const { store, runner } = await setup([2, 4]);
    const { run } = await runner.createRun({ suite: "double", model: "good" });
    await runner.runEval(run.id);
    expect((await store.getRun(run.id))?.metrics?.byCheck.right?.n).toBe(2);
    const c = store.cases[0];
    if (!c) throw new Error("setup");
    await store.setCaseStatus(c.id, "RETIRED");
    await runner.rescoreRecent("double");
    expect((await store.getRun(run.id))?.metrics?.byCheck.right?.n).toBe(1);
  });

  it("leaves a retired case out of the board's must-pass count", async () => {
    const { store, runner } = await setup([2, 4, 6]);
    const { run } = await runner.createRun({ suite: "double", model: "good" });
    await runner.runEval(run.id);
    const c = store.cases[0];
    if (!c) throw new Error("setup");
    await store.setCaseStatus(c.id, "RETIRED");
    await runner.rescoreRecent("double");
    const b = await runner.board("double");
    const t = b.rows.find((r) => r.model === "good")?.test;
    // Counted over the same answers as the score: never over 100%.
    expect(t?.answers).toBe(2);
    expect(t?.answersNoSerious).toBe(2);
    expect(Object.keys(b.caseResults)).not.toContain(c.id);
  });

  it("rescores recent tests after answers change, for free", async () => {
    const { store, runner } = await setup([2]);
    const { run } = await runner.createRun({ suite: "double", model: "good" });
    await runner.runEval(run.id);
    const before = (await store.getRun(run.id))?.datasetVersion;
    const c = store.cases[0];
    const l = c?.labels[0];
    if (!c || !l) throw new Error("setup");
    l.value = { n: 999 };
    l.updatedAt = new Date(Date.now() + 1000);
    await runner.rescoreRecent("double");
    const after = await store.getRun(run.id);
    expect(after?.metrics?.byCheck.right?.passed).toBe(0);
    expect(after?.datasetVersion).not.toBe(before);
  });

  it("rescores every model's latest test, not only the newest ten", async () => {
    const { store, runner } = await setup([2]);
    const { run: first } = await runner.createRun({
      suite: "double",
      model: "good",
    });
    await runner.runEval(first.id);
    // Ten newer tests of another model push the first past the newest ten.
    for (let i = 0; i < 10; i++) {
      const { run } = await runner.createRun({ suite: "double", model: "bad" });
      await runner.runEval(run.id);
    }
    const c = store.cases[0];
    const l = c?.labels[0];
    if (!c || !l) throw new Error("setup");
    l.updatedAt = new Date(Date.now() + 1000);
    const current = (await store.getRun(first.id))?.datasetVersion;
    await runner.rescoreRecent("double");
    expect((await store.getRun(first.id))?.datasetVersion).not.toBe(current);
  });

  it("rescores the test the board shows after newer quick-set tests of the same model", async () => {
    const { store, runner } = await setup([2, 4]);
    const { run: full } = await runner.createRun({
      suite: "double",
      model: "good",
    });
    await runner.runEval(full.id);
    // A weekly check tests the live model on the quick set: ten newer
    // tests of the same model and setting, none of them on every case.
    for (let i = 0; i < 10; i++) {
      const { run } = await runner.createRun({
        suite: "double",
        model: "good",
        set: "SMOKE",
      });
      await runner.runEval(run.id);
    }
    const shown = (await runner.board("double")).rows.find(
      (r) => r.model === "good",
    )?.test;
    expect(shown?.runId).toBe(full.id);
    const c = store.cases[0];
    const l = c?.labels[0];
    if (!c || !l) throw new Error("setup");
    l.value = { n: 999 };
    l.updatedAt = new Date(Date.now() + 1000);
    await runner.rescoreRecent("double");
    expect((await store.getRun(full.id))?.metrics?.byCheck.right?.passed).toBe(
      1,
    );
    const row = (await runner.board("double")).rows.find(
      (r) => r.model === "good",
    );
    expect(row?.test?.stale).toBe(false);
  });

  it("stops a rescore before the time limit and finishes in another request", async () => {
    const { store } = await setup([2, 4]);
    const runner = createRunner({
      store,
      suites: [double],
      models: MODELS,
      promptVersion: () => "v1",
      // Room for the tests themselves: answers stop a minute early.
      requestLimitMs: 120_000,
    });
    const ids: string[] = [];
    for (const model of ["good", "bad"]) {
      const { run } = await runner.createRun({ suite: "double", model });
      await runner.runEval(run.id);
      ids.push(run.id);
    }
    // A request that started long ago is out of time before the first.
    const late = await runner.rescoreRecent("double", {
      requestStartedAt: Date.now() - 105_000,
    });
    expect(late).toEqual({ rescored: [], total: 2, left: 2, judgeCostUsd: 0 });
    // A request that already did one does the other: the grader's spend
    // (half a cent an answer here) is what this request's judge spent.
    const first = ids[0] ?? "";
    const rest = await runner.rescoreRecent("double", {
      skip: new Set([first]),
    });
    expect(rest.rescored).toEqual(ids.slice(1));
    expect(rest.total).toBe(2);
    expect(rest.left).toBe(0);
    expect(rest.judgeCostUsd).toBeCloseTo(0.001);
    // A number is still the limit of recent tests.
    expect((await runner.rescoreRecent("double", 1)).rescored).toHaveLength(2);
  });

  it("leaves a test it ran out of time on as it was", async () => {
    const { store, runner } = await setup([2, 4]);
    const { run } = await runner.createRun({ suite: "double", model: "good" });
    await runner.runEval(run.id);
    const before = await store.getRun(run.id);
    const r = await runner.rescoreRun(run.id, Date.now() - 1);
    expect(r).toEqual({ done: false, judgeCostUsd: 0 });
    expect(await store.getRun(run.id)).toEqual(before);
    expect(await runner.rescoreRun("missing")).toEqual({
      done: true,
      judgeCostUsd: 0,
    });
  });

  it("stops a test where its budget says, in the budget's words", async () => {
    const { store } = await setup();
    const calls: BudgetCall[] = [];
    const runner = createRunner({
      store,
      // One answer at a time, so the budget sees each one's cost.
      suites: [{ ...double, concurrency: 1 }],
      models: MODELS,
      promptVersion: () => "v1",
      budget: (call) => {
        calls.push(call);
        return call.spentUsd >= 0.004 ? "Over today's limit ($0.00)." : null;
      },
    });
    const { run } = await runner.createRun({ suite: "double", model: "good" });
    await runner.runEval(run.id);
    const done = await store.getRun(run.id);
    expect(done?.status).toBe("FAILED");
    expect(done?.error).toBe(
      "Stopped after 2 of 6 answers. Over today's limit ($0.00). Answers already given are reused at no cost when you test again.",
    );
    expect(await store.listOutputs(run.id)).toHaveLength(2);
    expect(calls[1]).toEqual({
      runId: run.id,
      suite: "double",
      operation: "double",
      model: "good",
      kind: "answer",
      spentUsd: 0.002,
    });
    // Testing again reuses the two answers, free: the budget isn't asked
    // for them.
    calls.length = 0;
    const again = await runner.createRun({ suite: "double", model: "good" });
    await runner.runEval(again.run.id);
    expect(calls[0]?.spentUsd).toBe(0);
    expect(
      (await store.listOutputs(again.run.id)).filter((x) => x.reused),
    ).toHaveLength(2);
  });

  it("estimates from what a model's answers really cost, when that's more", async () => {
    const { store } = await setup([2, 4]);
    const runner = createRunner({
      store,
      suites: [double],
      models: MODELS,
      promptVersion: () => "v1",
      // Tokens only: the app's price misses what each answer really pays.
      estimateCallCost: async () => 0.001,
      ceilingTimes: null,
    });
    const before = await runner.estimateRun("double", "good", "ALL", 1, {
      fresh: true,
    });
    expect(before.costUsd).toBeCloseTo(0.002);
    const { run } = await runner.createRun({ suite: "double", model: "good" });
    await runner.runEval(run.id);
    // Its answers cost 0.002 each: the estimate now uses that.
    const after = await runner.estimateRun("double", "good", "ALL", 1, {
      fresh: true,
    });
    expect(after.costUsd).toBeCloseTo(0.004);
    // A model with no price of its own takes what it cost last time.
    const unpriced = createRunner({
      store,
      suites: [double],
      models: MODELS,
      promptVersion: () => "v1",
    });
    expect(
      (await unpriced.estimateRun("double", "good", "ALL", 1, { fresh: true }))
        .costUsd,
    ).toBeCloseTo(0.004);
  });

  it("prices a model's first test from another model's, at its catalog prices", async () => {
    const { store } = await setup([2, 4]);
    const priced = {
      cheap: {
        label: "Cheap",
        provider: "acme",
        inputPer1M: 1,
        outputPer1M: 4,
      },
      dear: { label: "Dear", provider: "other", inputPer1M: 3, outputPer1M: 8 },
      odd: {
        label: "Odd",
        provider: "third",
        inputPer1M: 0.5,
        outputPer1M: 20,
      },
      unpriced: { label: "Unpriced", provider: "fourth" },
    };
    // Answers that take no time don't count toward cost per answer.
    const slow: typeof double = {
      ...double,
      async run(i, ctx) {
        await new Promise((r) => setTimeout(r, 2));
        return double.run(i, ctx);
      },
    };
    const route = () => ({
      model: "cheap",
      fallbackModel: null,
      reasoningEffort: null,
    });
    const runner = createRunner({
      store,
      suites: [slow],
      models: priced,
      promptVersion: () => "v1",
      route,
    });
    // Nothing tested yet: nothing to reprice.
    expect(
      (await runner.estimateRun("double", "dear", "ALL", 1)).costUsd,
    ).toBeNull();
    const { run } = await runner.createRun({ suite: "double", model: "cheap" });
    await runner.runEval(run.id);
    const perAnswer = (await store.getRun(run.id))?.metrics?.costPerAnswer;
    expect(perAnswer).toBeGreaterThan(0);
    // Input costs 3× and output 2×: the larger, so it overstates.
    expect(
      (await runner.estimateRun("double", "dear", "ALL", 1)).costUsd,
    ).toBeCloseTo((perAnswer as number) * 3 * 2);
    // Cheaper input, dearer output: still the larger ratio.
    expect(
      (await runner.estimateRun("double", "odd", "ALL", 1)).costUsd,
    ).toBeCloseTo((perAnswer as number) * 5 * 2);
    // No catalog price: still unknown, and the flat cap applies.
    expect(
      (await runner.estimateRun("double", "unpriced", "ALL", 1)).costUsd,
    ).toBeNull();
    // The app's price, or the model's own test, comes first.
    const given = createRunner({
      store,
      suites: [slow],
      models: priced,
      promptVersion: () => "v1",
      route,
      estimateCallCost: async () => 0.5,
    });
    expect(
      (await given.estimateRun("double", "dear", "ALL", 1)).costUsd,
    ).toBeCloseTo(1);
    expect(
      (await runner.estimateRun("double", "cheap", "ALL", 1, { fresh: true }))
        .costUsd,
    ).toBeCloseTo((perAnswer as number) * 2);
  });

  it("stops a test that spends more than twice its estimate", async () => {
    const { store } = await setup();
    const options = {
      store,
      suites: [{ ...double, concurrency: 1 }],
      models: MODELS,
      promptVersion: () => "v1",
      // Priced at a twentieth of what an answer really costs (0.002).
      estimateCallCost: async () => 0.0001,
    };
    const runner = createRunner(options);
    const { run } = await runner.createRun({ suite: "double", model: "good" });
    await runner.runEval(run.id, { fresh: true });
    const done = await store.getRun(run.id);
    expect(done?.status).toBe("FAILED");
    expect(done?.error).toBe(
      "Stopped after 1 of 6 answers. This test has spent 0.20¢, more than twice its estimate (0.060¢). Check the model's price, and what an answer pays for. Answers already given are reused at no cost when you test again.",
    );
    // Turned off, the same test finishes.
    const free = createRunner({ ...options, ceilingTimes: null });
    const again = await free.createRun({ suite: "double", model: "good" });
    await free.runEval(again.run.id, { fresh: true });
    expect((await store.getRun(again.run.id))?.status).toBe("SUCCEEDED");
  });

  it("asks the budget before the judge grades in a rescore, and stops where it says", async () => {
    const { store } = await setup([2, 4]);
    // The same grader, marked as asking the judge (half a cent an answer).
    const judged = {
      ...double,
      concurrency: 1,
      checks: double.checks.map((c) =>
        c.key === "right" ? { ...c, judged: true } : c,
      ),
    };
    const calls: BudgetCall[] = [];
    let refuse = false;
    const runner = createRunner({
      store,
      suites: [judged],
      models: MODELS,
      promptVersion: () => "v1",
      budget: (call) => {
        calls.push(call);
        return refuse && call.kind === "judge"
          ? "Tests are stopped until 3:00 PM."
          : null;
      },
    });
    const { run } = await runner.createRun({ suite: "double", model: "good" });
    await runner.runEval(run.id);
    // Asked before the judge grades each stored answer.
    calls.length = 0;
    const ok = await runner.rescoreRecent("double");
    expect(ok.waiting).toBeUndefined();
    expect(ok.judgeCostUsd).toBeCloseTo(0.001);
    expect(calls.map((c) => c.kind)).toEqual(["judge", "judge"]);
    expect(calls[0]).toMatchObject({
      runId: run.id,
      suite: "double",
      model: "good",
      spentUsd: 0,
    });
    // Refused: the judge isn't asked, and the rescore says why.
    refuse = true;
    const before = await store.getRun(run.id);
    const stopped = await runner.rescoreRecent("double");
    expect(stopped).toEqual({
      rescored: [],
      total: 1,
      left: 1,
      judgeCostUsd: 0,
      waiting: "Tests are stopped until 3:00 PM.",
    });
    expect(await store.getRun(run.id)).toEqual(before);
  });

  it("never asks the budget to regrade a suite without a judge", async () => {
    const { store } = await setup([2, 4]);
    const calls: BudgetCall[] = [];
    const runner = createRunner({
      store,
      suites: [double],
      models: MODELS,
      promptVersion: () => "v1",
      budget: (call) => {
        calls.push(call);
        return null;
      },
    });
    const { run } = await runner.createRun({ suite: "double", model: "good" });
    await runner.runEval(run.id);
    calls.length = 0;
    await runner.rescoreRecent("double");
    expect(calls).toEqual([]);
  });

  it("tells the app what the judge charged, in a test and in a rescore", async () => {
    const { store } = await setup([2, 4]);
    const charges: JudgeCharge[] = [];
    const runner = createRunner({
      store,
      suites: [double],
      models: MODELS,
      promptVersion: () => "v1",
      onJudgeCost: (c) => {
        charges.push(c);
      },
    });
    const { run } = await runner.createRun({ suite: "double", model: "good" });
    await runner.runEval(run.id);
    await runner.rescoreRecent("double");
    expect(charges.map((c) => c.during)).toEqual([
      "test",
      "test",
      "rescore",
      "rescore",
    ]);
    expect(charges[0]).toEqual({
      runId: run.id,
      suite: "double",
      operation: "double",
      usd: 0.0005,
      during: "test",
    });
    // A hook that fails doesn't fail the test.
    const broken = createRunner({
      store,
      suites: [double],
      models: MODELS,
      promptVersion: () => "v1",
      onJudgeCost: () => Promise.reject(new Error("down")),
    });
    const again = await broken.createRun({
      suite: "double",
      model: "good",
      fresh: true,
    });
    await broken.runEval(again.run.id, { fresh: true });
    expect((await store.getRun(again.run.id))?.status).toBe("SUCCEEDED");
  });

  it("caps a test with no estimate, so a new model's first test can't run uncapped", async () => {
    const { store } = await setup();
    const options = {
      store,
      suites: [{ ...double, concurrency: 1 }],
      models: MODELS,
      promptVersion: () => "v1",
      // No estimateCallCost and no earlier test: no estimate. Each answer
      // costs 0.002, so the third goes over.
      noEstimateCeilingUsd: 0.003,
    };
    const runner = createRunner(options);
    expect(
      (await runner.estimateRun("double", "good", "ALL", 1, { fresh: true }))
        .costUsd,
    ).toBeNull();
    const { run } = await runner.createRun({ suite: "double", model: "good" });
    await runner.runEval(run.id, { fresh: true });
    const done = await store.getRun(run.id);
    expect(done?.status).toBe("FAILED");
    expect(done?.error).toBe(
      "Stopped after 2 of 6 answers. This test has spent 0.40¢, more than 0.30¢, the most a test with no cost estimate may spend. Answers already given are reused at no cost when you test again.",
    );
    // Turned off, the same test finishes.
    const free = createRunner({ ...options, noEstimateCeilingUsd: null });
    const again = await free.createRun({ suite: "double", model: "good" });
    await free.runEval(again.run.id, { fresh: true });
    expect((await store.getRun(again.run.id))?.status).toBe("SUCCEEDED");
  });

  it("caps a test with no estimate even when the estimate ceiling is off", async () => {
    const { store } = await setup();
    const runner = createRunner({
      store,
      suites: [{ ...double, concurrency: 1 }],
      models: MODELS,
      promptVersion: () => "v1",
      ceilingTimes: null,
      noEstimateCeilingUsd: 0.003,
    });
    const { run } = await runner.createRun({ suite: "double", model: "good" });
    await runner.runEval(run.id, { fresh: true });
    expect((await store.getRun(run.id))?.status).toBe("FAILED");
  });

  it("uses the estimate's ceiling, not the flat cap, once there is an estimate", async () => {
    const { store } = await setup();
    const runner = createRunner({
      store,
      suites: [{ ...double, concurrency: 1 }],
      models: MODELS,
      promptVersion: () => "v1",
      // Priced right (0.002 an answer): six answers stay under twice that,
      // though they go over the flat cap.
      estimateCallCost: async () => 0.002,
      noEstimateCeilingUsd: 0.003,
    });
    const { run } = await runner.createRun({ suite: "double", model: "good" });
    await runner.runEval(run.id, { fresh: true });
    expect((await store.getRun(run.id))?.status).toBe("SUCCEEDED");
  });

  it("caps a test with no estimate at $5 by default", () => {
    expect(NO_ESTIMATE_CEILING_USD).toBe(5);
  });

  it("goes ahead when the budget can't be read", async () => {
    const { store } = await setup([2]);
    const runner = createRunner({
      store,
      suites: [double],
      models: MODELS,
      promptVersion: () => "v1",
      budget: () => Promise.reject(new Error("database blip")),
    });
    const { run } = await runner.createRun({ suite: "double", model: "good" });
    await runner.runEval(run.id);
    expect((await store.getRun(run.id))?.status).toBe("SUCCEEDED");
  });

  it("stops a running test within an answer or two of a stop", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const store = memoryStore();
      for (const n of [1, 2, 3, 4, 5, 6]) await store.createCase(kase(n));
      let answers = 0;
      const runner = createRunner({
        store,
        suites: [
          {
            ...double,
            concurrency: 1,
            async run(i: In, ctx: Parameters<typeof double.run>[1]) {
              answers++;
              // A person stops every test during the second answer.
              if (answers === 2) {
                expect(await runner.stopTests()).toBe(1);
                vi.setSystemTime(Date.now() + 3_000);
              }
              return double.run(i, ctx);
            },
          },
        ],
        models: MODELS,
        promptVersion: () => "v1",
      });
      const { run } = await runner.createRun({
        suite: "double",
        model: "good",
      });
      await runner.runEval(run.id);
      expect(answers).toBe(2);
      const done = await store.getRun(run.id);
      expect(done?.status).toBe("FAILED");
      expect(done?.error).toBe(STOPPED_BY_HAND);
      expect(await runner.stopTests(["double"])).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("gives the same board and estimates with or without the batch store methods", async () => {
    const results = [];
    for (const batch of [true, false]) {
      const { runner } = await setup([2, 4, 6], { batch });
      for (const model of ["good", "thinker"]) {
        const { run } = await runner.createRun({ suite: "double", model });
        await runner.runEval(run.id);
      }
      const b = await runner.board("double");
      results.push({
        rows: b.rows.map((r) => [r.key, r.test?.right, r.test?.total]),
        estimate: await runner.estimateRun("double", "good", "ALL", 2),
      });
    }
    expect(results[0]).toEqual(results[1]);
    expect(results[0]?.estimate).toMatchObject({ answers: 6, reused: 3 });
  });

  it("splits board rows by reasoning setting, and marks fallback-only models", async () => {
    const { runner } = await setup([2, 4]);
    for (const [model, reasoningEffort] of [
      ["good", undefined],
      ["thinker", undefined],
      ["thinker", "high"],
    ] as const) {
      const { run } = await runner.createRun({
        suite: "double",
        model,
        ...(reasoningEffort ? { reasoningEffort } : {}),
      });
      await runner.runEval(run.id);
    }
    const b = await runner.board("double");
    const thinkers = b.rows.filter((r) => r.model === "thinker");
    expect(thinkers.map((r) => r.variant).sort()).toEqual([false, true]);
    expect(thinkers.find((r) => r.variant)?.label).toMatch(/high reasoning/);
    expect(b.rows.find((r) => r.model === "bad")).toMatchObject({
      fallbackOnly: true,
      canMakeLive: false,
    });
    expect(
      b.rows.find((r) => r.model === "thinker" && !r.variant)?.liveOnly,
    ).toBe(true);
  });

  it("runs the weekly drift check: the quick set, live model and setting, fresh", async () => {
    const { store, runner } = await setup([2, 4]);
    const first = await runner.runDriftCheck("double");
    const second = await runner.runDriftCheck("double");
    const r = await store.getRun(first ?? "");
    expect(r).toMatchObject({
      set: "SMOKE",
      model: "good",
      reasoningEffort: "low",
      startedBy: SCHEDULED,
      status: "SUCCEEDED",
    });
    // Fresh: the second check called the model again instead of reusing.
    expect((await store.getRun(second ?? ""))?.metrics?.reused).toBe(0);
  });

  it("records a drift check as running before any answer comes back", async () => {
    const { store, runner } = await setup([2, 4]);
    const id = await runner.startDriftCheck("double");
    expect((await store.getRun(id ?? ""))?.status).toBe("RUNNING");
    expect(await store.listOutputs(id ?? "")).toHaveLength(0);
    await runner.runEval(id ?? "", { fresh: true });
    expect((await store.getRun(id ?? ""))?.status).toBe("SUCCEEDED");
  });

  it("skips the drift check for a suite with no cases in use", async () => {
    const { runner } = await setup([]);
    expect(await runner.runDriftCheck("double")).toBeNull();
  });

  it("needs routing to draw a board", async () => {
    const runner = createRunner({
      store: memoryStore(),
      suites: [double],
      models: MODELS,
      promptVersion: () => "v1",
    });
    await expect(runner.board("double")).rejects.toThrow(
      /route and candidates/,
    );
  });
});

describe("runner helpers", () => {
  it("names the error most failed answers share", () => {
    expect(
      commonError([null, "Timeout\nstack", "Timeout\nother", "Bad key"]),
    ).toBe("Timeout");
    expect(commonError([null, null])).toBeNull();
  });

  it("changes the dataset version when a case or its answer does", async () => {
    const store = memoryStore();
    const c = await store.createCase(kase(2));
    const v1 = datasetVersion([c]);
    expect(datasetVersion([c])).toBe(v1);
    c.updatedAt = new Date(+c.updatedAt + 1);
    expect(datasetVersion([c])).not.toBe(v1);
  });
});

describe("runner.casesInInstructions", () => {
  async function withGroups(instructionTexts?: (op: string) => string[]) {
    const store = memoryStore();
    const group = "numbers people double every morning";
    await store.createCase(kase(1, { input: { n: 1, group } }));
    await store.createCase(
      kase(2, { input: { n: 2, group }, status: "DRAFT" }),
    );
    await store.createCase(
      kase(3, { input: { n: 3, group }, status: "RETIRED" }),
    );
    await store.createCase(kase(4, { input: { n: 4, group: "other" } }));
    // A stored input the suite no longer reads.
    await store.createCase(kase(5, { input: { group } }));
    const runner = createRunner({
      store,
      suites: [double],
      models: MODELS,
      promptVersion: () => "v1",
      ...(instructionTexts ? { instructionTexts } : {}),
    });
    return runner;
  }

  it("lists cases in use or in draft whose text is in the instructions", async () => {
    const seen: string[] = [];
    const runner = await withGroups((op) => {
      seen.push(op);
      return ["Example: Numbers people double every morning, like 4."];
    });
    const found = await runner.casesInInstructions("double");
    expect(seen).toEqual(["double"]);
    expect(found.map((f) => f.title).sort()).toEqual(["1", "2", "A case"]);
    expect(found[0]?.found).toBe("numbers people double every morning");
  });

  it("finds nothing without instruction texts", async () => {
    const runner = await withGroups();
    expect(await runner.casesInInstructions("double")).toEqual([]);
  });
});
