import { describe, expect, it } from "vitest";
import { z } from "zod";
import { memoryStore } from "./memoryStore.js";
import { confirmedLabel, createRunner, requestHashFor } from "./runner.js";
import type { Suite } from "./types.js";

// A tiny suite: uppercase the text. "boom" fails, "slow" takes a while.
let calls = 0;
const upper: Suite<{ text: string }, { text: string }, { want: string }> = {
  key: "upper",
  operation: "upper",
  priority: { favor: "cost" },
  label: "Uppercase",
  description: "Uppercases text.",
  graderVersion: "1",
  input: z.object({ text: z.string() }),
  labelValue: z.object({ want: z.string() }),
  checks: [
    {
      key: "match",
      label: "Matches",
      description: "",
      kind: "label",
      severity: "serious",
    },
  ],
  async run(input, ctx) {
    calls++;
    if (input.text === "boom") throw new Error("boom");
    if (input.text === "credits")
      throw new Error("You have no credits remaining");
    if (input.text === "slow") await new Promise((r) => setTimeout(r, 30));
    ctx.onCost(0.001);
    return { text: input.text.toUpperCase() };
  },
  async grade(_input, output, label) {
    return [{ key: "match", pass: label ? output.text === label.want : null }];
  },
  inputFromForm: () => ({ text: "" }),
  title: (i) => i.text,
};

const MODELS = { "model-a": { label: "Model A", provider: "acme" } };

async function setup(texts: string[], extra = {}) {
  const store = memoryStore();
  for (const text of texts)
    await store.createCase({
      suite: "upper",
      input: { text },
      tags: [],
      split: "DEV",
      status: "ACTIVE",
      source: "OWNER",
      sourceRef: null,
      note: null,
      labels: [
        {
          kind: "EXPECTED",
          status: "CONFIRMED",
          value: { want: text.toUpperCase() },
          raterRole: "OWNER",
          raterId: null,
          note: null,
        },
      ],
    });
  const runner = createRunner({
    store,
    suites: [upper],
    models: MODELS,
    promptVersion: () => "v1",
    ...extra,
  });
  return { store, runner };
}

describe("runner", () => {
  it("answers, grades, reuses identical requests, and calls again when fresh", async () => {
    calls = 0;
    const { store, runner } = await setup(["hello", "world", "boom"]);
    const first = await runner.createRun({ suite: "upper", model: "model-a" });
    await runner.runEval(first.run.id);
    const r1 = (await store.getRun(first.run.id))!;
    expect(r1.status).toBe("SUCCEEDED");
    expect(r1.metrics).toMatchObject({ outputs: 3, failed: 1, reused: 0 });
    expect(r1.metrics!.failureReason).toBe("boom");
    expect(calls).toBe(3);

    const second = await runner.createRun({ suite: "upper", model: "model-a" });
    await runner.runEval(second.run.id);
    // Two reused; the failed one is tried again.
    expect(calls).toBe(4);
    expect((await store.getRun(second.run.id))!.metrics!.reused).toBe(2);

    const third = await runner.createRun({ suite: "upper", model: "model-a" });
    await runner.runEval(third.run.id, { fresh: true });
    expect(calls).toBe(7);
  });

  it("ignores pending answers", async () => {
    const { store, runner } = await setup(["hello"]);
    store.cases[0]!.labels[0]!.status = "PENDING";
    expect(confirmedLabel(store.cases[0]!.labels)).toBeNull();
    expect(await runner.casesFor("upper", "ALL")).toHaveLength(0);
  });

  it("hands the rest to a new request when time runs out", async () => {
    const handed: number[] = [];
    const { store, runner } = await setup(["a", "slow", "c", "d"], {
      // Room for about one answer per leg.
      requestLimitMs: 60_020,
      continueRun: async (_id: string, o: { leg: number }) => {
        handed.push(o.leg);
        return true;
      },
    });
    upper.concurrency = 1;
    const { run } = await runner.createRun({
      suite: "upper",
      model: "model-a",
    });
    await runner.runEval(run.id);
    expect(handed).toEqual([2]);
    expect((await store.getRun(run.id))!.status).toBe("RUNNING");
    // The next leg (no limit now) skips what's answered and finishes.
    const done = setupLeg(store);
    await done.runEval(run.id, { leg: 2 });
    expect((await store.getRun(run.id))!.status).toBe("SUCCEEDED");
    expect((await store.getRun(run.id))!.metrics!.outputs).toBe(4);
    delete upper.concurrency;
  });

  it("stops when the provider is out of credits", async () => {
    const { store, runner } = await setup(["credits", "b", "c"]);
    upper.concurrency = 1;
    const { run } = await runner.createRun({
      suite: "upper",
      model: "model-a",
    });
    await runner.runEval(run.id);
    const r = (await store.getRun(run.id))!;
    expect(r.status).toBe("FAILED");
    expect(r.error).toMatch(/acme account is out of credits.*1 of 3/);
    delete upper.concurrency;
  });

  it("marks a test stuck only when nothing happened recently", async () => {
    const { store, runner } = await setup(["a"]);
    const { run } = await runner.createRun({
      suite: "upper",
      model: "model-a",
    });
    store.runs[0]!.startedAt = new Date(Date.now() - 20 * 60_000);
    await runner.stopStuckRuns("upper");
    expect((await store.getRun(run.id))!.status).toBe("FAILED");
  });

  it("rescores stored answers after an answer key changes, with no calls", async () => {
    calls = 0;
    const { store, runner } = await setup(["hello"]);
    const { run } = await runner.createRun({
      suite: "upper",
      model: "model-a",
    });
    await runner.runEval(run.id);
    store.cases[0]!.labels[0]!.value = { want: "something else" };
    store.cases[0]!.labels[0]!.updatedAt = new Date(Date.now() + 1000);
    await runner.rescoreRun(run.id);
    expect(calls).toBe(1);
    expect((await store.getRun(run.id))!.metrics!.byCheck.match!.passed).toBe(
      0,
    );
  });
});

function setupLeg(store: ReturnType<typeof memoryStore>) {
  return createRunner({
    store,
    suites: [upper],
    models: MODELS,
    promptVersion: () => "v1",
  });
}

describe("board", () => {
  it("shows each model's test, the live one first, and who can be the fallback", async () => {
    const store = memoryStore();
    for (const text of ["a", "b", "c"])
      await store.createCase({
        suite: "upper",
        input: { text },
        tags: [],
        split: "DEV",
        status: "ACTIVE",
        source: "OWNER",
        sourceRef: null,
        note: null,
        labels: [
          {
            kind: "EXPECTED",
            status: "CONFIRMED",
            value: { want: text.toUpperCase() },
            raterRole: "OWNER",
            raterId: null,
            note: null,
          },
        ],
      });
    const runner = createRunner({
      store,
      suites: [upper],
      models: {
        "model-a": { label: "Model A", provider: "acme" },
        "model-b": { label: "Model B", provider: "other" },
        "model-c": { label: "Model C", provider: "acme" },
      },
      promptVersion: () => "v1",
      route: () => ({
        model: "model-a",
        fallbackModel: null,
        reasoningEffort: null,
      }),
      candidates: () => ({ models: ["model-a", "model-b", "model-c"] }),
    });
    for (const model of ["model-a", "model-b"]) {
      const { run } = await runner.createRun({ suite: "upper", model });
      await runner.runEval(run.id, { fresh: true });
    }
    const b = await runner.board("upper");
    expect(b.rows.map((r) => r.model)).toEqual([
      "model-a",
      "model-b",
      "model-c",
    ]);
    expect(b.rows[0]!.live).toBe(true);
    // Three cases are too few to call them equal, so it can't go live yet;
    // a fallback only needs a current, complete test from another provider.
    expect(b.rows[1]).toMatchObject({
      vsLive: "TOO_FEW",
      canMakeLive: false,
      canMakeFallback: true,
    });
    // Untested, and the same provider as live.
    expect(b.rows[2]).toMatchObject({ test: null, canMakeFallback: false });
    expect(b.caseResults[store.cases[0]!.id]).toEqual({ passed: 2, models: 2 });
  });
});

describe("temperature", () => {
  it("leaves requests without a temperature hashed as before", () => {
    const base = {
      suite: "upper",
      model: "model-a",
      effort: null,
      prompt: "v1",
      input: { text: "a" },
      repeat: 1,
    };
    expect(requestHashFor({ ...base, temperature: null })).toBe(
      requestHashFor(base),
    );
    expect(requestHashFor({ ...base, temperature: 0.7 })).not.toBe(
      requestHashFor(base),
    );
  });

  it("tests at the live temperature, and says older tests are out of date", async () => {
    let temperature: number | null = 0.2;
    const seen: (number | null | undefined)[] = [];
    const suite = {
      ...upper,
      async run(input: { text: string }, ctx: Parameters<typeof upper.run>[1]) {
        seen.push(ctx.temperature);
        return upper.run(input, ctx);
      },
    };
    const { store, runner } = await setup(["a", "b"], {
      suites: [suite],
      route: () => ({
        model: "model-a",
        fallbackModel: null,
        reasoningEffort: null,
        temperature,
      }),
      candidates: () => ({ models: ["model-a"] }),
    });
    const first = await runner.createRun({ suite: "upper", model: "model-a" });
    expect(first.run.temperature).toBe(0.2);
    await runner.runEval(first.run.id);
    expect(seen).toEqual([0.2, 0.2]);
    expect((await runner.board("upper")).rows[0]?.test?.stale).toBe(false);

    // The live temperature changes: the old test is out of date, and a new
    // one doesn't reuse answers given at the old temperature.
    temperature = 0.9;
    expect((await runner.board("upper")).rows[0]?.test?.stale).toBe(true);
    // Started later than the first, so the board reads it as the newest.
    await new Promise((r) => setTimeout(r, 5));
    const second = await runner.createRun({ suite: "upper", model: "model-a" });
    await runner.runEval(second.run.id);
    expect(seen).toEqual([0.2, 0.2, 0.9, 0.9]);
    const outputs = await store.listOutputs(second.run.id);
    expect(outputs.every((o) => !o.reused)).toBe(true);
    expect((await runner.board("upper")).rows[0]?.test?.stale).toBe(false);
  });

  it("tests at a temperature it's given, and none without a route", async () => {
    const { runner } = await setup(["a"]);
    const given = await runner.createRun({
      suite: "upper",
      model: "model-a",
      temperature: 0.5,
    });
    expect(given.run.temperature).toBe(0.5);
    const none = await runner.createRun({ suite: "upper", model: "model-a" });
    expect(none.run.temperature).toBeNull();
  });

  it("runs the weekly check at the live temperature", async () => {
    const { store, runner } = await setup(["a", "b", "c"], {
      route: () => ({
        model: "model-a",
        fallbackModel: null,
        reasoningEffort: null,
        temperature: 0.3,
      }),
      candidates: () => ({ models: ["model-a"] }),
    });
    const id = await runner.startDriftCheck("upper");
    expect(id).not.toBeNull();
    expect((await store.getRun(id ?? ""))?.temperature).toBe(0.3);
  });
});
