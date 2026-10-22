/**
 * The contracts every store and set of suites must meet, as Vitest tests.
 *
 * @module evalkeeper/testing
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { FeedbackStore, NewRating } from "./feedback.js";
import { createRunner } from "./runner.js";
import {
  SettingsConflict,
  type Settings,
  type SettingsStore,
} from "./settings.js";
import type { EvalStore, NewCase } from "./store.js";
import { suiteContractProblems } from "./suiteContract.js";
import type { AnySuite, Suite } from "./types.js";

/**
 * Options for a store contract, for a store on tables that lack an
 * optional column.
 */
export type StoreContractOptions = {
  /**
   * Settings the store has no column for. The contract then checks the
   * store refuses a value for them (rather than losing it) and reads
   * them as null.
   */
  without?: ("temperature" | "maxOutputTokens")[];
};

/**
 * The contract every EvalStore must meet, as Vitest tests. Run it against
 * your store to know the runner will work on it. `make` must return an
 * empty store each time it's called; `opts.without` names run settings
 * its tables have no column for.
 *
 * @example
 * ```ts
 * import { describeStoreContract } from "@crowandraven/evalkeeper/testing";
 *
 * describeStoreContract("my store", () => myStore(freshDatabase()));
 * ```
 */
export function describeStoreContract(
  name: string,
  make: () => EvalStore | Promise<EvalStore>,
  opts: StoreContractOptions = {},
) {
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
    it("keeps a case's input, tags, and answers as given", async () => {
      const store = await make();
      const c = await store.createCase(newCase("s"));
      const [listed] = await store.listCases("s");
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

    it("lists a suite's cases oldest first, leaving out retired ones", async () => {
      const store = await make();
      const first = await store.createCase(newCase("s"));
      // Apart in time: two cases made in the same millisecond have no
      // oldest one.
      await new Promise((r) => setTimeout(r, 5));
      const second = await store.createCase(newCase("s"));
      await store.createCase(newCase("other"));
      await store.setCaseStatus(first.id, "RETIRED");
      expect((await store.listCases("s")).map((c) => c.id)).toEqual([
        second.id,
      ]);
      // On request, retired ones too, still oldest first.
      expect(
        (await store.listCases("s", { includeRetired: true })).map((c) => c.id),
      ).toEqual([first.id, second.id]);
    });

    it("adds answers without overwriting, and changes their status", async () => {
      const store = await make();
      const c = await store.createCase(newCase("s", { labels: [] }));
      const l = await store.addLabel(c.id, {
        kind: "EXPECTED",
        status: "PENDING",
        value: { want: "X" },
        raterRole: "MODEL",
        raterId: null,
        note: null,
      });
      await store.setLabelStatus(l.id, "CONFIRMED");
      const [listed] = await store.listCases("s");
      expect(listed?.labels).toHaveLength(1);
      expect(listed?.labels[0]?.status).toBe("CONFIRMED");
    });

    it("starts runs as running, lists them newest first, and filters", async () => {
      const store = await make();
      const a = await store.createRun(newRun("s"));
      await new Promise((r) => setTimeout(r, 5));
      const b = await store.createRun(newRun("s"));
      expect(a.status).toBe("RUNNING");
      expect((await store.listRuns("s")).map((r) => r.id)).toEqual([
        b.id,
        a.id,
      ]);
      expect(await store.listRuns("s", { limit: 1 })).toHaveLength(1);
      await store.updateRun(a.id, { status: "SUCCEEDED" });
      expect(
        (await store.listRuns("s", { status: "SUCCEEDED" })).map((r) => r.id),
      ).toEqual([a.id]);
      expect(await store.getRun("missing")).toBeNull();
    });

    const runSettings = [
      ["temperature", "temperature", 0.7],
      ["maxOutputTokens", "output cap", 4000],
    ] as const;
    for (const [field, words, value] of runSettings) {
      if (opts.without?.includes(field)) {
        it(`refuses a ${words} it has no column for, and keeps none`, async () => {
          const store = await make();
          await expect(
            store.createRun({ ...newRun("s"), [field]: value }),
          ).rejects.toThrow(field);
          const none = await store.createRun({ ...newRun("s"), [field]: null });
          expect((await store.getRun(none.id))?.[field] ?? null).toBeNull();
        });
        continue;
      }
      it(`keeps the ${words} a run was tested at`, async () => {
        const store = await make();
        const set = await store.createRun({ ...newRun("s"), [field]: value });
        const none = await store.createRun({ ...newRun("s"), [field]: null });
        expect((await store.getRun(set.id))?.[field]).toBe(value);
        expect((await store.getRun(none.id))?.[field] ?? null).toBeNull();
      });
    }

    it("updates a run only while it has the status it's guarded by", async () => {
      const store = await make();
      const r = await store.createRun(newRun("s"));
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
      const c = await store.createCase(newCase("s"));
      const r = await store.createRun(newRun("s"));
      const base = {
        runId: r.id,
        caseId: c.id,
        repeat: 1,
        requestHash: "h",
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
      const found = await store.findReusableOutput("h", new Date(0));
      expect(found?.id).toBe(o.id);
      expect(found?.output).toEqual({ text: "HELLO" });
      expect(
        await store.findReusableOutput("h", new Date(Date.now() + 60_000)),
      ).toBeNull();
    });

    it("lists several tests' outputs and reusable hashes in one call, where it can", async () => {
      const store = await make();
      const c = await store.createCase(newCase("s"));
      const [r1, r2, r3] = await Promise.all([
        store.createRun(newRun("s")),
        store.createRun(newRun("s")),
        store.createRun(newRun("s")),
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
      await store.createOutput({ ...base, runId: r1.id, requestHash: "a" });
      await store.createOutput({ ...base, runId: r2.id, requestHash: "b" });
      await store.createOutput({
        ...base,
        runId: r2.id,
        requestHash: "c",
        reused: true,
      });
      await store.createOutput({
        ...base,
        runId: r3.id,
        requestHash: "d",
        error: "boom",
        output: null,
      });
      if (store.listOutputsFor) {
        const outs = await store.listOutputsFor([r1.id, r2.id]);
        expect(outs.map((o) => o.requestHash).sort()).toEqual(["a", "b", "c"]);
        expect(await store.listOutputsFor([])).toEqual([]);
      }
      if (store.findReusableHashes) {
        expect(
          [
            ...(await store.findReusableHashes(
              ["a", "b", "c", "d", "e"],
              new Date(0),
            )),
          ].sort(),
        ).toEqual(["a", "b"]);
        expect(
          (await store.findReusableHashes(["a"], new Date(Date.now() + 60_000)))
            .size,
        ).toBe(0);
        expect((await store.findReusableHashes([], new Date(0))).size).toBe(0);
      }
    });

    it("runs a whole test through the runner", async () => {
      const store = await make();
      const echo: Suite<{ text: string }, { text: string }, { want: string }> =
        {
          key: "contract",
          operation: "contract",
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
      await store.createCase(newCase("contract"));
      const runner = createRunner({
        store,
        suites: [echo],
        models: { "model-a": { label: "Model A", provider: "acme" } },
        promptVersion: () => "v1",
      });
      const { run } = await runner.createRun({
        suite: "contract",
        model: "model-a",
      });
      await runner.runEval(run.id);
      const done = await store.getRun(run.id);
      expect(done?.status).toBe("SUCCEEDED");
      expect(done?.metrics?.allPass.passed).toBe(1);
    });
  });
}

/**
 * The contract every FeedbackStore must meet. `make` must return an empty
 * store each time it's called.
 */
export function describeFeedbackStoreContract(
  name: string,
  make: () => FeedbackStore | Promise<FeedbackStore>,
) {
  const rating = (over: Partial<NewRating> = {}): NewRating => ({
    operation: "triage",
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
    it("keeps a rating with its reason, input, and output, open", async () => {
      const store = await make();
      const f = await store.rate(rating());
      expect(f).toMatchObject({
        operation: "triage",
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
      const first = await store.rate(rating());
      await store.setFeedbackStatus(first.id, "DISMISSED");
      const changed = await store.rate(rating({ rating: "UP" }));
      expect(changed.id).toBe(first.id);
      expect(changed.status).toBe("OPEN");
      expect(changed.reason).toBeNull();
      await store.rate(rating({ raterId: "person-2" }));
      expect(await store.listFeedback()).toHaveLength(2);
    });

    it("takes a rating back", async () => {
      const store = await make();
      await store.rate(rating());
      await store.clearRating("person-1", "triage", "answer-1");
      expect(await store.listFeedback()).toHaveLength(0);
    });

    it("filters by feature, rating, status, and date, newest first", async () => {
      const store = await make();
      const a = await store.rate(rating({ targetId: "a" }));
      await new Promise((r) => setTimeout(r, 5));
      const b = await store.rate(rating({ targetId: "b", rating: "UP" }));
      await store.rate(rating({ targetId: "c", operation: "summary" }));
      expect(
        (await store.listFeedback({ operation: "triage" })).map((f) => f.id),
      ).toEqual([b.id, a.id]);
      expect(await store.listFeedback({ rating: "UP" })).toHaveLength(1);
      await store.setFeedbackStatus(a.id, "CASED", "case-1");
      const cased = await store.listFeedback({ status: "CASED" });
      expect(cased.map((f) => [f.id, f.caseId])).toEqual([[a.id, "case-1"]]);
      expect(
        await store.listFeedback({ since: new Date(Date.now() + 60_000) }),
      ).toHaveLength(0);
      expect(await store.listFeedback({ limit: 1 })).toHaveLength(1);
    });
  });
}

/**
 * The contract every SettingsStore must meet. `make` must return an empty
 * store each time it's called; `opts.without` names settings its tables
 * have no column for (see `StoreContractOptions`).
 */
export function describeSettingsStoreContract(
  name: string,
  make: () => SettingsStore | Promise<SettingsStore>,
  opts: { without?: "temperature"[] } = {},
) {
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
    it("has nothing live until the first switch, then numbers versions", async () => {
      const store = await make();
      expect(await store.liveVersion("triage")).toBeNull();
      const v1 = await store.switchTo("triage", create("a", null));
      const v2 = await store.switchTo("triage", create("b", v1.id));
      expect([v1.number, v2.number]).toEqual([1, 2]);
      expect(v2).toMatchObject({
        operation: "triage",
        model: "b",
        promptVersion: "p1",
      });
      expect((await store.liveVersion("triage"))?.id).toBe(v2.id);
      expect((await store.listVersions("triage")).map((v) => v.number)).toEqual(
        [2, 1],
      );
    });

    it("logs every switch, newest first, with who, why, and evidence", async () => {
      const store = await make();
      const v1 = await store.switchTo("triage", create("a", null));
      await store.switchTo("triage", {
        ...create("b", v1.id),
        kind: "PROMOTE",
        evidence: { runId: "r1", verdict: "BETTER" },
      });
      const [latest, first] = await store.listChanges("triage");
      expect(latest).toMatchObject({
        kind: "PROMOTE",
        fromVersionId: v1.id,
        reason: "to b",
        by: "person-1",
        evidence: { runId: "r1", verdict: "BETTER" },
      });
      expect(first).toMatchObject({ kind: "CHANGE", fromVersionId: null });
      expect(await store.listChanges("triage", { limit: 1 })).toHaveLength(1);
    });

    it("makes an earlier version live again without a new one", async () => {
      const store = await make();
      const v1 = await store.switchTo("triage", create("a", null));
      const v2 = await store.switchTo("triage", create("b", v1.id));
      await store.switchTo("triage", {
        versionId: v1.id,
        kind: "ROLLBACK",
        reason: "b was worse",
        by: "person-1",
        expectLive: v2.id,
      });
      expect((await store.liveVersion("triage"))?.id).toBe(v1.id);
      expect(await store.listVersions("triage")).toHaveLength(2);
    });

    it("refuses a switch decided against a live version that changed", async () => {
      const store = await make();
      const v1 = await store.switchTo("triage", create("a", null));
      await store.switchTo("triage", create("b", v1.id));
      await expect(
        store.switchTo("triage", create("c", v1.id)),
      ).rejects.toBeInstanceOf(SettingsConflict);
      expect((await store.liveVersion("triage"))?.model).toBe("b");
      expect(await store.listVersions("triage")).toHaveLength(2);
    });

    it("keeps a version's reasoning setting as named, even a newer one", async () => {
      const store = await make();
      const v1 = await store.switchTo("triage", {
        ...create("a", null),
        create: {
          settings: { ...settings("a"), reasoningEffort: "xhigh" },
          promptVersion: "p1",
        },
      });
      expect(v1.reasoningEffort).toBe("xhigh");
      expect((await store.liveVersion("triage"))?.reasoningEffort).toBe(
        "xhigh",
      );
    });

    if (opts.without?.includes("temperature")) {
      it("refuses a temperature it has no column for, and keeps none", async () => {
        const store = await make();
        await expect(
          store.switchTo("triage", {
            ...create("a", null),
            create: {
              settings: { ...settings("a"), temperature: 0.4 },
              promptVersion: "p1",
            },
          }),
        ).rejects.toThrow("temperature");
        expect(await store.liveVersion("triage")).toBeNull();
        const v1 = await store.switchTo("triage", create("a", null));
        expect(v1.temperature ?? null).toBeNull();
      });
    } else {
      it("keeps a version's temperature", async () => {
        const store = await make();
        const v1 = await store.switchTo("triage", {
          ...create("a", null),
          create: {
            settings: { ...settings("a"), temperature: 0.4 },
            promptVersion: "p1",
          },
        });
        expect(v1.temperature).toBe(0.4);
        expect((await store.liveVersion("triage"))?.temperature).toBe(0.4);
        const v2 = await store.switchTo("triage", create("b", v1.id));
        expect(v2.temperature ?? null).toBeNull();
      });
    }

    it("keeps each feature's versions and live one apart", async () => {
      const store = await make();
      await store.switchTo("triage", create("a", null));
      const other = await store.switchTo("summary", create("x", null));
      expect(other.number).toBe(1);
      expect((await store.liveVersion("triage"))?.model).toBe("a");
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
) {
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
