import {
  prismaJudgmentCache,
  prismaSettingsStore,
  prismaStore,
  type PrismaSettingsMap,
  type PrismaStoreMap,
} from "@crowandraven/evalkeeper-prisma";
import {
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
import { afterAll, describe, expect, it } from "vitest";
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

afterAll(async () => {
  await empty();
  await db.$disconnect();
});
