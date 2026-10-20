import Link from "next/link";
import {
  asText,
  thumbsSummary,
  whyNotACase,
  type AnySuite,
  type FeedbackRecord,
} from "evalkeeper";
import { FieldValues } from "@/components/evalkeeper/Fields";
import { Submit } from "@/components/evalkeeper/Submit";
import { InfoTip, Tip } from "@/components/evalkeeper/Tip";
import { Card, Chip, pct } from "@/components/evalkeeper/ui";
import { feedbackStore } from "@/lib/evalkeeper";
import { daysAgo } from "@/lib/time";
import { SUITES } from "@/lib/suites";
import { dismissFeedback, makeCase } from "./actions";

export const dynamic = "force-dynamic";

/**
 * What people thought of the AI's answers: thumbs per feature this week,
 * and each rating waiting for a look, to make into a case or dismiss.
 */
export default async function FeedbackPage() {
  const all = await feedbackStore.listFeedback();
  const summary = thumbsSummary(all, daysAgo(7));
  const open = all
    .filter((f) => f.status === "OPEN")
    .sort((a, b) => Number(b.rating === "DOWN") - Number(a.rating === "DOWN"));
  const suiteFor = (op: string) => SUITES.find((s) => s.operation === op);
  const label = (op: string) => suiteFor(op)?.label ?? op;

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Link href="/evals" className="text-sm text-muted">
          ← Evals
        </Link>
        <h1 className="text-2xl font-semibold">Feedback</h1>
        <p className="readable text-muted">
          Thumbs up and down from people using the product. A rating on a kept
          input can become a draft case, so the next model is tested on the
          answer people didn&apos;t like.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">
          This week
          <InfoTip term="thumbs" />
        </h2>
        {summary.length === 0 ? (
          <p className="text-sm text-muted">No ratings this week.</p>
        ) : (
          <Card className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="text-left text-muted">
                <tr className="border-b border-line">
                  <th className="p-3 font-normal">Feature</th>
                  <th className="p-3 font-normal">Thumbs up</th>
                  <th className="p-3 font-normal">Thumbs down</th>
                  <th className="p-3 font-normal">Share down</th>
                  <th className="p-3 font-normal">Waiting</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((s) => (
                  <tr
                    key={s.operation}
                    className="border-b border-line last:border-0"
                  >
                    <td className="p-3">
                      <span className="mr-2 font-medium">
                        {label(s.operation)}
                      </span>
                      {s.alert && (
                        <Tip
                          text="At least 5 ratings, and at least 20% of them thumbs down: worth a look."
                          id={`alert-${s.operation}`}
                          side="bottom"
                        >
                          <Chip tone="warn">Needs a look</Chip>
                        </Tip>
                      )}
                    </td>
                    <td className="p-3 tabular-nums">{s.up}</td>
                    <td className="p-3 tabular-nums">{s.down}</td>
                    <td className="p-3 tabular-nums">
                      {s.downShare === null ? "—" : pct(s.downShare)}
                    </td>
                    <td className="p-3 tabular-nums">{s.open}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">
          Waiting for a look ({open.length})
        </h2>
        {open.length === 0 && (
          <p className="text-sm text-muted">
            Nothing waiting. Rate an answer on the{" "}
            <Link href="/try" className="underline">
              try it
            </Link>{" "}
            page to see one here.
          </p>
        )}
        <div className="space-y-3">
          {open.map((f) => (
            <Rating
              key={f.id}
              fields={suiteFor(f.operation)?.fields}
              f={f}
              feature={label(f.operation)}
              why={whyNotACase(f, suiteFor(f.operation))}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function Rating({
  f,
  fields,
  feature,
  why,
}: {
  f: FeedbackRecord;
  fields: AnySuite["fields"];
  feature: string;
  why: string | null;
}) {
  return (
    <article
      aria-label={`Rating: ${feature}${f.reason ? `, ${f.reason}` : ""}`}
    >
      <Card className="space-y-3 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <Chip tone={f.rating === "DOWN" ? "serious" : "live"}>
              {f.rating === "DOWN" ? "👎 Thumbs down" : "👍 Thumbs up"}
            </Chip>
            <span className="font-medium">{feature}</span>
          </span>
          <span className="text-xs text-muted">
            {f.updatedAt.toLocaleString()}
          </span>
        </div>
        {f.reason && <p className="readable">&ldquo;{f.reason}&rdquo;</p>}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              Input
            </p>
            {f.input === null ? (
              <p className="text-muted">Not kept</p>
            ) : fields ? (
              <FieldValues
                fields={fields.input}
                values={f.input}
                prefix={`${f.id}-in-`}
              />
            ) : (
              <p className="whitespace-pre-wrap font-mono text-xs">
                {asText(f.input)}
              </p>
            )}
          </div>
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              Answer
            </p>
            {fields && f.output !== null ? (
              <FieldValues
                fields={fields.label}
                values={f.output}
                prefix={`${f.id}-out-`}
              />
            ) : (
              <p className="whitespace-pre-wrap font-mono text-xs">
                {asText(f.output) || f.excerpt || "—"}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {why === null ? (
            <form action={makeCase} className="flex items-center gap-1">
              <input type="hidden" name="feedback" value={f.id} />
              <Submit>Make a case</Submit>
              <InfoTip term="makeCase" id={`make-${f.id}`} />
            </form>
          ) : (
            <p className="readable text-xs text-muted">{why}</p>
          )}
          <form action={dismissFeedback}>
            <input type="hidden" name="feedback" value={f.id} />
            <Submit variant="quiet">Dismiss</Submit>
          </form>
        </div>
      </Card>
    </article>
  );
}
