import { PrismaClient } from "@prisma/client";
import { prismaFeedbackStore, prismaStore } from "@evalkeeper/prisma";
import {
  describeFeedbackStoreContract,
  describeStoreContract,
} from "evalkeeper/testing";
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
}

describeStoreContract("prismaStore on SQLite", async () => {
  await empty();
  return prismaStore(prisma);
});

describeFeedbackStoreContract("prismaFeedbackStore on SQLite", async () => {
  await empty();
  return prismaFeedbackStore(prisma);
});

afterAll(async () => {
  await empty();
  await prisma.$disconnect();
});
