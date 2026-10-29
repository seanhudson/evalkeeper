import { LINK } from "./format.js";
import { evalsPath, type EvalAppConfig } from "./app.js";
import { Link } from "./pieces.js";
import { BackLink, Card, InfoTip, Submit, TextArea, Tip } from "./pieces.js";
import { rateQueue } from "../index.js";
import { AnswerInput, FieldValues } from "./Fields.js";

/**
 * Rating an imported suite's cases blind: one case at a time, the oldest
 * this person hasn't rated or skipped, shown by its input alone. The app's
 * output, what anyone did with the item, other answers, tags, and notes
 * stay hidden, because any of them anchors the rating.
 */

/** Blind rating: one case at a time, by its input only. Null when it doesn't exist. */
export async function RateView({
  app,
  suite: key,
  rater,
}: {
  /** Your screens' configuration. */
  app: EvalAppConfig;
  suite: string;
  /** Who is rating: their own answers are kept apart. */
  rater: { id: string; name: string };
}) {
  const admin = rater;
  const suite = app.suiteByKey[key];
  const fields = suite?.fields;
  if (
    !suite ||
    suite.caseKind !== "imported" ||
    suite.rateBlind === false ||
    !fields ||
    !(suite.labelFromForm || app.answerEditors[key])
  )
    return null;
  const queue = rateQueue(await app.store.listCases(key), admin.id);
  const next = queue.next;
  const input = next ? suite.input.parse(next.input) : null;

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <BackLink href={evalsPath(app, key)}>{suite.label}</BackLink>
        <h1 className="text-2xl font-semibold">
          Rate blind
          <InfoTip term="rateBlind" />
        </h1>
        <p className="readable text-muted">
          One case at a time, from its input alone. You won&apos;t see what the
          app decided or what anyone did with it, so nothing anchors your
          answer. Give the answer and why, or skip it.
        </p>
        <p className="text-sm text-muted">
          <Tip term="rateQueue" id="rate-queue">
            <span>
              {queue.rated} rated · {queue.skipped} skipped · {queue.left} left
            </span>
          </Tip>
        </p>
      </div>

      {next && input !== null ? (
        <Card className="space-y-6">
          <section className="space-y-3">
            <h2 className="font-semibold">{suite.title(input)}</h2>
            {fields.input.length ? (
              <FieldValues
                fields={fields.input}
                values={next.input}
                prefix="rate-in-"
              />
            ) : (
              <pre className="readable whitespace-pre-wrap text-sm">
                {suite.describe?.(input) ?? JSON.stringify(next.input, null, 2)}
              </pre>
            )}
          </section>

          {/* Keyed by case, so the next case starts with an empty form. */}
          <form
            key={next.id}
            action={app.actions.rateBlind}
            className="space-y-4"
          >
            <input type="hidden" name="suite" value={key} />
            <input type="hidden" name="case" value={next.id} />
            <AnswerInput
              fields={fields.label}
              editor={app.answerEditors[key]}
              input={next.input}
              prefix="rate-"
            />
            <div className="space-y-1">
              <label
                htmlFor="rate-reason"
                className="block text-sm font-medium"
              >
                Why
              </label>
              <TextArea
                id="rate-reason"
                name="reason"
                required
                rows={3}
                className="w-full rounded-md border border-line bg-card px-3 py-2 text-sm focus:border-accent focus:outline-none"
              />
              <p className="readable text-xs text-muted">
                What in the input decided it, in a sentence. Kept with your
                answer, so anyone checking it later sees your reasoning.
              </p>
            </div>
            <p className="readable text-xs text-muted">
              Saves your own confirmed answer beside anyone else&apos;s, and
              rescores tests for free.
            </p>
            <Submit>Save rating</Submit>
          </form>

          <form action={app.actions.skipCase}>
            <input type="hidden" name="suite" value={key} />
            <input type="hidden" name="case" value={next.id} />
            <Tip control term="skip" id="rate-skip">
              <Submit variant="quiet">Skip</Submit>
            </Tip>
          </form>
        </Card>
      ) : (
        <Card className="space-y-2">
          <h2 className="font-semibold">Nothing left for you to rate</h2>
          <p className="readable text-sm text-muted">
            You&apos;ve rated or skipped every case in this suite.
            {queue.skipped > 0 &&
              " Cases you skipped are still in the answer key, where you can write their answers."}
          </p>
          <Link href={evalsPath(app, key)} className={`text-sm ${LINK}`}>
            Back to the answer key
          </Link>
        </Card>
      )}
    </div>
  );
}
