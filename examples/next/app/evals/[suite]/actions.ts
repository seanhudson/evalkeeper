"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { routeFor, runner } from "@/lib/evalkeeper";
import { availableModels } from "@/lib/models";

/**
 * The suite page's actions. In your app, check that the person may run
 * evals (an admin) at the top of each one.
 */

export async function testModel(form: FormData) {
  const suite = runner.suiteOrThrow(String(form.get("suite")));
  const model = String(form.get("model"));
  if (!availableModels().includes(model)) throw new Error("Unknown model");
  const { run } = await runner.createRun({ suite: suite.key, model });
  // Answers come back after the response; the page refreshes until done.
  after(() => runner.runEval(run.id));
  revalidatePath(`/evals/${suite.key}`);
}

export async function testAll(form: FormData) {
  const suite = runner.suiteOrThrow(String(form.get("suite")));
  for (const model of availableModels()) {
    const { run } = await runner.createRun({ suite: suite.key, model });
    after(() => runner.runEval(run.id));
  }
  revalidatePath(`/evals/${suite.key}`);
}

async function setRoute(
  operation: string,
  change: { model?: string; fallbackModel?: string },
) {
  const now = await routeFor(operation);
  await prisma.route.upsert({
    where: { operation },
    create: {
      operation,
      model: change.model ?? now.model,
      fallbackModel: change.fallbackModel ?? now.fallbackModel,
    },
    update: change,
  });
}

export async function makeLive(form: FormData) {
  const suite = runner.suiteOrThrow(String(form.get("suite")));
  await setRoute(suite.operation, { model: String(form.get("model")) });
  revalidatePath("/evals", "layout");
}

export async function makeFallback(form: FormData) {
  const suite = runner.suiteOrThrow(String(form.get("suite")));
  await setRoute(suite.operation, { fallbackModel: String(form.get("model")) });
  revalidatePath("/evals", "layout");
}

/** A person confirms an answer: the only way an answer gets used. */
export async function confirmAnswer(form: FormData) {
  const id = String(form.get("label"));
  await prisma.evalCaseLabel.update({
    where: { id },
    data: { status: "CONFIRMED" },
  });
  const suite = String(form.get("suite"));
  after(() => runner.rescoreRecent(suite));
  revalidatePath(`/evals/${suite}`);
}

export async function rescore(form: FormData) {
  const suite = String(form.get("suite"));
  await runner.rescoreRecent(suite);
  revalidatePath(`/evals/${suite}`);
}

/** A person adds a case. They wrote its answer, so it's confirmed. */
export async function addCase(form: FormData) {
  const suite = runner.suiteOrThrow(String(form.get("suite")));
  if (!suite.labelFromForm) throw new Error("This suite has no answer form");
  const input = suite.inputFromForm(form);
  const value = suite.labelFromForm(form);
  const tags = String(form.get("tags") ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  await prisma.evalCase.create({
    data: {
      suite: suite.key,
      input,
      tags,
      split: form.get("split") === "TEST" ? "TEST" : "DEV",
      status: "ACTIVE",
      source: "OWNER",
      labels: {
        create: {
          kind: "EXPECTED",
          status: "CONFIRMED",
          value,
          raterRole: "OWNER",
        },
      },
    },
  });
  revalidatePath(`/evals/${suite.key}`);
}

/**
 * A person changes a case's answer: a new confirmed answer, with the old
 * ones kept as history. Stored answers are rescored for free.
 */
export async function editAnswer(form: FormData) {
  const suite = runner.suiteOrThrow(String(form.get("suite")));
  if (!suite.labelFromForm) throw new Error("This suite has no answer form");
  const caseId = String(form.get("case"));
  const c = await prisma.evalCase.findFirst({
    where: { id: caseId, suite: suite.key },
  });
  if (!c) throw new Error("Unknown case");
  await prisma.evalCaseLabel.create({
    data: {
      caseId,
      kind: "EXPECTED",
      status: "CONFIRMED",
      value: suite.labelFromForm(form),
      raterRole: "OWNER",
    },
  });
  after(() => runner.rescoreRecent(suite.key));
  revalidatePath(`/evals/${suite.key}`);
}

/** Takes a case out of use; its stored answers stay. */
export async function retireCase(form: FormData) {
  const suite = runner.suiteOrThrow(String(form.get("suite")));
  await prisma.evalCase.updateMany({
    where: { id: String(form.get("case")), suite: suite.key },
    data: { status: "RETIRED" },
  });
  revalidatePath(`/evals/${suite.key}`);
}
