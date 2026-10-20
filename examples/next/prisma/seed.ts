import { PrismaClient } from "@prisma/client";
import { prismaStore } from "@evalkeeper/prisma";
import { SUITES } from "../lib/suites";

/**
 * Adds each suite's starter cases. They arrive CONFIRMED by OWNER because
 * the example's author wrote and checked them; cases a model drafts for
 * you arrive PENDING until a person confirms them.
 */
const prisma = new PrismaClient();
const store = prismaStore(prisma);

for (const suite of SUITES) {
  const existing = await store.listCases(suite.key);
  if (existing.length) continue;
  for (const s of suite.starter ?? [])
    await store.createCase({
      suite: suite.key,
      input: s.input,
      tags: s.tags,
      split: s.split,
      status: "ACTIVE",
      source: "OWNER",
      sourceRef: null,
      note: s.note,
      labels: [
        {
          kind: "EXPECTED",
          status: "CONFIRMED",
          value: s.label,
          raterRole: "OWNER",
          raterId: null,
          note: null,
        },
      ],
    });
  console.log(`${suite.label}: ${suite.starter?.length ?? 0} cases`);
}
await prisma.$disconnect();
