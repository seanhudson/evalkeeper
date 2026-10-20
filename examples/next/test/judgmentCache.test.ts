import { PrismaClient } from "@prisma/client";
import { prismaJudgmentCache } from "@evalkeeper/prisma";
import { afterAll, describe, expect, it } from "vitest";

const prisma = new PrismaClient();

describe("prismaJudgmentCache", () => {
  it("keeps a judgment, returns it, and ignores a second write", async () => {
    await prisma.evalJudgment.deleteMany();
    const cache = prismaJudgmentCache(prisma);
    expect(await cache.get("k")).toBeNull();
    await cache.set("k", [{ expected: 0, actual: 1, why: "same" }], "judge");
    await cache.set("k", [{ expected: 9, actual: 9, why: "later" }], "judge");
    expect(await cache.get("k")).toEqual([
      { expected: 0, actual: 1, why: "same" },
    ]);
  });
});

afterAll(async () => {
  await prisma.evalJudgment.deleteMany();
  await prisma.$disconnect();
});
