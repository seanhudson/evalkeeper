import {
  deleteScopedRows,
  prismaJudgmentCache,
  prismaReadCheck,
  prismaSettingsStore,
  prismaStore,
  type PrismaSettingsMap,
  type PrismaStoreMap,
} from "@crowandraven/evalkeeper-prisma";
import { checkStoreReads, type AnySuite } from "@crowandraven/evalkeeper";
import {
  describeMappedReadCheck,
  describeSettingsStoreContract,
  describeStoreContract,
} from "@crowandraven/evalkeeper/testing";
import {
  BLIND_RATER,
  blindRating,
  nextToRate,
  skipMark,
} from "@crowandraven/evalkeeper";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { PrismaClient } from "./byo/client/index.js";

// An app that had its own eval and versions tables before Evalkeeper
// (test/byo/schema.prisma): other model and column names, Prisma enums,
// Decimal costs, legacy columns, and a user id on each settings change.
// The mapped stores must meet the same contracts as the stock ones.
// The file the "test" script pushed the schema to (next to it).
const db = new PrismaClient({
  datasources: {
    db: { url: `file:${path.join(import.meta.dirname, "byo", "byo.db")}` },
  },
});

async function empty() {
  await db.attempt.deleteMany();
  await db.trial.deleteMany();
  await db.goldAnswer.deleteMany();
  await db.goldCase.deleteMany();
  await db.judgeCache.deleteMany();
  await db.versionSwitch.deleteMany();
  await db.routeLive.deleteMany();
  await db.routeVersion.deleteMany();
  await db.person.deleteMany();
}

const map = {
  models: {
    evalCase: "goldCase",
    evalCaseLabel: "goldAnswer",
    evalRun: "trial",
    evalOutput: "attempt",
    evalJudgment: "judgeCache",
  },
  fields: {
    evalCase: { labels: "answers" },
    evalCaseLabel: { note: "rationale" },
    evalRun: { set: "split", startedBy: "startedById" },
    evalOutput: { runId: "trialId" },
  },
} satisfies PrismaStoreMap;

// The same tables, for an app that hasn't added the two run settings.
const withoutRunSettings = {
  ...map,
  fields: {
    ...map.fields,
    evalRun: {
      ...map.fields.evalRun,
      temperature: null,
      maxOutputTokens: null,
    },
  },
} satisfies PrismaStoreMap;

// Pages pass a person's handle as `by`; the table keeps their id.
const settingsMap: PrismaSettingsMap = {
  models: {
    evalSettingsVersion: "routeVersion",
    evalSettingsLive: "routeLive",
    evalSettingsChange: "versionSwitch",
  },
  fields: {
    evalSettingsVersion: { temperature: null },
    evalSettingsChange: { by: "userId" },
  },
  // The kind column is an enum made before OUTSIDE and INSTRUCTIONS.
  kinds: ["CHANGE", "PROMOTE", "ROLLBACK", "DEPLOY"],
  by: {
    toColumn: async (handle) =>
      (
        await db.person.upsert({
          where: { handle },
          create: { handle },
          update: {},
        })
      ).id,
    fromColumn: async (id) =>
      (await db.person.findUnique({ where: { id } }))?.handle ?? null,
  },
};

describeStoreContract(
  "prismaStore mapped onto an app's own tables",
  async () => {
    await empty();
    return prismaStore(db, map);
  },
);

describeStoreContract(
  "prismaStore mapped onto tables without the run settings",
  async () => {
    await empty();
    return prismaStore(db, withoutRunSettings);
  },
  { without: ["temperature", "maxOutputTokens"] },
);

describeSettingsStoreContract(
  "prismaSettingsStore mapped onto an app's own versions tables",
  async () => {
    await empty();
    return prismaSettingsStore(db, settingsMap);
  },
  { without: ["temperature"] },
);

describe("a mapped store on an app's own tables", () => {
  const newCase = {
    suite: "s",
    input: { text: "hi" },
    tags: ["a"],
    split: "TEST" as const,
    status: "ACTIVE" as const,
    source: "OWNER",
    sourceRef: null,
    note: null,
  };

  it("reads Decimal costs as numbers", async () => {
    await empty();
    const store = prismaStore(db, map);
    const c = await store.createCase(newCase);
    const r = await store.createRun({
      suite: "s",
      model: "m",
      promptVersion: "p",
      reasoningEffort: null,
      set: "DEV",
      repeats: 1,
      datasetVersion: null,
      graderVersion: "1",
      estimatedCostUsd: 0.1234,
      startedBy: "person-1",
    });
    expect(r).toMatchObject({
      estimatedCostUsd: 0.1234,
      set: "DEV",
      startedBy: "person-1",
    });
    await store.createOutput({
      runId: r.id,
      caseId: c.id,
      repeat: 1,
      requestHash: "h",
      output: null,
      error: null,
      scores: null,
      costUsd: 0.0125,
      ms: 5,
      reused: false,
    });
    const [o] = await store.listOutputs(r.id);
    expect(o?.costUsd).toBe(0.0125);
    const row = await db.trial.findUniqueOrThrow({ where: { id: r.id } });
    expect(row.split).toBe("DEV");
    expect(row.startedById).toBe("person-1");
  });

  it("keeps an answer's note in the app's column", async () => {
    await empty();
    const store = prismaStore(db, map);
    const c = await store.createCase(newCase);
    const l = await store.addLabel(c.id, {
      kind: "EXPECTED",
      status: "PENDING",
      value: { want: "x" },
      raterRole: "OWNER",
      raterId: null,
      note: "Checked against the policy",
    });
    expect(l.note).toBe("Checked against the policy");
    const row = await db.goldAnswer.findUniqueOrThrow({ where: { id: l.id } });
    expect(row.rationale).toBe("Checked against the policy");
    expect(row.kind).toBe("EXPECTED");
  });

  it("keeps a blind rating and a skip in the app's answers table", async () => {
    await empty();
    const store = prismaStore(db, map);
    const c = await store.createCase(newCase);
    const skip = await store.addLabel(c.id, skipMark("pat"));
    const rating = await store.addLabel(
      c.id,
      blindRating({ raterId: "lee", value: { want: "x" }, reason: "Plain" }),
    );
    expect(skip).toMatchObject({ status: "SKIPPED", value: null });
    const skipRow = await db.goldAnswer.findUniqueOrThrow({
      where: { id: skip.id },
    });
    // The value column can't be null: a skip is kept as {}.
    expect(skipRow).toMatchObject({
      status: "SKIPPED",
      value: {},
      raterId: "pat",
      raterRole: BLIND_RATER,
    });
    const ratingRow = await db.goldAnswer.findUniqueOrThrow({
      where: { id: rating.id },
    });
    expect(ratingRow).toMatchObject({
      status: "CONFIRMED",
      rationale: "Plain",
      raterId: "lee",
    });
    expect(nextToRate(await store.listCases("s"), "pat")).toBeNull();
    expect(nextToRate(await store.listCases("s"), "kim")?.id).toBe(c.id);
  });

  it("reads legacy rows the app wrote before Evalkeeper", async () => {
    await empty();
    const legacy = await db.trial.create({
      data: { model: "m", promptVersion: "p", status: "SUCCEEDED" },
    });
    const r = await prismaStore(db, map).getRun(legacy.id);
    expect(r).toMatchObject({
      suite: "legacy",
      set: "ALL",
      graderVersion: "",
      estimatedCostUsd: null,
      temperature: null,
    });
  });

  it("can't keep a status the app's enum lacks", async () => {
    await empty();
    const store = prismaStore(db, map);
    const c = await store.createCase(newCase);
    const l = await store.addLabel(c.id, {
      kind: "EXPECTED",
      status: "PENDING",
      value: {},
      raterRole: "MODEL",
      raterId: null,
      note: null,
    });
    await expect(store.setLabelStatus(l.id, "REJECTED")).rejects.toThrow();
  });

  it("says which model is missing from the client", () => {
    expect(() =>
      prismaStore(db, { ...map, models: { evalCase: "noSuchModel" } }),
    ).toThrow(/noSuchModel/);
  });

  it("keeps judgments in the app's cache table", async () => {
    await empty();
    const cache = prismaJudgmentCache(db, map);
    expect(await cache.get("k")).toBeNull();
    await cache.set("k", { same: true }, "judge-model");
    await cache.set("k", { same: true }, "judge-model");
    expect(await cache.get("k")).toEqual({ same: true });
  });

  it("stores who made a settings change as the app's user id", async () => {
    await empty();
    const store = prismaSettingsStore(db, settingsMap);
    await store.switchTo("triage", {
      create: {
        settings: {
          model: "a",
          fallbackModel: null,
          reasoningEffort: null,
          maxOutputTokens: null,
        },
        promptVersion: "p1",
      },
      kind: "CHANGE",
      reason: "first",
      by: "pat",
      expectLive: null,
    });
    const [change] = await db.versionSwitch.findMany();
    const pat = await db.person.findUniqueOrThrow({ where: { handle: "pat" } });
    expect(change?.userId).toBe(pat.id);
    expect((await store.listChanges("triage"))[0]?.by).toBe("pat");
  });

  const first = {
    create: {
      settings: {
        model: "a",
        fallbackModel: null,
        reasoningEffort: null,
        maxOutputTokens: null,
      },
      promptVersion: "p1",
    },
    kind: "OUTSIDE" as const,
    reason: "found",
    by: null,
    expectLive: null,
  };

  it("keeps a kind its enum can't hold in the evidence column", async () => {
    await empty();
    const store = prismaSettingsStore(db, settingsMap);
    await store.switchTo("triage", first);
    const [row] = await db.versionSwitch.findMany();
    expect(row).toMatchObject({
      kind: "CHANGE",
      evidence: { evalkeeperKind: "OUTSIDE", evidence: null },
    });
    expect(await store.listChanges("triage")).toMatchObject([
      { kind: "OUTSIDE", evidence: null },
    ]);
  });

  it("reads evidence that only looks wrapped as it is", async () => {
    await empty();
    const store = prismaSettingsStore(db, settingsMap);
    const odd = [
      { evalkeeperKind: "NOT_A_KIND", evidence: 1 },
      { evalkeeperKind: 7, evidence: 1 },
      { evalkeeperKind: "OUTSIDE" },
      ["OUTSIDE"],
    ];
    let live: string | null = null;
    for (const evidence of odd)
      live = (
        await store.switchTo("triage", {
          ...first,
          kind: "CHANGE",
          evidence,
          expectLive: live,
        })
      ).id;
    const changes = await store.listChanges("triage");
    expect(changes.map((c) => c.kind)).toEqual([
      "CHANGE",
      "CHANGE",
      "CHANGE",
      "CHANGE",
    ]);
    expect(changes.map((c) => c.evidence)).toEqual([...odd].reverse());
  });

  it("says what to migrate when the enum can't hold a kind and there's no map", async () => {
    await empty();
    const { kinds: _, ...withoutKinds } = settingsMap;
    const store = prismaSettingsStore(db, withoutKinds);
    await expect(store.switchTo("triage", first)).rejects.toThrow(
      "Add OUTSIDE to its enum, or list the kinds it holds",
    );
    // Nothing half-written.
    expect(await store.liveVersion("triage")).toBeNull();
    expect(await db.routeVersion.count()).toBe(0);
  });
});

// The scoped contracts on the app's own tables while they hold the app's
// rows, as a shared development database would: they pass without
// emptying anything, and cleanup deletes only the rows the scope names.
describe("scoped contracts on an app's own tables with other rows", () => {
  const scope = "contract-";
  const cleanup = (s: string) => deleteScopedRows(db, s, { map, settingsMap });
  const snapshot = async () => ({
    cases: await db.goldCase.findMany({ orderBy: { id: "asc" } }),
    answers: await db.goldAnswer.findMany({ orderBy: { id: "asc" } }),
    trials: await db.trial.findMany({ orderBy: { id: "asc" } }),
    attempts: await db.attempt.findMany({ orderBy: { id: "asc" } }),
    versions: await db.routeVersion.findMany({ orderBy: { id: "asc" } }),
    live: await db.routeLive.findMany({ orderBy: { operation: "asc" } }),
    switches: await db.versionSwitch.findMany({ orderBy: { id: "asc" } }),
  });
  let before: Awaited<ReturnType<typeof snapshot>>;

  beforeAll(async () => {
    await empty();
    // Rows the app wrote itself, before Evalkeeper.
    for (const suite of ["s", "Contract-kept"]) {
      const c = await db.goldCase.create({
        data: {
          suite,
          input: { text: "ours" },
          tags: [],
          source: "OWNER",
          status: "ACTIVE",
          answers: {
            create: { raterRole: "OWNER", kind: "EXPECTED", value: {} },
          },
        },
      });
      const t = await db.trial.create({
        data: { suite, model: "m", promptVersion: "p", status: "SUCCEEDED" },
      });
      await db.attempt.create({
        data: { trialId: t.id, caseId: c.id, repeat: 1, requestHash: "h" },
      });
      const v = await db.routeVersion.create({
        data: { operation: suite, number: 1, model: "m" },
      });
      await db.routeLive.create({
        data: { operation: suite, versionId: v.id },
      });
      await db.versionSwitch.create({
        data: { operation: suite, kind: "DEPLOY", toVersionId: v.id },
      });
    }
    before = await snapshot();
  });

  describeStoreContract(
    "mapped prismaStore, scoped",
    () => prismaStore(db, map),
    {
      scope,
      cleanup,
    },
  );
  describeSettingsStoreContract(
    "mapped prismaSettingsStore, scoped",
    () => prismaSettingsStore(db, settingsMap),
    { scope, cleanup, without: ["temperature"] },
  );

  it("left the app's rows as they were, and took its own away", async () => {
    expect(await snapshot()).toEqual(before);
  });
});

describe("the read check on an app's own tables", () => {
  const suite = {
    key: "s",
    input: z.object({ text: z.string() }),
    labelValue: z.object({ want: z.string() }),
  };
  // Trust boundary: only the key and schemas are read by the check.
  const asSuite = suite as unknown as AnySuite;

  beforeAll(async () => {
    await empty();
    const c = await db.goldCase.create({
      data: {
        suite: "s",
        input: { text: 5 },
        tags: ["a"],
        source: "OWNER",
        status: "ACTIVE",
        answers: {
          create: [
            { raterRole: "OWNER", kind: "EXPECTED", value: { want: "A" } },
            { raterRole: "OWNER", kind: "REFERENCE", value: { want: "B" } },
          ],
        },
      },
    });
    // Legacy rows read as they are: no set, no grader version.
    const legacy = await db.trial.create({
      data: { suite: "s", model: "m", promptVersion: "p", status: "SUCCEEDED" },
    });
    const odd = await db.trial.create({
      data: {
        suite: "s",
        model: "m",
        promptVersion: "p",
        status: "DONE",
        split: "QUICK",
        estimatedCostUsd: 0.25,
      },
    });
    for (const trialId of [legacy.id, odd.id])
      await db.attempt.create({
        data: { trialId, caseId: c.id, repeat: 1, requestHash: "h" },
      });
  });

  it("finds values the mapped store would quietly read as defaults", async () => {
    const report = await prismaReadCheck(db, map, { suites: [asSuite] });
    const [s] = report.suites;
    expect(s?.counts).toEqual({ cases: 1, answers: 2, tests: 2, outputs: 2 });
    expect(s?.problems.map((p) => [p.kind, p.field, p.problem])).toEqual([
      ["case", "input", expect.stringContaining("doesn't fit")],
      ["answer", "kind", '"REFERENCE" isn\'t one of EXPECTED'],
      ["test", "set", expect.stringContaining('"QUICK"')],
      ["test", "status", expect.stringContaining('"DONE"')],
    ]);
    // Through the store, the unknown kind, set, and status read as
    // defaults; only the input that doesn't fit the suite shows.
    const viaStore = await checkStoreReads(prismaStore(db, map), {
      suites: [asSuite],
    });
    expect(viaStore.suites[0]?.problems.map((p) => p.field)).toEqual(["input"]);
    expect(viaStore.suites[0]?.counts).toEqual(s?.counts);
  });

  it("reads tables without the run settings", async () => {
    const report = await prismaReadCheck(db, withoutRunSettings, {
      suites: ["s"],
      tests: 1,
    });
    expect(report.suites[0]?.counts).toMatchObject({ tests: 1, outputs: 1 });
  });
});

describeMappedReadCheck(
  "an app's own tables, read as they are",
  async () => {
    await empty();
    const store = prismaStore(db, map);
    await store.createCase({
      suite: "s",
      input: { text: "hi" },
      tags: [],
      split: "DEV",
      status: "RETIRED",
      source: "OWNER",
      sourceRef: null,
      note: null,
      labels: [
        {
          kind: "EXPECTED",
          status: "PROVISIONAL",
          value: { want: "HI" },
          raterRole: "OWNER",
          raterId: null,
          note: null,
        },
      ],
    });
    await db.trial.create({
      data: { suite: "s", model: "m", promptVersion: "p", status: "FAILED" },
    });
    return prismaReadCheck(db, map, { suites: ["s"] });
  },
  { suites: ["s"] },
);

afterAll(async () => {
  await empty();
  await db.$disconnect();
});
