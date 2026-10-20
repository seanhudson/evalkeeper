"use server";

import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { formText } from "evalkeeper";
import { prisma } from "@/lib/db";
import { feedbackStore, routeFor } from "@/lib/evalkeeper";
import { ticketTriage } from "@/lib/suites/ticketTriage";

/**
 * The "try it" page: the product feature (ticket triage on the live
 * model) and thumbs on its answers. In your app these are your feature's
 * own actions; the rating part is the same.
 */

/** Who's rating, without accounts: a random id in a cookie. Use your user id. */
async function raterId(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get("rater")?.value;
  if (existing) return existing;
  const id = randomUUID();
  jar.set("rater", id, { httpOnly: true, sameSite: "lax", path: "/" });
  return id;
}

export async function triageTicket(form: FormData): Promise<void> {
  const input = ticketTriage.inputFromForm(form);
  const route = await routeFor(ticketTriage.operation);
  const output = await ticketTriage.run(input, {
    model: route.model,
    reasoningEffort: route.reasoningEffort,
    onCost: () => undefined,
  });
  await prisma.demoAnswer.create({
    data: {
      operation: ticketTriage.operation,
      input,
      output,
      consented: form.get("consent") === "on",
    },
  });
  revalidatePath("/try");
}

/**
 * A thumbs up or down. The answer is looked up by id, never taken from the
 * browser, and its input is kept only when the person agreed.
 */
export async function rateAnswer(form: FormData): Promise<void> {
  const answer = await prisma.demoAnswer.findUnique({
    where: { id: formText(form, "targetId") },
  });
  if (!answer) throw new Error("Unknown answer");
  const rater = await raterId();
  if (form.get("clear") === "1") {
    await feedbackStore.clearRating(rater, answer.operation, answer.id);
  } else {
    await feedbackStore.rate({
      operation: answer.operation,
      targetId: answer.id,
      raterId: rater,
      rating: formText(form, "rating") === "DOWN" ? "DOWN" : "UP",
      reason: formText(form, "reason"),
      output: answer.output,
      input: answer.consented ? answer.input : null,
    });
  }
  revalidatePath("/try");
  revalidatePath("/evals", "layout");
}
