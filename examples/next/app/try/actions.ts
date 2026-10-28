"use server";

import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { formText } from "@crowandraven/evalkeeper";
import { prisma } from "@/lib/db";
import { feedbackStore } from "@/lib/evalkeeper";

/**
 * The "try it" page: thumbs on an AI answer. In your app, rateAnswer is
 * the part to copy: it records the rating, and the input only when the
 * person agreed to keep it.
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
