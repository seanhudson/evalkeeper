import {
  Chip,
  InfoTip,
  Select,
  Submit,
  TextArea,
  TextInput,
  Tip,
  type ChipTone,
} from "./pieces.js";
import {
  allPassed,
  type CaseRecord,
  type GlossaryTerm,
  type OutputRecord,
  type AnySuite,
  type BoardRow,
  type CheckResult,
  EXPERT_REVIEWED,
  FROM_BASE_CASE,
  isShippedReview,
  replacedStarters,
} from "../index.js";
import { Check, ChevronRight, CircleAlert, Eye, X } from "lucide-react";
import type { EvalAppConfig } from "./app.js";
import { AnswerInput, FieldValues, Fields } from "./Fields.js";
import { AddCaseHeader, OpenLinkedCase } from "./AddCase.js";
import { CaseMenu } from "./CaseMenu.js";
import { CaseStatusChip, ConfirmAnswer } from "./ConfirmAnswer.js";
import { ReadableValue } from "./Readable.js";

/** A suite's cases in use, with each case's answers newest first. */
async function loadCases(
  app: EvalAppConfig,
  suite: string,
): Promise<CaseRecord[]> {
  return (await app.store.listCases(suite)).map((c) => ({
    ...c,
    labels: [...c.labels].sort((a, b) => +b.updatedAt - +a.updatedAt),
  }));
}

const CONFIRMED_STATUS = {
  text: "Confirmed",
  tone: "live",
  term: "confirmed",
} as const satisfies { text: string; tone: ChipTone; term: GlossaryTerm };

const STATUS: Record<
  string,
  { text: string; tone: ChipTone; term: GlossaryTerm }
> = {
  CONFIRMED: CONFIRMED_STATUS,
  PROVISIONAL: { text: "Provisional", tone: "warn", term: "provisional" },
  PENDING: { text: "Pending", tone: "warn", term: "pending" },
};

/**
 * The answer key: every case in use, each opening to its input, its
 * answer, and how each model's latest test did on it, with forms to add a
 * case, edit an answer, or retire a case.
 */
export async function AnswerKey({
  app,
  readOnly = false,
  suite,
  rows,
  heading,
  tools,
}: {
  suite: AnySuite;
  rows: BoardRow[];
  /** The section's heading, with "Add a case" across from it. */
  heading: React.ReactNode;
  /** More buttons beside "Add a case" (rescore). */
  tools?: React.ReactNode;
  /** Your screens' configuration. */
  app: EvalAppConfig;
  /**
   * Cases made by Evalkeeper (an injection suite's attack cases), shown
   * without adding, editing, confirming, or retiring.
   */
  readOnly?: boolean;
}) {
  const cases = await loadCases(app, suite.key);
  // Each model's latest test (at the operation's setting), by case.
  const modelByRun = new Map(
    rows.flatMap((r) =>
      r.test && !r.variant ? [[r.test.runId, r.label] as const] : [],
    ),
  );
  // One query where the store can: one per test is slow on a remote
  // database.
  const runIds = [...modelByRun.keys()];
  const outputs = app.store.listOutputsFor
    ? await app.store.listOutputsFor(runIds)
    : (await Promise.all(runIds.map((id) => app.store.listOutputs(id)))).flat();
  const byCase = new Map<string, { model: string; output: OutputRecord }[]>();
  // One line per model: a test with repeats answered each case several
  // times, so a case shows the first repeat the model got wrong, if any.
  const right = (o: OutputRecord) => !o.error && allPassed(o.scores);
  for (const o of outputs) {
    const model = modelByRun.get(o.runId) ?? o.runId;
    const list = byCase.get(o.caseId) ?? [];
    const i = list.findIndex((x) => x.model === model);
    const had = list[i];
    if (!had) list.push({ model, output: o });
    else if (right(had.output) && !right(o)) list[i] = { model, output: o };
    byCase.set(o.caseId, list);
  }
  const fields = suite.fields;
  // Starters a starter update replaced: marked, so nobody retires the
  // current ones by mistake.
  const replaced = new Set(
    readOnly ? [] : replacedStarters(suite, cases).map((c) => c.id),
  );

  return (
    <div className="space-y-4">
      <OpenLinkedCase />
      <AddCaseHeader
        heading={heading}
        tools={tools}
        draft={
          !readOnly &&
          suite.draftMore &&
          app.actions.draftMore && (
            <form action={app.actions.draftMore} className="space-y-4">
              <input type="hidden" name="suite" value={suite.key} />
              <div className="space-y-1">
                <label
                  htmlFor="draft-request"
                  className="block text-sm font-medium"
                >
                  Describe the cases you want
                </label>
                <TextArea
                  id="draft-request"
                  name="focus"
                  required
                  rows={3}
                  maxLength={500}
                  placeholder="e.g. three guardrail cases where the person states a salary floor"
                  className="w-full rounded-md border border-line bg-card px-3 py-2 text-sm focus:border-accent focus:outline-none"
                />
              </div>
              <div className="space-y-1">
                <label
                  htmlFor="draft-count"
                  className="block text-sm font-medium"
                >
                  How many
                </label>
                <Select
                  id="draft-count"
                  name="count"
                  defaultValue="3"
                  className="rounded-md border border-line bg-card px-3 py-2 text-sm"
                >
                  {[1, 2, 3, 5, 10].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </Select>
              </div>
              <p className="readable text-xs text-muted">
                A model writes them from your description and the cases you
                have. They arrive as drafts: nothing counts until you confirm
                each one.
              </p>
              <Submit>Draft them</Submit>
            </form>
          )
        }
        form={
          !readOnly &&
          fields &&
          (suite.labelFromForm || app.answerEditors[suite.key]) && (
            <form action={app.actions.addCase} className="space-y-4">
              <input type="hidden" name="suite" value={suite.key} />
              <Fields fields={fields.input} prefix="new-" />
              <p className="readable text-sm text-muted">
                What a good answer is. You're writing it, so it's confirmed.
              </p>
              <AnswerInput
                fields={fields.label}
                editor={app.answerEditors[suite.key]}
                prefix="new-"
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <label
                    htmlFor="new-tags"
                    className="block text-sm font-medium"
                  >
                    Tags
                    <InfoTip term="tags" id="new-tags" />
                  </label>
                  <TextInput
                    id="new-tags"
                    name="tags"
                    placeholder="e.g. billing, money now"
                    className="w-full rounded-md border border-line bg-card px-3 py-2 text-sm focus:border-accent focus:outline-none"
                  />
                  <p className="text-xs text-muted">
                    What this case tests, comma-separated. The quick set picks
                    cases to cover the most tags.
                  </p>
                </div>
                <div className="space-y-1">
                  <label
                    htmlFor="new-split"
                    className="block text-sm font-medium"
                  >
                    Set
                    <InfoTip
                      text="DEV: cases you tune against. TEST: cases you only check, never tune against, so they show how a change does on cases it wasn't fitted to."
                      id="new-split"
                    />
                  </label>
                  <Select
                    id="new-split"
                    name="split"
                    defaultValue="DEV"
                    className="w-full rounded-md border border-line bg-card px-3 py-2 text-sm"
                  >
                    <option value="DEV">DEV: tune against it</option>
                    <option value="TEST">
                      TEST: check only, never tune against
                    </option>
                  </Select>
                </div>
              </div>
              <div className="flex gap-2">
                <Submit>Add case</Submit>
              </div>
            </form>
          )
        }
      />

      <div className="space-y-2">
        {cases.map((c) => (
          <CaseItem
            app={app}
            readOnly={readOnly}
            key={c.id}
            suite={suite}
            c={c}
            results={byCase.get(c.id) ?? []}
            replaced={replaced.has(c.id)}
          />
        ))}
        {!cases.length && <p className="text-sm text-muted">No cases yet.</p>}
      </div>
    </div>
  );
}

function CaseItem({
  app,
  readOnly,
  suite,
  c,
  results,
  replaced = false,
}: {
  app: EvalAppConfig;
  readOnly: boolean;
  suite: AnySuite;
  c: CaseRecord;
  /** A starter a starter update replaced (`replacedStarters`). */
  replaced?: boolean;
  results: {
    model: string;
    output: { scores: unknown; error: string | null; output?: unknown };
  }[];
}) {
  const answer =
    c.labels.find((l) => l.status === "CONFIRMED") ??
    c.labels.find((l) => l.status === "PROVISIONAL") ??
    c.labels.find((l) => l.status === "PENDING");
  // A confirmation from outside the app: shipped with the suite, or
  // carried from the case an attack case was made from.
  const shipped =
    answer?.status !== "CONFIRMED"
      ? null
      : answer.raterRole === FROM_BASE_CASE
        ? { text: "From base case", term: "fromBaseCase" as const }
        : !isShippedReview(answer)
          ? null
          : answer.raterRole === EXPERT_REVIEWED
            ? { text: "Expert reviewed", term: "expertReviewed" as const }
            : { text: "Author reviewed", term: "authorReviewed" as const };
  const status = (answer && STATUS[answer.status]) ?? {
    text: "No answer",
    tone: "warn" as const,
    term: "needsAnswer" as const,
  };
  const input = suite.input.parse(c.input);
  const right = results.filter(
    (r) =>
      !r.output.error && allPassed(r.output.scores as CheckResult[] | null),
  ).length;
  const label = (key: string) =>
    suite.checks.find((x) => x.key === key)?.label ?? key;
  const tags = Array.isArray(c.tags) ? c.tags : [];
  // An answer nobody has confirmed: shown first, to check.
  const checking =
    !readOnly &&
    (answer?.status === "PENDING" || answer?.status === "PROVISIONAL");
  const looks: string[] = [];
  let marks: string[] = [];
  try {
    const found = suite.lookAt?.(input, answer?.value ?? null) ?? [];
    looks.push(...found.map((l) => l.note));
    marks = found.flatMap((l) => l.marks ?? []);
  } catch {
    // A suite's pointers are a help, never a reason the case can't show.
  }
  // Models disagreeing with the answer is the surest sign to look closer.
  if (answer && results.length > 1 && right < results.length)
    looks.push(
      right === 0
        ? "no model's latest test agrees with this answer"
        : `models split: ${right} of ${results.length} agree with this answer`,
    );
  // What each model wrote, as the suite's short line (`outputLine`).
  const lineOf = (output: unknown): string | null => {
    try {
      return suite.outputLine?.(output) ?? null;
    } catch {
      return null;
    }
  };
  const inputFallback = suite.describe ? (
    <pre className="whitespace-pre-wrap text-xs">{suite.describe(input)}</pre>
  ) : (
    <ReadableValue value={c.input} marks={marks} />
  );

  // How each model's latest test did, with what it wrote: after the
  // answer, so a person reads the answer first.
  const modelResults = results.length > 0 && (
    <section className="space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
        Each model's latest test
      </h4>
      <ul className="space-y-1">
        {results.map(({ model, output }) => {
          const checks = (output.scores as CheckResult[] | null) ?? null;
          const failed = checks?.filter((x) => x.pass === false) ?? [];
          return (
            <li key={model} className="flex items-start gap-1.5">
              {output.error ? (
                <CircleAlert
                  aria-label="No answer"
                  className="mt-0.5 h-4 w-4 shrink-0 text-bad"
                />
              ) : failed.length ? (
                <X
                  aria-label="Wrong"
                  className="mt-0.5 h-4 w-4 shrink-0 text-warn"
                />
              ) : (
                <Check
                  aria-label="Right"
                  className="mt-0.5 h-4 w-4 shrink-0 text-good"
                />
              )}
              <span>
                <span className="font-medium">{model}</span>
                {output.error && (
                  <span className="text-muted">: {output.error}</span>
                )}
                {failed.map((x) => (
                  <span key={x.key} className="text-muted">
                    {" "}
                    · {label(x.key)}
                    {x.note ? `: ${x.note}` : ""}
                  </span>
                ))}
                {!output.error && lineOf(output.output) && (
                  <span className="readable block">
                    {lineOf(output.output)}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );

  return (
    <details
      id={`case-${c.id}`}
      className="group scroll-mt-4 rounded-md border border-line bg-card"
      // Where ConfirmAnswer moves on to after confirming the case above.
      data-pending={answer?.status === "PENDING" ? "true" : undefined}
    >
      {/* The chips keep their place on the right; a long title wraps
          beside them (below them only on a phone). */}
      <summary className="flex cursor-pointer list-none flex-wrap items-start justify-between gap-2 p-3 text-sm sm:flex-nowrap">
        <span className="flex min-w-0 flex-1 items-start pt-0.5 font-medium">
          <ChevronRight
            aria-hidden
            className="mr-1.5 mt-0.5 h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-90"
          />
          <span className="readable min-w-0">{suite.title(input)}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          <CaseStatusChip
            labelId={answer?.id ?? null}
            status={status}
            confirmed={CONFIRMED_STATUS}
            id={`status-${c.id}`}
          />
          {replaced && (
            <Tip term="replacedStarter" id={`replaced-${c.id}`} align="end">
              <Chip tone="warn">No longer a starter</Chip>
            </Tip>
          )}
          {shipped && (
            <Tip term={shipped.term} id={`reviewed-${c.id}`} align="end">
              <Chip tone="neutral">{shipped.text}</Chip>
            </Tip>
          )}
          <Tip
            term={c.split === "TEST" ? "test" : "dev"}
            id={`split-${c.id}`}
            align="end"
          >
            <Chip tone="neutral">{c.split === "TEST" ? "Test" : "Dev"}</Chip>
          </Tip>
          {results.length > 0 && (
            <Tip
              text={`Right on ${right} of ${results.length} models' latest tests.`}
              id={`right-${c.id}`}
              align="end"
            >
              <span
                className={`ml-1 inline-flex items-center gap-1 text-xs tabular-nums ${right === results.length ? "text-good" : "text-muted"}`}
              >
                <Check aria-hidden className="h-3.5 w-3.5" />
                {right}/{results.length}
              </span>
            </Tip>
          )}
        </span>
      </summary>

      <div className="relative space-y-5 px-3 pb-4 text-sm">
        {checking && (
          // What to check first, with its buttons: the answer, and what
          // it turns on. Clear of the case menu's button on the right.
          <section
            aria-label="Check this answer"
            className="space-y-3 rounded-md border border-good/25 bg-good/5 p-3 pr-12"
          >
            <div className="space-y-1">
              <h4 className="text-xs font-medium text-good">
                Check this answer
              </h4>
              {suite.fields ? (
                <FieldValues
                  fields={suite.fields.label}
                  values={answer.value}
                  prefix={`${c.id}-ans-`}
                />
              ) : (
                <ReadableValue value={answer.value} />
              )}
              {shipped && answer.note && (
                <p className="readable text-xs text-muted">{answer.note}</p>
              )}
            </div>
            {looks.length > 0 && (
              <div className="readable text-sm">
                <p className="flex items-center gap-1.5 text-xs font-medium">
                  <Eye
                    aria-hidden
                    className="h-3.5 w-3.5 shrink-0 text-muted"
                  />
                  Look at
                </p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5">
                  {looks.map((l) => (
                    <li key={l}>{l.charAt(0).toUpperCase() + l.slice(1)}</li>
                  ))}
                </ul>
              </div>
            )}
            {
              <CaseMenu
                suite={suite.key}
                caseId={c.id}
                retire={app.actions.retireCase}
                review={
                  <ConfirmAnswer
                    action={app.actions.confirmAnswer}
                    suite={suite.key}
                    labelId={answer.id}
                  />
                }
                editLabel={
                  suite.fields &&
                  (suite.labelFromForm || app.answerEditors[suite.key])
                    ? "Edit answer"
                    : null
                }
                edit={
                  suite.fields && (
                    <form
                      key={answer.updatedAt.toISOString()}
                      action={app.actions.editAnswer}
                      className="space-y-4"
                    >
                      <input type="hidden" name="suite" value={suite.key} />
                      <input type="hidden" name="case" value={c.id} />
                      <AnswerInput
                        fields={suite.fields.label}
                        editor={app.answerEditors[suite.key]}
                        input={c.input}
                        values={answer.value}
                        prefix={`${c.id}-`}
                      />
                      <p className="readable text-xs text-muted">
                        Saves a new confirmed answer and keeps the old one in
                        the history. Tests are rescored for free.
                      </p>
                      <Submit>Save answer</Submit>
                    </form>
                  )
                }
              />
            }
          </section>
        )}

        {checking ? (
          <section className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
              Input
            </h4>
            {suite.fields ? (
              <FieldValues
                fields={suite.fields.input}
                values={c.input}
                prefix={`${c.id}-in-`}
                marks={marks}
              />
            ) : (
              inputFallback
            )}
            {(tags.length > 0 || c.note) && (
              <p className="readable text-xs text-muted">
                {tags.length > 0 && `Tags: ${tags.join(", ")}. `}
                {c.note}
              </p>
            )}
          </section>
        ) : (
          <>
            <div className="grid gap-5 md:grid-cols-2">
              <section className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Input
                </h4>
                {suite.fields ? (
                  <FieldValues
                    fields={suite.fields.input}
                    values={c.input}
                    prefix={`${c.id}-in-`}
                    marks={marks}
                  />
                ) : (
                  inputFallback
                )}
              </section>
              <section className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Answer
                </h4>
                {answer && suite.fields ? (
                  <FieldValues
                    fields={suite.fields.label}
                    values={answer.value}
                    prefix={`${c.id}-ans-`}
                  />
                ) : (
                  <ReadableValue value={answer?.value ?? null} />
                )}
                {shipped && answer?.note && (
                  <p className="readable text-xs text-muted">{answer.note}</p>
                )}
                {(tags.length > 0 || c.note) && (
                  <p className="readable text-xs text-muted">
                    {tags.length > 0 && `Tags: ${tags.join(", ")}. `}
                    {c.note}
                  </p>
                )}
              </section>
            </div>
            {modelResults}
            {!readOnly && (
              <CaseMenu
                suite={suite.key}
                caseId={c.id}
                retire={app.actions.retireCase}
                startEditing={!answer}
                // Pending or provisional: confirm it as it is, or change it.
                review={
                  answer &&
                  (answer.status === "PENDING" ||
                    answer.status === "PROVISIONAL") && (
                    <ConfirmAnswer
                      action={app.actions.confirmAnswer}
                      suite={suite.key}
                      labelId={answer.id}
                    />
                  )
                }
                editLabel={
                  suite.fields &&
                  (suite.labelFromForm || app.answerEditors[suite.key])
                    ? answer
                      ? "Edit answer"
                      : "Write the answer"
                    : null
                }
                edit={
                  suite.fields && (
                    <form
                      key={answer?.updatedAt.toISOString() ?? "none"}
                      action={app.actions.editAnswer}
                      className="space-y-4"
                    >
                      <input type="hidden" name="suite" value={suite.key} />
                      <input type="hidden" name="case" value={c.id} />
                      <AnswerInput
                        fields={suite.fields.label}
                        editor={app.answerEditors[suite.key]}
                        input={c.input}
                        values={answer?.value}
                        prefix={`${c.id}-`}
                      />
                      <p className="readable text-xs text-muted">
                        Saves a new confirmed answer and keeps the old one in
                        the history. Tests are rescored for free.
                      </p>
                      <Submit>Save answer</Submit>
                    </form>
                  )
                }
              />
            )}
          </>
        )}
        {/* After the input, to compare what models wrote with it. */}
        {checking && modelResults}
      </div>
    </details>
  );
}
