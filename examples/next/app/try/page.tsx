import { cookies } from "next/headers";
import { Card, Thumbs } from "@crowandraven/evalkeeper/react";
import { prisma } from "@/lib/db";
import { feedbackStore } from "@/lib/evalkeeper";
import { ticketTriage } from "@/lib/suites/ticketTriage";
import { rateAnswer } from "./actions";

export const dynamic = "force-dynamic";

/** One answer to rate: a ticket and where the feature sent it. */
const SAMPLE = {
  id: "sample-answer",
  input: {
    subject: "Billed twice for March",
    body: "I was charged twice for March. Can you refund one?",
  },
  // Not the right queue, so there's something to rate down.
  output: { category: "account", urgency: "normal" },
};

/**
 * Thumbs on an AI answer, as people see them in your product. Rate this
 * one, and it shows up on the evals' feedback page, where a thumbs down
 * can become a case. Your app puts the same thumbs on its own answers.
 */
export default async function TryPage() {
  // The sample is kept (consented), so a rating on it can become a case.
  await prisma.demoAnswer.upsert({
    where: { id: SAMPLE.id },
    create: {
      id: SAMPLE.id,
      operation: ticketTriage.operation,
      input: SAMPLE.input,
      output: SAMPLE.output,
      consented: true,
    },
    update: {},
  });
  const rater = (await cookies()).get("rater")?.value;
  const mine = rater
    ? await feedbackStore.listFeedback({ operation: ticketTriage.operation })
    : [];
  const rating =
    mine.find((f) => f.targetId === SAMPLE.id && f.raterId === rater)?.rating ??
    null;

  return (
    <div className="space-y-8">
      <div className="readable space-y-2">
        <h1 className="text-2xl font-semibold">Rate an answer</h1>
        <p className="text-muted">
          What people see in your product: an AI answer with thumbs. Rate this
          one, and say what was wrong if it was. It shows up on the evals&apos;
          feedback page, where a thumbs down can become a case to test every
          model on.
        </p>
      </div>

      <article aria-label={`Answer: ${SAMPLE.input.subject}`}>
        <Card className="space-y-3">
          <p className="font-medium">{SAMPLE.input.subject}</p>
          <p className="readable text-sm text-muted">{SAMPLE.input.body}</p>
          <p className="text-sm">
            Queue: <strong>{SAMPLE.output.category}</strong> · Urgency:{" "}
            <strong>{SAMPLE.output.urgency}</strong>
          </p>
          <Thumbs targetId={SAMPLE.id} initial={rating} action={rateAnswer} />
        </Card>
      </article>
    </div>
  );
}
