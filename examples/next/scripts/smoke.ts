// Runs every demo model on every suite against the database, then prints
// each board and the suggestion: the same path the pages take.
import { PrismaClient } from "@prisma/client";
import { prismaStore } from "@evalkeeper/prisma";
import { suggest } from "evalkeeper";
import { createRunner } from "evalkeeper/runner";
import { MODELS } from "../lib/models";
import { PROMPT_VERSIONS, SUITES } from "../lib/suites";

const prisma = new PrismaClient();
const demo = Object.keys(MODELS).filter((m) => m.startsWith("demo-"));
const runner = createRunner({
  store: prismaStore(prisma),
  suites: SUITES,
  models: MODELS,
  promptVersion: (op) => PROMPT_VERSIONS[op] ?? "unregistered",
  route: (op) => ({
    model: op === "ticket_triage" ? "demo-legacy" : "demo-quick",
    fallbackModel: null,
    reasoningEffort: null,
  }),
  candidates: () => ({ models: demo }),
});
for (const suite of SUITES) {
  for (const model of demo) {
    const { run } = await runner.createRun({ suite: suite.key, model });
    await runner.runEval(run.id);
  }
  const b = await runner.board(suite.key);
  console.log(`\n${suite.label}: ${b.cases} cases`);
  for (const r of b.rows)
    console.log(
      `  ${r.label.padEnd(14)} ${r.live ? "live " : "     "}${r.test ? `${r.test.right}/${r.test.total}` : "-"}  vs live: ${r.vsLive ?? "-"}  ${r.test?.costPerAnswer?.toFixed(4) ?? ""}`,
    );
  const s = suggest(b.rows, suite.checks, suite.priority, MODELS);
  console.log(
    `  Suggested: ${s?.live.label} / fallback ${s?.fallback?.label ?? "none"}`,
  );
  for (const reason of s?.reasons ?? []) console.log(`    - ${reason}`);
}
await prisma.$disconnect();
