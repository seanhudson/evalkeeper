"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { formText } from "evalkeeper";
import { prisma } from "@/lib/db";
import { routeFor, runner, store } from "@/lib/evalkeeper";
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

/** Routing is the app's own: here, the example's Route table. */
async function setRoute(
  operation: string,
  change: { model: string } | { fallbackModel: string },
) {
  const now = await routeFor(operation);
  await prisma.route.upsert({
    where: { operation },
    create: {
      operation,
      model: now.model,
      fallbackModel: now.fallbackModel,
      ...change,
    },
    update: change,
  });
}

export async function makeLive(form: FormData) {
  const suite = suiteFrom(form);
  await setRoute(suite.operation, { model: formText(form, "model") });
  revalidatePath("/evals", "layout");
}

export async function makeFallback(form: FormData) {
  const suite = suiteFrom(form);
  await setRoute(suite.operation, { fallbackModel: formText(form, "model") });
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
