import { PrismaClient } from "@prisma/client";
import {
  moveIn,
  moveInSummary,
  prismaFeedbackStore,
  prismaSettingsStore,
  prismaStore,
  type MoveInSource,
} from "@crowandraven/evalkeeper/prisma";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db as theirs, map, settingsMap } from "./byo/maps";

// Moving in: an app with its own eval, thumbs, and versions tables
// (test/byo) copies everything into Evalkeeper's tables (test.db), read
// through the stores it already maps onto its tables.
const ours = new PrismaClient();

async function empty() {
  await ours.evalOutput.deleteMany();
  await ours.evalRun.deleteMany();
  await ours.evalCaseLabel.deleteMany();
  await ours.evalCase.deleteMany();
  await ours.evalFeedback.deleteMany();
  await ours.evalSettingsChange.deleteMany();
  await ours.evalSettingsLive.deleteMany();
  await ours.evalSettingsVersion.deleteMany();
  await theirs.attempt.deleteMany();
  await theirs.trial.deleteMany();
  await theirs.goldAnswer.deleteMany();
  await theirs.goldCase.deleteMany();
  await theirs.versionSwitch.deleteMany();
  await theirs.routeLive.deleteMany();
  await theirs.routeVersion.deleteMany();
  await theirs.aiFeedback.deleteMany();
  await theirs.person.deleteMany();
}

afterAll(async () => {
  await empty();
  await ours.$disconnect();
  await theirs.$disconnect();
});

const feedbackMap = {
  models: { evalFeedback: "aiFeedback" },
  fields: {
    evalFeedback: {
      raterId: "userId",
      input: null,
      output: null,
      status: null,
      caseId: null,
    },
  },
} as const;

const source = (): MoveInSource => ({
  store: prismaStore(theirs, map),
  feedbackStore: prismaFeedbackStore(theirs, feedbackMap),
  settingsStore: prismaSettingsStore(theirs, settingsMap),
  suites: ["triage"],
  operations: ["triage_op"],
  tables: { db: theirs, map },
});

/** The app's data, written through its own mapped stores. */
async function seed() {
  const s = source();
  const c = await s.store.createCase({
    suite: "triage",
    input: { subject: "Billed twice" },
    tags: ["billing"],
    split: "TEST",
    status: "ACTIVE",
    source: "OWNER",
    sourceRef: null,
    note: null,
    labels: [
      {
        kind: "EXPECTED",
        status: "CONFIRMED",
        value: { category: "billing" },
        raterRole: "OWNER",
        raterId: "ada",
        note: "Clearly billing",
      },
    ],
  });
  await s.store.addLabel(c.id, {
    kind: "EXPECTED",
    status: "PENDING",
    value: { category: "account" },
    raterRole: "MODEL",
    raterId: null,
    note: null,
  });
  const run = await s.store.createRun({
    suite: "triage",
    model: "demo-quick",
    promptVersion: "p1",
    reasoningEffort: null,
    temperature: null,
    maxOutputTokens: null,
    set: "ALL",
    repeats: 1,
    datasetVersion: "d1",
    graderVersion: "1",
    estimatedCostUsd: 0.01,
    startedBy: "ada",
  });
  await s.store.createOutput({
    runId: run.id,
    caseId: c.id,
    repeat: 1,
    requestHash: "h1",
    output: { category: "billing" },
    error: null,
    scores: [{ key: "right", pass: true }],
    costUsd: 0.002,
    ms: 420,
    reused: false,
  });
  await s.store.updateRun(run.id, {
    status: "SUCCEEDED",
    finishedAt: new Date(),
  });
  const rater = await theirs.person.create({ data: { handle: "rater" } });
  await s.feedbackStore?.rate({
    operation: "triage_op",
    targetId: "msg-1",
    raterId: rater.id,
    rating: "DOWN",
    reason: "Wrong team",
  });
  await s.settingsStore?.switchTo("triage_op", {
    create: {
      settings: {
        model: "demo-quick",
        fallbackModel: null,
        reasoningEffort: null,
        maxOutputTokens: null,
      },
      promptVersion: "p1",
    },
    kind: "CHANGE",
    by: "ada",
    reason: "First",
    evidence: null,
    expectLive: null,
  });
}

describe("moving in from an app's own tables", () => {
  beforeEach(empty);

  it("reports what it would copy on a dry run, and writes nothing", async () => {
    await seed();
    const r = await moveIn(source(), ours, { dryRun: true });
    expect(r.dryRun).toBe(true);
    expect(r.problems).toEqual([]);
    expect(Object.fromEntries(r.counts.map((c) => [c.table, c.moved]))).toEqual(
      {
        cases: 1,
        answers: 2,
        tests: 1,
        "test answers": 1,
        thumbs: 1,
        "settings versions": 1,
        "settings changes": 1,
        "live settings": 1,
      },
    );
    expect(await ours.evalCase.count()).toBe(0);
    expect(moveInSummary(r)[0]).toMatch(/nothing written/);
  });

  it("copies everything, keeping ids, dates, and who did what", async () => {
    await seed();
    const before = await source().store.listCases("triage");
    const r = await moveIn(source(), ours);
    expect(r.verified, moveInSummary(r).join("\n")).toEqual({
      ok: true,
      differences: [],
    });
    const after = await prismaStore(ours).listCases("triage");
    expect(after.map((c) => c.id)).toEqual(before.map((c) => c.id));
    expect(after[0]?.updatedAt).toEqual(before[0]?.updatedAt);
    expect(
      after[0]?.labels.find((l) => l.status === "CONFIRMED")?.raterId,
    ).toBe("ada");
    const [change] = await prismaSettingsStore(ours).listChanges("triage_op");
    expect(change?.by).toBe("ada");
    // Their own tables are untouched.
    expect(await theirs.goldCase.count()).toBe(1);
  });

  it("is safe to run again: what moved is skipped", async () => {
    await seed();
    await moveIn(source(), ours);
    const again = await moveIn(source(), ours);
    expect(again.counts.every((c) => c.moved === 0)).toBe(true);
    expect(again.verified?.ok).toBe(true);
    expect(moveInSummary(again).join("\n")).toMatch(/1 already there/);
  });

  it("won't merge a settings history Evalkeeper's tables already have", async () => {
    await seed();
    await prismaSettingsStore(ours).switchTo("triage_op", {
      create: {
        settings: {
          model: "demo-careful",
          fallbackModel: null,
          reasoningEffort: null,
          maxOutputTokens: null,
        },
        promptVersion: "p1",
      },
      kind: "CHANGE",
      by: "bo",
      reason: null,
      evidence: null,
      expectLive: null,
    });
    const r = await moveIn(source(), ours);
    expect(r.dryRun).toBe(true);
    expect(r.problems.join("\n")).toMatch(/histories aren't merged/);
    expect(await ours.evalCase.count()).toBe(0);
  });

  it("stops at values Evalkeeper reads differently, until accepted", async () => {
    await seed();
    await theirs.trial.create({
      data: {
        suite: "triage",
        model: "m",
        promptVersion: "p",
        status: "PAUSED",
      },
    });
    const r = await moveIn(source(), ours);
    expect(r.dryRun).toBe(true);
    expect(moveInSummary(r).join("\n")).toMatch(/reads differently/);
    const accepted = await moveIn(source(), ours, { acceptReadProblems: true });
    expect(accepted.dryRun).toBe(false);
    expect(await ours.evalRun.count()).toBe(2);
  });
});
