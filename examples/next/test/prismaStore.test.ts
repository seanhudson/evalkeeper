import { PrismaClient } from "@prisma/client";
import { prismaStore } from "@evalkeeper/prisma";
import { describeStoreContract } from "evalkeeper/testing";
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
}

describeStoreContract("prismaStore on SQLite", async () => {
  await empty();
  return prismaStore(prisma);
});

afterAll(async () => {
  await empty();
  await prisma.$disconnect();
});
