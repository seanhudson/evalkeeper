import { PrismaClient } from "@prisma/client";
import {
  deleteScopedRows,
  prismaFeedbackStore,
  prismaSettingsStore,
  prismaStore,
} from "@crowandraven/evalkeeper/prisma";
import {
  describeFeedbackStoreContract,
  describeSettingsStoreContract,
  describeStoreContract,
} from "@crowandraven/evalkeeper/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// A throwaway SQLite file (see the "test" script), emptied before each
// test, so the Prisma store is checked against the same contract as every
// other store.
const prisma = new PrismaClient();

async function empty() {
  await prisma.evalOutput.deleteMany();
  await prisma.evalRun.deleteMany();
  await prisma.evalCaseLabel.deleteMany();
  await prisma.evalCase.deleteMany();
  await prisma.evalJudgment.deleteMany();
  await prisma.evalFeedback.deleteMany();
  await prisma.evalSettingsChange.deleteMany();
  await prisma.evalSettingsLive.deleteMany();
  await prisma.evalSettingsVersion.deleteMany();
}

describeStoreContract("prismaStore on SQLite", async () => {
  await empty();
  return prismaStore(prisma);
});

describeFeedbackStoreContract("prismaFeedbackStore on SQLite", async () => {
  await empty();
  return prismaFeedbackStore(prisma);
});

describeSettingsStoreContract("prismaSettingsStore on SQLite", async () => {
  await empty();
  return prismaSettingsStore(prisma);
});

// The scoped contracts on a database that holds other rows, as a shared
// development database would: they pass without emptying anything, and
// cleanup deletes only the rows the scope names.
describe("scoped contracts on a database with other rows", () => {
  const scope = "contract-";
  const cleanup = (s: string) => deleteScopedRows(prisma, s);
  const snapshot = async () => ({
    cases: await prisma.evalCase.findMany({ orderBy: { id: "asc" } }),
    labels: await prisma.evalCaseLabel.findMany({ orderBy: { id: "asc" } }),
    runs: await prisma.evalRun.findMany({ orderBy: { id: "asc" } }),
    outputs: await prisma.evalOutput.findMany({ orderBy: { id: "asc" } }),
    feedback: await prisma.evalFeedback.findMany({ orderBy: { id: "asc" } }),
    versions: await prisma.evalSettingsVersion.findMany({
      orderBy: { id: "asc" },
    }),
    live: await prisma.evalSettingsLive.findMany({
      orderBy: { operation: "asc" },
    }),
    changes: await prisma.evalSettingsChange.findMany({
      orderBy: { id: "asc" },
    }),
  });
  let before: Awaited<ReturnType<typeof snapshot>>;

  beforeAll(async () => {
    await empty();
    const store = prismaStore(prisma);
    // "Contract-" only looks like the scope: SQLite matches it without
    // regard to case, so cleanup must compare names itself.
    for (const suite of ["s", "Contract-kept", "contract"]) {
      const c = await store.createCase({
        suite,
        input: { text: "ours" },
        tags: [],
        split: "TEST",
        status: "ACTIVE",
        source: "OWNER",
        sourceRef: null,
        note: null,
        labels: [
          {
            kind: "EXPECTED",
            status: "CONFIRMED",
            value: { want: "OURS" },
            raterRole: "OWNER",
            raterId: null,
            note: null,
          },
        ],
      });
      const r = await store.createRun({
        suite,
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
      await store.createOutput({
        runId: r.id,
        caseId: c.id,
        repeat: 1,
        requestHash: "h",
        output: { text: "OURS" },
        error: null,
        scores: null,
        costUsd: 0.02,
        ms: 3,
        reused: false,
      });
      await prismaFeedbackStore(prisma).rate({
        operation: suite,
        targetId: "answer-1",
        raterId: "person-1",
        rating: "UP",
        reason: null,
        excerpt: null,
        input: null,
        output: null,
      });
      await prismaSettingsStore(prisma).switchTo(suite, {
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
    }
    before = await snapshot();
  });

  describeStoreContract("prismaStore, scoped", () => prismaStore(prisma), {
    scope,
    cleanup,
  });
  describeFeedbackStoreContract(
    "prismaFeedbackStore, scoped",
    () => prismaFeedbackStore(prisma),
    { scope, cleanup },
  );
  describeSettingsStoreContract(
    "prismaSettingsStore, scoped",
    () => prismaSettingsStore(prisma),
    { scope, cleanup },
  );

  it("left the other rows as they were, and took its own away", async () => {
    expect(await snapshot()).toEqual(before);
  });

  it("refuses an empty scope", async () => {
    await expect(deleteScopedRows(prisma, " ")).rejects.toThrow(/scope/);
    expect(await snapshot()).toEqual(before);
  });
});

afterAll(async () => {
  await empty();
  await prisma.$disconnect();
});
