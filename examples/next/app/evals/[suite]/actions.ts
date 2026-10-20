"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { formText, suggest } from "evalkeeper";
import { runner, settings, store } from "@/lib/evalkeeper";
import { MODELS } from "@/lib/models";
import { availableModels } from "@/lib/models";

/**
 * The suite page's actions. In your app, check that the person may run
 * evals (an admin) at the top of each one.
 */

const suiteFrom = (form: FormData) =>
  runner.suiteOrThrow(formText(form, "suite"));

export async function testModel(form: FormData) {
  const suite = suiteFrom(form);
  const model = formText(form, "model");
  if (!availableModels().includes(model)) throw new Error("Unknown model");
  const { run } = await runner.createRun({ suite: suite.key, model });
  // Answers come back after the response; the page refreshes until done.
  after(() => runner.runEval(run.id));
  revalidatePath(`/evals/${suite.key}`);
}

export async function testAll(form: FormData) {
  const suite = suiteFrom(form);
  for (const model of availableModels()) {
    const { run } = await runner.createRun({ suite: suite.key, model });
    after(() => runner.runEval(run.id));
  }
  revalidatePath(`/evals/${suite.key}`);
}

/** Who's acting. In your app: the signed-in admin's id. */
const BY = "Example admin";

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

const VS: Record<string, string> = {
  BETTER: "more accurate than live",
  SAME: "about as accurate as live",
  WORSE: "less accurate than live",
  TOO_FEW: "too few cases to compare",
};

export async function makeLive(form: FormData) {
  const suite = suiteFrom(form);
  const model = formText(form, "model");
  const { row, evidence } = await evidenceFor(suite.key, model);
  await settings.update(
    suite.operation,
    { model },
    {
      by: BY,
      reason: `Made ${row.label} live: ${evidence.score.right}/${evidence.score.total}, ${VS[row.vsLive ?? ""] ?? "no comparison"}`,
      evidence,
    },
  );
  revalidatePath("/evals", "layout");
}

export async function makeFallback(form: FormData) {
  const suite = suiteFrom(form);
  const model = formText(form, "model");
  const { row, evidence } = await evidenceFor(suite.key, model);
  await settings.update(
    suite.operation,
    { fallbackModel: model },
    {
      by: BY,
      reason: `Made ${row.label} the fallback: ${evidence.score.right}/${evidence.score.total}, from another provider`,
      evidence,
    },
  );
  revalidatePath("/evals", "layout");
}

/** Applies the suggestion: its live and fallback models, in one change. */
export async function useSuggestion(form: FormData) {
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
      by: BY,
      reason: s.reasons.join(" "),
      evidence: {
        suggestion: s.reasons,
        live: s.live.test?.runId ?? null,
        fallback: s.fallback?.test?.runId ?? null,
      },
    },
  );
  revalidatePath("/evals", "layout");
}

/** Makes an earlier version live again; a reason is required. */
export async function rollBackSettings(form: FormData) {
  const suite = suiteFrom(form);
  const reason = formText(form, "reason");
  if (!reason) throw new Error("Say why you're rolling back");
  await settings.rollBack(suite.operation, formText(form, "version"), {
    by: BY,
    reason,
  });
  revalidatePath("/evals", "layout");
}

/** A person confirms an answer: the only way a draft gets used. */
export async function confirmAnswer(form: FormData) {
  const suite = suiteFrom(form);
  await store.setLabelStatus(formText(form, "label"), "CONFIRMED");
  after(() => runner.rescoreRecent(suite.key));
  revalidatePath(`/evals/${suite.key}`);
}

export async function rescore(form: FormData) {
  const suite = suiteFrom(form);
  await runner.rescoreRecent(suite.key);
  revalidatePath(`/evals/${suite.key}`);
}

/** A person adds a case. They wrote its answer, so it's confirmed. */
export async function addCase(form: FormData) {
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
  revalidatePath(`/evals/${suite.key}`);
}

/**
 * A person changes a case's answer: a new confirmed answer, with the old
 * ones kept as history. Stored answers are rescored for free.
 */
export async function editAnswer(form: FormData) {
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
  revalidatePath(`/evals/${suite.key}`);
}

/** Takes a case out of use; its stored answers stay. */
export async function retireCase(form: FormData) {
  const suite = suiteFrom(form);
  const caseId = formText(form, "case");
  const known = (await store.listCases(suite.key)).some((c) => c.id === caseId);
  if (!known) throw new Error("Unknown case");
  await store.setCaseStatus(caseId, "RETIRED");
  revalidatePath(`/evals/${suite.key}`);
}
