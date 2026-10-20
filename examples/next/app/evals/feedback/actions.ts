"use server";

import { revalidatePath } from "next/cache";
import { caseFromFeedback, formText } from "evalkeeper";
import { feedbackStore, store } from "@/lib/evalkeeper";
import { SUITES } from "@/lib/suites";

/** In your app, check that the person may review feedback (an admin). */

async function find(id: string) {
  const f = (await feedbackStore.listFeedback()).find((x) => x.id === id);
  if (!f) throw new Error("Unknown rating");
  return f;
}

/** Makes a draft case from a rating; a person finishes its answer. */
export async function makeCase(form: FormData) {
  const f = await find(formText(form, "feedback"));
  const suite = SUITES.find((s) => s.operation === f.operation);
  const draft = suite ? caseFromFeedback(f, suite) : null;
  if (!draft || !suite) throw new Error("This rating can't become a case");
  const c = await store.createCase(draft);
  await feedbackStore.setFeedbackStatus(f.id, "CASED", c.id);
  revalidatePath("/evals", "layout");
}

export async function dismissFeedback(form: FormData) {
  const f = await find(formText(form, "feedback"));
  await feedbackStore.setFeedbackStatus(f.id, "DISMISSED");
  revalidatePath("/evals/feedback");
}
