"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { caseFromFeedback, formText, suggest } from "@crowandraven/evalkeeper";
import {
  MODELS,
  SUITES,
  modelsFor,
  feedbackStore,
  requireAdmin,
  runner,
  settings,
  store,
} from ".";
import { EVALS_BASE, evalsPath } from "./paths";
import { runWeeklyCheck, startWeeklyCheck } from "./weekly";

/**
 * Every action on the eval pages. Each one checks requireAdmin() first,
 * and records the admin as who made a change.
 */

const suiteFrom = (form: FormData) =>
  runner.suiteOrThrow(formText(form, "suite"));

export async function testModel(form: FormData) {
  await requireAdmin();
  const suite = suiteFrom(form);
  const model = formText(form, "model");
  if (!modelsFor(suite.operation).includes(model))
    throw new Error("Unknown model");
  const { run } = await runner.createRun({ suite: suite.key, model });
  // Answers come back after the response; the page refreshes until done.
  after(() => runner.runEval(run.id));
  revalidatePath(evalsPath(suite.key));
}

export async function testAll(form: FormData) {
  await requireAdmin();
  const suite = suiteFrom(form);
  for (const model of modelsFor(suite.operation)) {
    const { run } = await runner.createRun({ suite: suite.key, model });
    after(() => runner.runEval(run.id));
  }
  revalidatePath(evalsPath(suite.key));
}

/**
 * The evidence for a promotion: the model's current test, the live
 * model's, and how they compared, so the history can show why.
 */
async function evidenceFor(suiteKey: string, model: string) {
  const board = await runner.board(suiteKey);
  const row = board.rows.find((r) => r.model === model && !r.variant);
  if (!row?.test || row.test.stale)
    throw new Error("Test this model on the current cases first");
  return {
    row,
    evidence: {
      runId: row.test.runId,
      liveRunId: board.liveRunId,
      vsLive: row.vsLive,
      score: { right: row.test.right, total: row.test.total },
    },
  };
}

/** What a fallback choice records: its current test, if it has one. */
async function fallbackEvidence(suiteKey: string, model: string) {
  const board = await runner.board(suiteKey);
  const row = board.rows.find((r) => r.model === model && !r.variant);
  if (!row?.canMakeFallback)
    throw new Error("This model can't be the fallback");
  const test = row.test && !row.test.stale ? row.test : null;
  const failed = test?.failedAnswers ? `, ${test.failedAnswers} failed` : "";
  return {
    reason: `Made ${row.label} the fallback: ${test ? `${Math.round(test.right)}/${Math.round(test.total)}${failed}` : "not tested"}`,
    evidence: {
      runId: test?.runId ?? null,
      liveRunId: board.liveRunId,
      score: test ? { right: test.right, total: test.total } : null,
    },
  };
}

const VS: Record<string, string> = {
  BETTER: "more accurate than live",
  SAME: "about as accurate as live",
  WORSE: "less accurate than live",
  TOO_FEW: "too few cases to compare",
};

export async function makeLive(form: FormData) {
  const admin = await requireAdmin();
  const suite = suiteFrom(form);
  const model = formText(form, "model");
  const { row, evidence } = await evidenceFor(suite.key, model);
  await settings.update(
    suite.operation,
    { model },
    {
      by: admin.name,
      reason: `Made ${row.label} live: ${evidence.score.right}/${evidence.score.total}, ${VS[row.vsLive ?? ""] ?? "no comparison"}`,
      evidence,
    },
  );
  revalidatePath(EVALS_BASE, "layout");
}

export async function makeFallback(form: FormData) {
  const admin = await requireAdmin();
  const suite = suiteFrom(form);
  const model = formText(form, "model");
  const { reason, evidence } = await fallbackEvidence(suite.key, model);
  await settings.update(
    suite.operation,
    { fallbackModel: model },
    { by: admin.name, reason, evidence },
  );
  revalidatePath(EVALS_BASE, "layout");
}

/** Applies the suggestion: its live and fallback models, in one change. */
export async function useSuggestion(form: FormData) {
  const admin = await requireAdmin();
  const suite = suiteFrom(form);
  const board = await runner.board(suite.key);
  const s = suggest(board.rows, suite.checks, suite.priority, MODELS);
  if (!s || s.same) return;
  await settings.update(
    suite.operation,
    {
      model: s.live.model,
      fallbackModel: s.fallback?.model ?? null,
    },
    {
      by: admin.name,
      reason: s.reasons.join(" "),
      evidence: {
        suggestion: s.reasons,
        live: s.live.test?.runId ?? null,
        fallback: s.fallback?.test?.runId ?? null,
      },
    },
  );
  revalidatePath(EVALS_BASE, "layout");
}

/** Makes an earlier version live again; a reason is required. */
export async function rollBackSettings(form: FormData) {
  const admin = await requireAdmin();
  const suite = suiteFrom(form);
  const reason = formText(form, "reason");
  if (!reason) throw new Error("Say why you're rolling back");
  await settings.rollBack(suite.operation, formText(form, "version"), {
    by: admin.name,
    reason,
  });
  revalidatePath(EVALS_BASE, "layout");
}

/** A person confirms an answer: the only way a draft gets used. */
export async function confirmAnswer(form: FormData) {
  await requireAdmin();
  const suite = suiteFrom(form);
  await store.setLabelStatus(formText(form, "label"), "CONFIRMED");
  after(() => runner.rescoreRecent(suite.key));
  revalidatePath(evalsPath(suite.key));
}

export async function rescore(form: FormData) {
  await requireAdmin();
  const suite = suiteFrom(form);
  await runner.rescoreRecent(suite.key);
  revalidatePath(evalsPath(suite.key));
}

/** A person adds a case. They wrote its answer, so it's confirmed. */
export async function addCase(form: FormData) {
  await requireAdmin();
  const suite = suiteFrom(form);
  if (!suite.labelFromForm) throw new Error("This suite has no answer form");
  await store.createCase({
    suite: suite.key,
    input: suite.inputFromForm(form),
    tags: formText(form, "tags")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
    split: formText(form, "split") === "TEST" ? "TEST" : "DEV",
    status: "ACTIVE",
    source: "OWNER",
    sourceRef: null,
    note: null,
    labels: [
      {
        kind: "EXPECTED",
        status: "CONFIRMED",
        value: suite.labelFromForm(form),
        raterRole: "OWNER",
        raterId: null,
        note: null,
      },
    ],
  });
  revalidatePath(evalsPath(suite.key));
}

/**
 * A person changes a case's answer: a new confirmed answer, with the old
 * ones kept as history. Stored answers are rescored for free.
 */
export async function editAnswer(form: FormData) {
  await requireAdmin();
  const suite = suiteFrom(form);
  if (!suite.labelFromForm) throw new Error("This suite has no answer form");
  const caseId = formText(form, "case");
  const known = (await store.listCases(suite.key)).some((c) => c.id === caseId);
  if (!known) throw new Error("Unknown case");
  await store.addLabel(caseId, {
    kind: "EXPECTED",
    status: "CONFIRMED",
    value: suite.labelFromForm(form),
    raterRole: "OWNER",
    raterId: null,
    note: null,
  });
  // A draft (from feedback) is in use once it has an answer.
  await store.setCaseStatus(caseId, "ACTIVE");
  after(() => runner.rescoreRecent(suite.key));
  revalidatePath(evalsPath(suite.key));
}

/** Takes a case out of use; its stored answers stay. */
export async function retireCase(form: FormData) {
  await requireAdmin();
  const suite = suiteFrom(form);
  const caseId = formText(form, "case");
  const known = (await store.listCases(suite.key)).some((c) => c.id === caseId);
  if (!known) throw new Error("Unknown case");
  await store.setCaseStatus(caseId, "RETIRED");
  revalidatePath(evalsPath(suite.key));
}

async function find(id: string) {
  const f = (await feedbackStore.listFeedback()).find((x) => x.id === id);
  if (!f) throw new Error("Unknown rating");
  return f;
}

/** Makes a draft case from a rating; a person finishes its answer. */
export async function makeCase(form: FormData) {
  await requireAdmin();
  const f = await find(formText(form, "feedback"));
  const suite = SUITES.find((s) => s.operation === f.operation);
  const draft = suite ? caseFromFeedback(f, suite) : null;
  if (!draft || !suite) throw new Error("This rating can't become a case");
  const c = await store.createCase(draft);
  await feedbackStore.setFeedbackStatus(f.id, "CASED", c.id);
  revalidatePath(EVALS_BASE, "layout");
}

export async function dismissFeedback(form: FormData) {
  await requireAdmin();
  const f = await find(formText(form, "feedback"));
  await feedbackStore.setFeedbackStatus(f.id, "DISMISSED");
  revalidatePath(evalsPath("feedback"));
}

export async function runWeeklyNow(): Promise<void> {
  await requireAdmin();
  // Recorded before the page re-renders, so it shows them running.
  const ids = await startWeeklyCheck();
  after(() => runWeeklyCheck(ids));
  revalidatePath(EVALS_BASE);
}
