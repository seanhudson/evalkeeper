import { PrismaClient } from "@prisma/client";
import {
  prismaFeedbackStore,
  prismaSettingsStore,
  prismaStore,
} from "@crowandraven/evalkeeper-prisma";
import {
  describeFeedbackStoreContract,
  describeSettingsStoreContract,
  describeStoreContract,
} from "@crowandraven/evalkeeper/testing";
import { afterAll } from "vitest";

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

afterAll(async () => {
  await empty();
  await prisma.$disconnect();
});
