import { daysAgo, type EvalAppConfig } from "./app.js";
import {
  asText,
  isInjectionSuite,
  thumbsSummary,
  whyNotACase,
  type AnySuite,
  type FeedbackRecord,
} from "../index.js";
import { FieldValues } from "./Fields.js";
import {
  BackLink,
  Card,
  Chip,
  InfoTip,
  Submit,
  Tip,
  LocalDate,
} from "./pieces.js";
import { pct } from "./format.js";
import { ThumbsDown, ThumbsUp } from "lucide-react";

/**
 * What people thought of the AI's answers: thumbs per feature this week,
 * and each rating waiting for a look, to make into a case or dismiss.
 */

/** Thumbs up and down, and what to do with each. Null when it doesn't exist. */
export async function FeedbackView({
  app,
}: {
  /** Your screens' configuration. */
  app: EvalAppConfig;
}) {
  const all = await app.feedbackStore.listFeedback();
  const summary = thumbsSummary(all, daysAgo(7));
  const open = all
    .filter((f) => f.status === "OPEN")
    .sort((a, b) => Number(b.rating === "DOWN") - Number(a.rating === "DOWN"));
  const suiteFor = (op: string) =>
    app.suites.find((s) => s.operation === op && !isInjectionSuite(s));
  const label = (op: string) => suiteFor(op)?.label ?? op;

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <BackLink href={app.basePath}>Evals</BackLink>
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
          <Card className="overflow-x-auto p-0 lg:overflow-visible">
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
            Nothing waiting. Ratings show up here once an AI feature has a
            thumbs up and down (step 8 of{" "}
            <a
              href="https://seanhudson.github.io/evalkeeper/guides/thumbs/#set-it-up"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              the guide
            </a>
            ).
          </p>
        )}
        <div className="space-y-3">
          {open.map((f) => (
            <Rating
              app={app}
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
  app,
  f,
  fields,
  feature,
  why,
}: {
  app: EvalAppConfig;
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
              {f.rating === "DOWN" ? (
                <>
                  <ThumbsDown aria-hidden className="h-3.5 w-3.5" /> Thumbs down
                </>
              ) : (
                <>
                  <ThumbsUp aria-hidden className="h-3.5 w-3.5" /> Thumbs up
                </>
              )}
            </Chip>
            <span className="font-medium">{feature}</span>
          </span>
          <span className="text-xs text-muted">
            <LocalDate date={f.updatedAt} time />
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
            <form
              action={app.actions.makeCase}
              className="flex items-center gap-1"
            >
              <input type="hidden" name="feedback" value={f.id} />
              <Submit>Make a case</Submit>
              <InfoTip term="makeCase" id={`make-${f.id}`} />
            </form>
          ) : (
            <p className="readable text-xs text-muted">{why}</p>
          )}
          <form action={app.actions.dismissFeedback}>
            <input type="hidden" name="feedback" value={f.id} />
            <Submit variant="quiet">Dismiss</Submit>
          </form>
        </div>
      </Card>
    </article>
  );
}
