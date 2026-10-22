/**
 * The contracts every store and set of suites must meet, as tests. They
 * register with Vitest by default, or with the test functions you pass
 * (`node:test` with `assertExpect`, say), so Vitest stays optional.
 *
 * @module evalkeeper/testing
 */
import { z } from "zod";
import type { ContractExpect } from "./assertExpect.js";
import { BLIND_RATER, blindRating, nextToRate, skipMark } from "./blind.js";
import type { FeedbackStore, NewRating } from "./feedback.js";
import { confirmedLabel } from "./labels.js";
import { createRunner } from "./runner.js";
import {
  CHANGE_KINDS,
  SettingsConflict,
  type Settings,
  type SettingsStore,
} from "./settings.js";
import type { EvalStore, NewCase } from "./store.js";
import { suiteContractProblems } from "./suiteContract.js";
import type { AnySuite, Suite } from "./types.js";
import { readCheckSummary, type ReadCheckReport } from "./readCheck.js";

export {
  assertExpect,
  type ContractExpect,
  type ContractMatchers,
} from "./assertExpect.js";

/**
 * The test functions a contract registers its tests with. Vitest's
 * `describe`, `it`, `expect`, and `afterAll` fit, and so do `node:test`'s
 * `describe`, `it`, and `after` with `assertExpect`.
 */
export type ContractTest = {
  /** Groups tests, like Vitest's or node:test's `describe`. */
  describe: (name: string, fn: () => void) => unknown;
  /** Adds a test, like Vitest's or node:test's `it`. */
  it: (name: string, fn: () => Promise<void> | void) => unknown;
  /** Checks values: Vitest's `expect`, or `assertExpect` on node:assert. */
  expect: ContractExpect;
  /**
   * Runs once after a group's tests, like Vitest's `afterAll` or
   * node:test's `after`. Needed only with `cleanup`.
   */
  afterAll?: (fn: () => Promise<void> | void) => unknown;
};

/**
 * Vitest's test functions, or why they couldn't be loaded. A dynamic
 * import (awaited as this module loads), so this module loads without
 * Vitest when you pass your own test functions.
 */
const vitest: ContractTest | Error = await import("vitest").then(
  (v) => ({
    describe: v.describe,
    it: v.it,
    expect: v.expect,
    afterAll: v.afterAll,
  }),
  (e: unknown) => (e instanceof Error ? e : new Error(String(e))),
);

/** The test functions to register with: the ones given, else Vitest's. */
function testFunctions(given: ContractTest | undefined): ContractTest {
  if (given) return given;
  if (!(vitest instanceof Error)) return vitest;
  throw new Error(
    `Vitest couldn't be loaded (${vitest.message}), so pass your own test functions: { test: { describe, it, expect: assertExpect } } with describe and it from "node:test", and assertExpect from this module.`,
  );
}

/** Options every contract takes. */
export type ContractOptions = {
  /** The test functions to use. Vitest's by default. */
  test?: ContractTest;
};

/**
 * Options for running a store contract on a database that holds other
 * rows too, such as a shared development database.
 */
export type ScopedContractOptions = ContractOptions & {
  /**
   * A prefix for every suite and feature the contract writes (each test
   * adds its own after it), so its rows never mix with others and `make`
   * needn't return an empty store. Without it, `make` must return an
   * empty store every time.
   */
  scope?: string;
  /**
   * Deletes the rows whose suite or feature starts with the scope, once
   * after the contract's tests (and so also any left by an earlier run
   * that stopped early). Needs `scope`, and `afterAll` among the test
   * functions. For Prisma, `deleteScopedRows` from
   * `@crowandraven/evalkeeper-prisma`.
   */
  cleanup?: (scope: string) => Promise<unknown>;
};

/**
 * A namer for each test: in a scoped contract, a fresh prefix per test
 * (so tests don't see each other's rows); otherwise names as they are.
 */
function scopeNames(scope: string | undefined): () => (name: string) => string {
  if (scope === undefined) return () => (name) => name;
  if (!scope.trim())
    throw new Error(
      'A contract\'s scope must be a prefix with some text in it, such as "contract-": an empty one would match every row.',
    );
  const run = Date.now().toString(36);
  let n = 0;
  return () => {
    const prefix = `${scope}${run}-${(n++).toString(36)}-`;
    return (name) => prefix + name;
  };
}

/** Registers a scoped contract's cleanup, after checking it can run. */
function registerCleanup(t: ContractTest, opts: ScopedContractOptions) {
  const { cleanup, scope } = opts;
  if (!cleanup) return;
  if (scope === undefined)
    throw new Error(
      "cleanup needs a scope: it deletes only the rows the scope names. Without a scope, return an empty store from make instead.",
    );
  if (!t.afterAll)
    throw new Error(
      "cleanup runs after the contract's tests, so pass afterAll (node:test's after) with your test functions.",
    );
  t.afterAll(async () => {
    await cleanup(scope);
  });
}

/**
 * Options for a store contract, for a store on tables that lack an
 * optional column.
 */
export type StoreContractOptions = ScopedContractOptions & {
  /**
   * Settings the store has no column for. The contract then checks the
   * store refuses a value for them (rather than losing it) and reads
   * them as null.
   */
  without?: ("temperature" | "maxOutputTokens")[];
};

/**
 * The contract every EvalStore must meet. Run it against your store to
 * know the runner will work on it. `make` must return an empty store each
 * time it's called, unless `opts.scope` is set: then every suite the
 * contract writes (and every request hash it picks) starts with the
 * scope, the tests never look past their own rows, and `opts.cleanup`
 * deletes those suites' cases, answers, tests, and outputs afterward, so
 * it can run on a database that holds other rows. `opts.without` names
 * run settings its tables have no column for; `opts.test` passes test
 * functions other than Vitest's.
 *
 * @example
 * ```ts
 * import { describeStoreContract } from "@crowandraven/evalkeeper/testing";
 *
 * describeStoreContract("my store", () => myStore(freshDatabase()));
 *
 * // On a database with other rows: only rows starting "contract-" are
 * // written, and cleanup deletes only those.
 * describeStoreContract("our tables", () => prismaStore(prisma, map), {
 *   scope: "contract-",
 *   cleanup: (scope) => deleteScopedRows(prisma, scope, { map }),
 * });
 * ```
 */
export function describeStoreContract(
  name: string,
  make: () => EvalStore | Promise<EvalStore>,
  opts: StoreContractOptions = {},
) {
  const t = testFunctions(opts.test);
  const { describe, it, expect } = t;
  const names = scopeNames(opts.scope);
  const newCase = (suite: string, over: Partial<NewCase> = {}): NewCase => ({
    suite,
    input: { text: "hello", nested: { n: 1 } },
    tags: ["a", "b"],
    split: "DEV",
    status: "ACTIVE",
    source: "OWNER",
    sourceRef: null,
    note: null,
    labels: [
      {
        kind: "EXPECTED",
        status: "CONFIRMED",
        value: { want: "HELLO" },
        raterRole: "OWNER",
        raterId: null,
        note: null,
      },
    ],
    ...over,
  });
  const newRun = (suite: string) => ({
    suite,
    model: "model-a",
    promptVersion: "v1",
    reasoningEffort: null,
    set: "ALL" as const,
    repeats: 1,
    datasetVersion: null,
    graderVersion: "1",
    estimatedCostUsd: null,
    startedBy: null,
  });

  describe(`EvalStore contract: ${name}`, () => {
    registerCleanup(t, opts);

    it("keeps a case's input, tags, and answers as given", async () => {
      const store = await make();
      const n = names();
      const c = await store.createCase(newCase(n("s")));
      const [listed] = await store.listCases(n("s"));
      expect(listed?.id).toBe(c.id);
      expect(listed?.input).toEqual({ text: "hello", nested: { n: 1 } });
      expect(listed?.tags).toEqual(["a", "b"]);
      expect(listed?.labels).toHaveLength(1);
      expect(listed?.labels[0]).toMatchObject({
        kind: "EXPECTED",
        status: "CONFIRMED",
        value: { want: "HELLO" },
      });
    });

    it("keeps where a case came from and when, retired ones too", async () => {
      // Drafts from activity and imports skip what they made before by
      // source and sourceRef, so both must read back as written.
      const store = await make();
      const n = names();
      const before = Date.now();
      const c = await store.createCase(
        newCase(n("s"), {
          status: "DRAFT",
          source: "ACTIVITY",
          sourceRef: "answer-42",
          note: "Flagged by an admin.",
          labels: [],
        }),
      );
      await store.setCaseStatus(c.id, "RETIRED");
      const [listed] = await store.listCases(n("s"), {
        includeRetired: true,
      });
      expect(listed).toMatchObject({
        status: "RETIRED",
        source: "ACTIVITY",
        sourceRef: "answer-42",
        note: "Flagged by an admin.",
        labels: [],
      });
      // Within a second either way: some databases round to the second.
      expect(+(listed?.createdAt ?? 0)).toBeGreaterThanOrEqual(before - 1000);
      expect(+(listed?.createdAt ?? 0)).toBeLessThanOrEqual(Date.now() + 1000);
    });

    it("lists a suite's cases oldest first, leaving out retired ones", async () => {
      const store = await make();
      const n = names();
      const first = await store.createCase(newCase(n("s")));
      // Apart in time: two cases made in the same millisecond have no
      // oldest one.
      await new Promise((r) => setTimeout(r, 5));
      const second = await store.createCase(newCase(n("s")));
      await store.createCase(newCase(n("other")));
      await store.setCaseStatus(first.id, "RETIRED");
      expect((await store.listCases(n("s"))).map((c) => c.id)).toEqual([
        second.id,
      ]);
      // On request, retired ones too, still oldest first.
      expect(
        (await store.listCases(n("s"), { includeRetired: true })).map(
          (c) => c.id,
        ),
      ).toEqual([first.id, second.id]);
    });

    it("adds answers without overwriting, and changes their status", async () => {
      const store = await make();
      const n = names();
      const c = await store.createCase(newCase(n("s"), { labels: [] }));
      const l = await store.addLabel(c.id, {
        kind: "EXPECTED",
        status: "PENDING",
        value: { want: "X" },
        raterRole: "MODEL",
        raterId: null,
        note: null,
      });
      await store.setLabelStatus(l.id, "CONFIRMED");
      const [listed] = await store.listCases(n("s"));
      expect(listed?.labels).toHaveLength(1);
      expect(listed?.labels[0]?.status).toBe("CONFIRMED");
    });

    it("keeps each rater's blind rating and skip beside others' answers", async () => {
      const store = await make();
      const n = names();
      const c = await store.createCase(newCase(n("s")));
      const before = (await store.listCases(n("s")))[0]?.updatedAt;
      // Apart in time, so a skip that touched the case would show.
      await new Promise((r) => setTimeout(r, 5));
      await store.addLabel(c.id, skipMark("rater-1"));
      const [skipped] = await store.listCases(n("s"));
      expect(skipped?.updatedAt).toEqual(before);
      expect(skipped?.labels.find((l) => l.status === "SKIPPED")).toMatchObject(
        { value: null, raterId: "rater-1", raterRole: BLIND_RATER },
      );
      // The skip is never graded against: the owner's answer stays in use.
      expect(confirmedLabel(skipped?.labels ?? [])?.value).toEqual({
        want: "HELLO",
      });
      expect(nextToRate(await store.listCases(n("s")), "rater-1")).toBeNull();
      expect(nextToRate(await store.listCases(n("s")), "rater-2")?.id).toBe(
        c.id,
      );

      await store.addLabel(
        c.id,
        blindRating({
          raterId: "rater-2",
          value: { want: "HI" },
          reason: "It greets",
        }),
      );
      const [rated] = await store.listCases(n("s"));
      expect(rated?.labels).toHaveLength(3);
      expect(rated?.labels.find((l) => l.raterId === "rater-2")).toMatchObject({
        status: "CONFIRMED",
        value: { want: "HI" },
        note: "It greets",
      });
      // The owner's answer is still there, unchanged.
      expect(rated?.labels.find((l) => l.raterRole === "OWNER")).toMatchObject({
        status: "CONFIRMED",
        value: { want: "HELLO" },
      });
      expect(nextToRate(await store.listCases(n("s")), "rater-2")).toBeNull();
    });

    it("starts runs as running, lists them newest first, and filters", async () => {
      const store = await make();
      const n = names();
      const a = await store.createRun(newRun(n("s")));
      await new Promise((r) => setTimeout(r, 5));
      const b = await store.createRun(newRun(n("s")));
      expect(a.status).toBe("RUNNING");
      expect((await store.listRuns(n("s"))).map((r) => r.id)).toEqual([
        b.id,
        a.id,
      ]);
      expect(await store.listRuns(n("s"), { limit: 1 })).toHaveLength(1);
      await store.updateRun(a.id, { status: "SUCCEEDED" });
      expect(
        (await store.listRuns(n("s"), { status: "SUCCEEDED" })).map(
          (r) => r.id,
        ),
      ).toEqual([a.id]);
      expect(await store.getRun(n("missing"))).toBeNull();
    });

    const runSettings = [
      ["temperature", "temperature", 0.7],
      ["maxOutputTokens", "output cap", 4000],
    ] as const;
    for (const [field, words, value] of runSettings) {
      if (opts.without?.includes(field)) {
        it(`refuses a ${words} it has no column for, and keeps none`, async () => {
          const store = await make();
          const n = names();
          await expect(
            store.createRun({ ...newRun(n("s")), [field]: value }),
          ).rejects.toThrow(field);
          const none = await store.createRun({
            ...newRun(n("s")),
            [field]: null,
          });
          expect((await store.getRun(none.id))?.[field] ?? null).toBeNull();
        });
        continue;
      }
      it(`keeps the ${words} a run was tested at`, async () => {
        const store = await make();
        const n = names();
        const set = await store.createRun({
          ...newRun(n("s")),
          [field]: value,
        });
        const none = await store.createRun({
          ...newRun(n("s")),
          [field]: null,
        });
        expect((await store.getRun(set.id))?.[field]).toBe(value);
        expect((await store.getRun(none.id))?.[field] ?? null).toBeNull();
      });
    }

    it("updates a run only while it has the status it's guarded by", async () => {
      const store = await make();
      const n = names();
      const r = await store.createRun(newRun(n("s")));
      await store.updateRun(r.id, { status: "FAILED" }, { status: "RUNNING" });
      await store.updateRun(
        r.id,
        { status: "SUCCEEDED" },
        { status: "RUNNING" },
      );
      expect((await store.getRun(r.id))?.status).toBe("FAILED");
    });

    it("stores outputs and scores, and finds only originals to reuse", async () => {
      const store = await make();
      const n = names();
      const c = await store.createCase(newCase(n("s")));
      const r = await store.createRun(newRun(n("s")));
      const base = {
        runId: r.id,
        caseId: c.id,
        repeat: 1,
        requestHash: n("h"),
        output: { text: "HELLO" },
        error: null,
        scores: null,
        costUsd: 0.01,
        ms: 12,
        reused: false,
      };
      const o = await store.createOutput(base);
      await store.createOutput({ ...base, reused: true });
      await store.createOutput({ ...base, error: "boom", output: null });
      await store.setOutputScores(o.id, [{ key: "match", pass: true }]);
      const outs = await store.listOutputs(r.id);
      expect(outs).toHaveLength(3);
      expect(outs.find((x) => x.id === o.id)?.scores).toEqual([
        { key: "match", pass: true },
      ]);
      const found = await store.findReusableOutput(n("h"), new Date(0));
      expect(found?.id).toBe(o.id);
      expect(found?.output).toEqual({ text: "HELLO" });
      expect(
        await store.findReusableOutput(n("h"), new Date(Date.now() + 60_000)),
      ).toBeNull();
    });

    it("lists several tests' outputs and reusable hashes in one call, where it can", async () => {
      const store = await make();
      const n = names();
      const c = await store.createCase(newCase(n("s")));
      const [r1, r2, r3] = await Promise.all([
        store.createRun(newRun(n("s"))),
        store.createRun(newRun(n("s"))),
        store.createRun(newRun(n("s"))),
      ]);
      const base = {
        caseId: c.id,
        repeat: 1,
        output: { text: "HELLO" },
        error: null,
        scores: null,
        costUsd: 0.01,
        ms: 12,
        reused: false,
      };
      await store.createOutput({ ...base, runId: r1.id, requestHash: n("a") });
      await store.createOutput({ ...base, runId: r2.id, requestHash: n("b") });
      await store.createOutput({
        ...base,
        runId: r2.id,
        requestHash: n("c"),
        reused: true,
      });
      await store.createOutput({
        ...base,
        runId: r3.id,
        requestHash: n("d"),
        error: "boom",
        output: null,
      });
      if (store.listOutputsFor) {
        const outs = await store.listOutputsFor([r1.id, r2.id]);
        expect(outs.map((o) => o.requestHash).sort()).toEqual(
          [n("a"), n("b"), n("c")].sort(),
        );
        expect(await store.listOutputsFor([])).toEqual([]);
      }
      if (store.findReusableHashes) {
        expect(
          [
            ...(await store.findReusableHashes(
              ["a", "b", "c", "d", "e"].map(n),
              new Date(0),
            )),
          ].sort(),
        ).toEqual([n("a"), n("b")].sort());
        expect(
          (
            await store.findReusableHashes(
              [n("a")],
              new Date(Date.now() + 60_000),
            )
          ).size,
        ).toBe(0);
        expect((await store.findReusableHashes([], new Date(0))).size).toBe(0);
      }
    });

    it("runs a whole test through the runner", async () => {
      const store = await make();
      const n = names();
      const key = n("contract");
      const echo: Suite<{ text: string }, { text: string }, { want: string }> =
        {
          key,
          operation: key,
          priority: { favor: "quality" },
          label: "Contract",
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
          run: async (i) => ({ text: i.text.toUpperCase() }),
          grade: async (_i, out, want) => [
            { key: "match", pass: want ? out.text === want.want : null },
          ],
          inputFromForm: () => ({ text: "" }),
          title: (i) => i.text,
        };
      await store.createCase(newCase(key));
      const runner = createRunner({
        store,
        suites: [echo],
        models: { "model-a": { label: "Model A", provider: "acme" } },
        promptVersion: () => "v1",
      });
      const { run } = await runner.createRun({ suite: key, model: "model-a" });
      await runner.runEval(run.id);
      const done = await store.getRun(run.id);
      expect(done?.status).toBe("SUCCEEDED");
      expect(done?.metrics?.allPass.passed).toBe(1);
    });
  });
}

/**
 * The contract every FeedbackStore must meet. `make` must return an empty
 * store each time it's called, unless `opts.scope` is set (see
 * `describeStoreContract`): then every feature the contract rates starts
 * with the scope, and its lists ask for those features only.
 */
export function describeFeedbackStoreContract(
  name: string,
  make: () => FeedbackStore | Promise<FeedbackStore>,
  opts: ScopedContractOptions = {},
) {
  const t = testFunctions(opts.test);
  const { describe, it, expect } = t;
  const names = scopeNames(opts.scope);
  const scoped = opts.scope !== undefined;
  const rating = (
    operation: string,
    over: Partial<NewRating> = {},
  ): NewRating => ({
    operation,
    targetId: "answer-1",
    raterId: "person-1",
    rating: "DOWN",
    reason: "Wrong queue",
    excerpt: "billing",
    input: { subject: "Refund", body: "Please refund me." },
    output: { category: "bug" },
    ...over,
  });

  describe(`FeedbackStore contract: ${name}`, () => {
    registerCleanup(t, opts);

    it("keeps a rating with its reason, input, and output, open", async () => {
      const store = await make();
      const op = names()("triage");
      const f = await store.rate(rating(op));
      expect(f).toMatchObject({
        operation: op,
        rating: "DOWN",
        reason: "Wrong queue",
        excerpt: "billing",
        input: { subject: "Refund", body: "Please refund me." },
        output: { category: "bug" },
        status: "OPEN",
        caseId: null,
      });
    });

    it("keeps one rating per person per answer, and reopens a changed one", async () => {
      const store = await make();
      const op = names()("triage");
      const first = await store.rate(rating(op));
      await store.setFeedbackStatus(first.id, "DISMISSED");
      const changed = await store.rate(rating(op, { rating: "UP" }));
      expect(changed.id).toBe(first.id);
      expect(changed.status).toBe("OPEN");
      expect(changed.reason).toBeNull();
      await store.rate(rating(op, { raterId: "person-2" }));
      expect(
        await store.listFeedback(scoped ? { operation: op } : {}),
      ).toHaveLength(2);
    });

    it("takes a rating back", async () => {
      const store = await make();
      const op = names()("triage");
      await store.rate(rating(op));
      await store.clearRating("person-1", op, "answer-1");
      expect(
        await store.listFeedback(scoped ? { operation: op } : {}),
      ).toHaveLength(0);
    });

    it("filters by feature, rating, status, and date, newest first", async () => {
      const store = await make();
      const n = names();
      const op = n("triage");
      const mine = scoped ? { operation: op } : {};
      const a = await store.rate(rating(op, { targetId: "a" }));
      await new Promise((r) => setTimeout(r, 5));
      const b = await store.rate(rating(op, { targetId: "b", rating: "UP" }));
      await store.rate(rating(n("summary"), { targetId: "c" }));
      expect(
        (await store.listFeedback({ operation: op })).map((f) => f.id),
      ).toEqual([b.id, a.id]);
      expect(await store.listFeedback({ ...mine, rating: "UP" })).toHaveLength(
        1,
      );
      await store.setFeedbackStatus(a.id, "CASED", "case-1");
      const cased = await store.listFeedback({ ...mine, status: "CASED" });
      expect(cased.map((f) => [f.id, f.caseId])).toEqual([[a.id, "case-1"]]);
      expect(
        await store.listFeedback({ since: new Date(Date.now() + 60_000) }),
      ).toHaveLength(0);
      expect(await store.listFeedback({ limit: 1 })).toHaveLength(1);
    });
  });
}

/** Options for the settings store contract. */
export type SettingsStoreContractOptions = ScopedContractOptions & {
  /** Settings the store has no column for (see `StoreContractOptions`). */
  without?: "temperature"[];
};

/**
 * The contract every SettingsStore must meet. `make` must return an empty
 * store each time it's called, unless `opts.scope` is set (see
 * `describeStoreContract`): then every feature the contract versions
 * starts with the scope. `opts.without` names settings its tables have no
 * column for (see `StoreContractOptions`).
 */
export function describeSettingsStoreContract(
  name: string,
  make: () => SettingsStore | Promise<SettingsStore>,
  opts: SettingsStoreContractOptions = {},
) {
  const t = testFunctions(opts.test);
  const { describe, it, expect } = t;
  const names = scopeNames(opts.scope);
  const settings = (model: string): Settings => ({
    model,
    fallbackModel: null,
    reasoningEffort: null,
    maxOutputTokens: null,
  });
  const create = (model: string, expectLive: string | null) => ({
    create: { settings: settings(model), promptVersion: "p1" },
    kind: "CHANGE" as const,
    reason: `to ${model}`,
    by: "person-1",
    expectLive,
  });

  describe(`SettingsStore contract: ${name}`, () => {
    registerCleanup(t, opts);

    it("has nothing live until the first switch, then numbers versions", async () => {
      const store = await make();
      const op = names()("triage");
      expect(await store.liveVersion(op)).toBeNull();
      const v1 = await store.switchTo(op, create("a", null));
      const v2 = await store.switchTo(op, create("b", v1.id));
      expect([v1.number, v2.number]).toEqual([1, 2]);
      expect(v2).toMatchObject({
        operation: op,
        model: "b",
        promptVersion: "p1",
      });
      expect((await store.liveVersion(op))?.id).toBe(v2.id);
      expect((await store.listVersions(op)).map((v) => v.number)).toEqual([
        2, 1,
      ]);
    });

    it("logs every switch, newest first, with who, why, and evidence", async () => {
      const store = await make();
      const op = names()("triage");
      const v1 = await store.switchTo(op, create("a", null));
      await store.switchTo(op, {
        ...create("b", v1.id),
        kind: "PROMOTE",
        evidence: { runId: "r1", verdict: "BETTER" },
      });
      const [latest, first] = await store.listChanges(op);
      expect(latest).toMatchObject({
        kind: "PROMOTE",
        fromVersionId: v1.id,
        reason: "to b",
        by: "person-1",
        evidence: { runId: "r1", verdict: "BETTER" },
      });
      expect(first).toMatchObject({ kind: "CHANGE", fromVersionId: null });
      expect(await store.listChanges(op, { limit: 1 })).toHaveLength(1);
    });

    it("makes an earlier version live again without a new one", async () => {
      const store = await make();
      const op = names()("triage");
      const v1 = await store.switchTo(op, create("a", null));
      const v2 = await store.switchTo(op, create("b", v1.id));
      await store.switchTo(op, {
        versionId: v1.id,
        kind: "ROLLBACK",
        reason: "b was worse",
        by: "person-1",
        expectLive: v2.id,
      });
      expect((await store.liveVersion(op))?.id).toBe(v1.id);
      expect(await store.listVersions(op)).toHaveLength(2);
    });

    it("refuses a switch decided against a live version that changed", async () => {
      const store = await make();
      const op = names()("triage");
      const v1 = await store.switchTo(op, create("a", null));
      await store.switchTo(op, create("b", v1.id));
      await expect(
        store.switchTo(op, create("c", v1.id)),
      ).rejects.toBeInstanceOf(SettingsConflict);
      expect((await store.liveVersion(op))?.model).toBe("b");
      expect(await store.listVersions(op)).toHaveLength(2);
    });

    it("keeps a version's reasoning setting as named, even a newer one", async () => {
      const store = await make();
      const op = names()("triage");
      const v1 = await store.switchTo(op, {
        ...create("a", null),
        create: {
          settings: { ...settings("a"), reasoningEffort: "xhigh" },
          promptVersion: "p1",
        },
      });
      expect(v1.reasoningEffort).toBe("xhigh");
      expect((await store.liveVersion(op))?.reasoningEffort).toBe("xhigh");
    });

    if (opts.without?.includes("temperature")) {
      it("refuses a temperature it has no column for, and keeps none", async () => {
        const store = await make();
        const op = names()("triage");
        await expect(
          store.switchTo(op, {
            ...create("a", null),
            create: {
              settings: { ...settings("a"), temperature: 0.4 },
              promptVersion: "p1",
            },
          }),
        ).rejects.toThrow("temperature");
        expect(await store.liveVersion(op)).toBeNull();
        const v1 = await store.switchTo(op, create("a", null));
        expect(v1.temperature ?? null).toBeNull();
      });
    } else {
      it("keeps a version's temperature", async () => {
        const store = await make();
        const op = names()("triage");
        const v1 = await store.switchTo(op, {
          ...create("a", null),
          create: {
            settings: { ...settings("a"), temperature: 0.4 },
            promptVersion: "p1",
          },
        });
        expect(v1.temperature).toBe(0.4);
        expect((await store.liveVersion(op))?.temperature).toBe(0.4);
        const v2 = await store.switchTo(op, create("b", v1.id));
        expect(v2.temperature ?? null).toBeNull();
      });
    }

    it("keeps every kind of change, with its evidence", async () => {
      const store = await make();
      const op = names()("triage");
      let live = (await store.switchTo(op, create("a", null))).id;
      for (const kind of CHANGE_KINDS.slice(1))
        live = (
          await store.switchTo(op, {
            ...create(kind.toLowerCase(), live),
            kind,
            evidence: kind === "PROMOTE" ? { runId: "r1" } : undefined,
          })
        ).id;
      const changes = await store.listChanges(op);
      expect(changes.map((c) => c.kind)).toEqual([...CHANGE_KINDS].reverse());
      expect(changes.map((c) => c.evidence)).toEqual([
        null,
        null,
        null,
        null,
        { runId: "r1" },
        null,
      ]);
    });

    it("keeps each feature's versions and live one apart", async () => {
      const store = await make();
      const n = names();
      await store.switchTo(n("triage"), create("a", null));
      const other = await store.switchTo(n("summary"), create("x", null));
      expect(other.number).toBe(1);
      expect((await store.liveVersion(n("triage")))?.model).toBe("a");
    });
  });
}

/**
 * The contract every set of suites should meet, so people confirming
 * answers weeks later (and the pages) can read them: unique keys, a label
 * and help for every top-level field of each suite's input and answer,
 * a description for every check, and starter cases that fit the suite's
 * own schemas. One test per suite, listing what's missing in plain words
 * (`suiteContractProblems`).
 *
 * @param name - What the tests are called, e.g. "our suites".
 * @param suites - Every suite the app registers.
 * @param opts - Test functions other than Vitest's.
 *
 * @example
 * ```ts
 * import { describeSuiteContract } from "@crowandraven/evalkeeper/testing";
 * import { SUITES } from "../lib/suites";
 *
 * describeSuiteContract("our suites", SUITES);
 * ```
 */
export function describeSuiteContract(
  name: string,
  suites: readonly AnySuite[],
  opts: ContractOptions = {},
) {
  const { describe, it, expect } = testFunctions(opts.test);
  describe(`Suite contract: ${name}`, () => {
    it("has unique keys", () => {
      expect(
        suiteContractProblems(suites).filter((p) =>
          p.endsWith("another suite has the same key."),
        ),
      ).toEqual([]);
    });
    for (const suite of suites)
      it(`${suite.key}: every field, check, and starter can be read`, () => {
        expect(
          suiteContractProblems([suite]),
          "What's missing for people to read this suite",
        ).toEqual([]);
      });
  });
}

/**
 * A read-only check, as a test, that a store mapped onto your own tables
 * reads what's already there: one test per suite that fails listing every
 * case, answer, test, and output that doesn't parse, with counts. It only
 * reads, so it's the check to run first, on a copy of real data. Pass the
 * report from `checkStoreReads` (any store) or `prismaReadCheck` (sees a
 * Prisma table's values before the store fills in defaults).
 *
 * @param name - What the tests are called, e.g. "our answer key".
 * @param check - Makes the report; called once, when the tests run.
 * @param opts - The suite keys to name a test for, and test functions
 * other than Vitest's.
 *
 * @example
 * ```ts
 * import { describeMappedReadCheck } from "@crowandraven/evalkeeper/testing";
 * import { prismaReadCheck } from "@crowandraven/evalkeeper-prisma";
 *
 * describeMappedReadCheck(
 *   "our answer key",
 *   () => prismaReadCheck(prisma, map, { suites: SUITES }),
 *   { suites: SUITES.map((s) => s.key) },
 * );
 * ```
 */
export function describeMappedReadCheck(
  name: string,
  check: () => Promise<ReadCheckReport>,
  opts: ContractOptions & { suites: readonly string[] },
) {
  const { describe, it, expect } = testFunctions(opts.test);
  let report: Promise<ReadCheckReport> | null = null;
  const once = () => (report ??= check());
  describe(`Read check: ${name}`, () => {
    for (const key of opts.suites)
      it(`${key}: every case, answer, test, and output reads`, async () => {
        const found = (await once()).suites.find((s) => s.suite === key);
        expect(found, `The check found no report for ${key}`).toMatchObject({
          suite: key,
        });
        if (!found) return;
        expect(
          found.problems,
          readCheckSummary({ suites: [found] }).join("\n"),
        ).toEqual([]);
      });
  });
}
