import path from "node:path";
import type {
  PrismaSettingsMap,
  PrismaStoreMap,
} from "@crowandraven/evalkeeper/prisma";
import { PrismaClient } from "./client/index.js";

// An app that had its own eval and versions tables before Evalkeeper
// (schema.prisma here), and how Evalkeeper's stores map onto them. The
// mapped-store tests and the move-in tests both use them.

// The file the "test" script pushed the schema to (next to it).
export const db = new PrismaClient({
  datasources: {
    db: { url: `file:${path.join(import.meta.dirname, "byo.db")}` },
  },
});

export const map = {
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

// Pages pass a person's handle as `by`; the table keeps their id.
export const settingsMap: PrismaSettingsMap = {
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
