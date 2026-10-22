import { describe, expect, it } from "vitest";
import { memoryStore } from "./memoryStore.js";
import { checkStoreReads } from "./readCheck.js";
import {
  assertExpect,
  describeFeedbackStoreContract,
  describeMappedReadCheck,
  describeSettingsStoreContract,
  describeStoreContract,
  type ContractTest,
} from "./testing.js";

describeStoreContract("memoryStore", () => memoryStore());
describeFeedbackStoreContract("memoryStore", () => memoryStore());
describeSettingsStoreContract("memoryStore", () => memoryStore());

// The scoped contracts on one store that holds other rows, as a shared
// development database would: they pass without an empty store, and
// leave the other rows as they were.
const shared = memoryStore();
const kept = await shared.createCase({
  suite: "s",
  input: { text: "ours" },
  tags: [],
  split: "TEST",
  status: "ACTIVE",
  source: "OWNER",
  sourceRef: null,
  note: null,
  labels: [],
});
const keptRun = await shared.createRun({
  suite: "s",
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
await shared.createOutput({
  runId: keptRun.id,
  caseId: kept.id,
  repeat: 1,
  requestHash: "h",
  output: { text: "OURS" },
  error: null,
  scores: null,
  costUsd: 0.02,
  ms: 3,
  reused: false,
});
const keptRating = await shared.rate({
  operation: "triage",
  targetId: "answer-1",
  raterId: "person-1",
  rating: "UP",
  reason: null,
  excerpt: null,
  input: null,
  output: null,
});
const keptVersion = await shared.switchTo("triage", {
  create: {
    settings: {
      model: "ours",
      fallbackModel: null,
      reasoningEffort: null,
      maxOutputTokens: null,
    },
    promptVersion: "p0",
  },
  kind: "CHANGE",
  reason: "ours",
  by: "person-1",
  expectLive: null,
});
const before = structuredClone({
  cases: shared.cases.filter((c) => c.suite === "s"),
  runs: shared.runs.filter((r) => r.suite === "s"),
  outputs: [...shared.outputs],
  feedback: [...shared.feedback],
  versions: [...shared.versions],
  changes: [...shared.changes],
});

const scope = "contract-";
describeStoreContract("memoryStore, scoped", () => shared, { scope });
describeFeedbackStoreContract("memoryStore, scoped", () => shared, { scope });
describeSettingsStoreContract("memoryStore, scoped", () => shared, { scope });

describe("the scoped contracts", () => {
  it("left the other rows as they were, and wrote only scoped ones", async () => {
    expect(await shared.listCases("s")).toEqual(before.cases);
    expect(await shared.listRuns("s")).toEqual(before.runs);
    expect(await shared.listOutputs(keptRun.id)).toEqual(before.outputs);
    expect(await shared.findReusableOutput("h", new Date(0))).toEqual(
      before.outputs[0],
    );
    expect(await shared.listFeedback({ operation: "triage" })).toEqual([
      keptRating,
    ]);
    expect(await shared.liveVersion("triage")).toEqual(keptVersion);
    expect(await shared.listVersions("triage")).toEqual(before.versions);
    expect(await shared.listChanges("triage")).toEqual(before.changes);
    const written = [
      ...shared.cases.map((c) => c.suite),
      ...shared.runs.map((r) => r.suite),
      // Outputs belong to a test; the runner's hashes aren't names.
      ...shared.outputs.map(
        (o) => shared.runs.find((r) => r.id === o.runId)?.suite ?? "",
      ),
      ...shared.feedback.map((f) => f.operation),
      ...shared.versions.map((v) => v.operation),
    ].filter((n) => !["s", "triage"].includes(n));
    expect(written.length).toBeGreaterThan(20);
    expect(written.filter((n) => !n.startsWith(scope))).toEqual([]);
  });
});

describe("contract options", () => {
  // Test functions that run each group at once and keep each test, so a
  // contract's setup errors show here and its tests can run under
  // assertExpect.
  function recorder(withAfterAll = true) {
    const tests: { name: string; fn: () => Promise<void> | void }[] = [];
    const after: (() => Promise<void> | void)[] = [];
    const test: ContractTest = {
      describe: (_name, fn) => {
        fn();
      },
      it: (name, fn) => tests.push({ name, fn }),
      expect: assertExpect,
      ...(withAfterAll ? { afterAll: (fn) => after.push(fn) } : {}),
    };
    return { test, tests, after };
  }

  it("runs the contracts with the test functions it's given", async () => {
    const { test, tests } = recorder();
    describeStoreContract("given", () => memoryStore(), { test });
    describeFeedbackStoreContract("given", () => memoryStore(), { test });
    describeSettingsStoreContract("given", () => memoryStore(), { test });
    expect(tests.length).toBeGreaterThan(15);
    for (const t of tests) await t.fn();
  });

  it("cleans up a scope once, after the tests", async () => {
    const { test, after } = recorder();
    const cleaned: string[] = [];
    describeStoreContract("scoped", () => memoryStore(), {
      test,
      scope: "mine-",
      cleanup: async (s) => cleaned.push(s),
    });
    expect(cleaned).toEqual([]);
    for (const fn of after) await fn();
    expect(cleaned).toEqual(["mine-"]);
  });

  it("refuses a scope or cleanup that could reach other rows", () => {
    const { test } = recorder();
    const cleanup = async () => undefined;
    expect(() => {
      describeStoreContract("x", () => memoryStore(), { test, scope: " " });
    }).toThrow(/non-empty|some text/);
    expect(() => {
      describeFeedbackStoreContract("x", () => memoryStore(), {
        test,
        cleanup,
      });
    }).toThrow(/needs a scope/);
    expect(() => {
      describeSettingsStoreContract("x", () => memoryStore(), {
        test: recorder(false).test,
        scope: "s-",
        cleanup,
      });
    }).toThrow(/afterAll/);
  });

  it("fails the read check on a store with problems, saying what", async () => {
    const store = memoryStore();
    const run = await store.createRun({
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
    // Trust boundary: a bad value planted the way a store could read one.
    Object.assign(run, { status: "DONE" });
    store.runs.splice(0, 1, run);
    const { test, tests } = recorder();
    describeMappedReadCheck(
      "bad",
      () => checkStoreReads(store, { suites: ["triage", "other"] }),
      {
        test,
        suites: ["triage", "other", "unknown"],
      },
    );
    const [triage, other, unknown] = tests;
    await expect(triage?.fn()).rejects.toThrow(
      /triage: 0 cases, 0 answers, 1 test, and 0 outputs; 1 problem/,
    );
    await other?.fn();
    await expect(unknown?.fn()).rejects.toThrow(/no report for unknown/);
  });
});

describeMappedReadCheck(
  "memoryStore",
  () => checkStoreReads(shared, { suites: ["s"] }),
  { suites: ["s"] },
);
