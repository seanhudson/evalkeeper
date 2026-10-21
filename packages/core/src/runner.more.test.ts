import { describe, expect, it } from "vitest";
import { z } from "zod";
import { memoryStore } from "./memoryStore.js";
import { commonError, createRunner, datasetVersion } from "./runner.js";
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
    expect(await runner.compare("double", a.run.id, a.run.id)).toBeNull();
    expect(await runner.compare("double", a.run.id, "missing")).toBeNull();
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
