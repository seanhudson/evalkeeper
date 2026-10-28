import { cookies } from "next/headers";
import { Fields } from "@crowandraven/evalkeeper/react";
import { Card, InfoTip, Submit } from "@crowandraven/evalkeeper/react";
import { Thumbs } from "@crowandraven/evalkeeper/react";
import { prisma } from "@/lib/db";
import { feedbackStore } from "@/lib/evalkeeper";
import { ticketTriage } from "@/lib/suites/ticketTriage";
import { rateAnswer, triageTicket } from "./actions";

export const dynamic = "force-dynamic";

/**
 * The product side: a feature people use, with thumbs on each answer. In
 * your app this is your own page; the thumbs are the part to copy.
 */
export default async function TryPage() {
  const answers = await prisma.demoAnswer.findMany({
    where: { operation: ticketTriage.operation },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  const rater = (await cookies()).get("rater")?.value;
  const mine = rater
    ? await feedbackStore.listFeedback({ operation: ticketTriage.operation })
    : [];
  const ratingOf = (id: string) =>
    mine.find((f) => f.targetId === id && f.raterId === rater)?.rating ?? null;
  const fields = ticketTriage.fields?.input ?? [];

  return (
    <div className="space-y-8">
      <div className="readable space-y-2">
        <h1 className="text-2xl font-semibold">Try it: ticket triage</h1>
        <p className="text-muted">
          The feature as people use it. Paste a ticket, see where the live model
          sends it, and rate the answer. Ratings show up on the evals&apos;
          feedback page, where they can become cases.
        </p>
      </div>

      <Card>
        <form action={triageTicket} className="space-y-4">
          <Fields fields={fields} prefix="try-" />
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="consent"
              defaultChecked
              className="mt-0.5"
            />
            <span className="readable">
              Keep this ticket to improve the feature
              <InfoTip term="keepInput" />
            </span>
          </label>
          <Submit>Triage it</Submit>
        </form>
      </Card>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Answers</h2>
        {answers.length === 0 && (
          <p className="text-sm text-muted">None yet.</p>
        )}
        {answers.map((a) => {
          const input = ticketTriage.input.parse(a.input);
          const out = a.output as { category: string; urgency: string };
          return (
            <article key={a.id} aria-label={`Answer: ${input.subject}`}>
              <Card className="space-y-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">{input.subject}</span>
                  <span className="text-xs text-muted">
                    {a.consented ? "Kept to improve the feature" : "Not kept"}
                  </span>
                </div>
                <p className="text-sm">
                  Queue: <strong>{out.category.replace(/_/g, " ")}</strong> ·
                  Urgency: <strong>{out.urgency}</strong>
                </p>
                <Thumbs
                  targetId={a.id}
                  initial={ratingOf(a.id)}
                  action={rateAnswer}
                />
              </Card>
            </article>
          );
        })}
      </section>
    </div>
  );
}
