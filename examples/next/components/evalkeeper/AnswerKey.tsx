import {
  allPassed,
  type CaseRecord,
  type GlossaryTerm,
  type OutputRecord,
  type AnySuite,
  type BoardRow,
  type CheckResult,
} from "@crowandraven/evalkeeper";
import { addCase, editAnswer, retireCase } from "@/lib/evalkeeper/actions";
import { Check, ChevronRight, CircleAlert, X } from "lucide-react";
import { store } from "@/lib/evalkeeper";
import { FieldValues, Fields } from "./Fields";
import { AddCaseHeader } from "./AddCase";
import { CaseMenu } from "./CaseMenu";
import { ConfirmAnswer } from "./ConfirmAnswer";
import { Submit } from "./Submit";
import { Chip, type ChipTone } from "./ui";
import { InfoTip, Tip } from "./Tip";

/** A suite's cases in use, with each case's answers newest first. */
async function loadCases(suite: string): Promise<CaseRecord[]> {
  return (await store.listCases(suite)).map((c) => ({
    ...c,
    labels: [...c.labels].sort((a, b) => +b.updatedAt - +a.updatedAt),
  }));
}

const STATUS: Record<
  string,
  { text: string; tone: ChipTone; term: GlossaryTerm }
> = {
  CONFIRMED: { text: "Confirmed", tone: "live", term: "confirmed" },
  PROVISIONAL: { text: "Provisional", tone: "warn", term: "provisional" },
  PENDING: { text: "Pending", tone: "warn", term: "pending" },
};

/**
 * The answer key: every case in use, each opening to its input, its
 * answer, and how each model's latest test did on it, with forms to add a
 * case, edit an answer, or retire a case.
 */
export async function AnswerKey({
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
}) {
  const cases = await loadCases(suite.key);
  // Each model's latest test (at the operation's setting), by case.
  const modelByRun = new Map(
    rows.flatMap((r) =>
      r.test && !r.variant ? [[r.test.runId, r.label] as const] : [],
    ),
  );
  // One query where the store can: one per test is slow on a remote
  // database.
  const runIds = [...modelByRun.keys()];
  const outputs = store.listOutputsFor
    ? await store.listOutputsFor(runIds)
    : (await Promise.all(runIds.map((id) => store.listOutputs(id)))).flat();
  const byCase = new Map<string, { model: string; output: OutputRecord }[]>();
  for (const o of outputs) {
    byCase.set(o.caseId, [
      ...(byCase.get(o.caseId) ?? []),
      { model: modelByRun.get(o.runId) ?? o.runId, output: o },
    ]);
  }
  const fields = suite.fields;

  return (
    <div className="space-y-4">
      <AddCaseHeader
        heading={heading}
        tools={tools}
        form={
          fields &&
          suite.labelFromForm && (
            <form action={addCase} className="space-y-4">
              <input type="hidden" name="suite" value={suite.key} />
              <Fields fields={fields.input} prefix="new-" />
              <p className="readable text-sm text-muted">
                What a good answer is. You're writing it, so it's confirmed.
              </p>
              <Fields fields={fields.label} prefix="new-" />
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <label
                    htmlFor="new-tags"
                    className="block text-sm font-medium"
                  >
                    Tags
                    <InfoTip term="tags" id="new-tags" />
                  </label>
                  <input
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
                  <select
                    id="new-split"
                    name="split"
                    defaultValue="DEV"
                    className="w-full rounded-md border border-line bg-card px-3 py-2 text-sm"
                  >
                    <option value="DEV">DEV: tune against it</option>
                    <option value="TEST">
                      TEST: check only, never tune against
                    </option>
                  </select>
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
            key={c.id}
            suite={suite}
            c={c}
            results={byCase.get(c.id) ?? []}
          />
        ))}
        {!cases.length && <p className="text-sm text-muted">No cases yet.</p>}
      </div>
    </div>
  );
}

function CaseItem({
  suite,
  c,
  results,
}: {
  suite: AnySuite;
  c: CaseRecord;
  results: {
    model: string;
    output: { scores: unknown; error: string | null };
  }[];
}) {
  const answer =
    c.labels.find((l) => l.status === "CONFIRMED") ??
    c.labels.find((l) => l.status === "PROVISIONAL") ??
    c.labels.find((l) => l.status === "PENDING");
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

  return (
    <details
      className="group rounded-md border border-line bg-card"
      // Where ConfirmAnswer moves on to after confirming the case above.
      data-pending={answer?.status === "PENDING" ? "true" : undefined}
    >
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 p-3 text-sm">
        <span className="font-medium">
          <ChevronRight
            aria-hidden
            className="mr-1.5 inline-block h-4 w-4 align-[-3px] text-muted transition-transform group-open:rotate-90"
          />
          {suite.title(input)}
        </span>
        <span className="flex items-center gap-1.5">
          <Tip term={status.term} id={`status-${c.id}`}>
            <Chip tone={status.tone}>{status.text}</Chip>
          </Tip>
          <Tip term={c.split === "TEST" ? "test" : "dev"} id={`split-${c.id}`}>
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
              />
            ) : (
              <pre className="whitespace-pre-wrap text-xs">
                {suite.describe?.(input) ?? JSON.stringify(c.input, null, 2)}
              </pre>
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
              <pre className="whitespace-pre-wrap text-xs">
                {JSON.stringify(answer?.value ?? null, null, 2)}
              </pre>
            )}
            {(tags.length > 0 || c.note) && (
              <p className="readable text-xs text-muted">
                {tags.length > 0 && `Tags: ${tags.join(", ")}. `}
                {c.note}
              </p>
            )}
          </section>
        </div>

        {results.length > 0 && (
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
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {answer?.status === "PENDING" && (
          <ConfirmAnswer suite={suite.key} labelId={answer.id} />
        )}

        <CaseMenu
          suite={suite.key}
          caseId={c.id}
          retire={retireCase}
          startEditing={!answer}
          editLabel={
            suite.fields && suite.labelFromForm
              ? answer
                ? "Edit answer"
                : "Write the answer"
              : null
          }
          edit={
            suite.fields && (
              <form
                key={answer?.updatedAt.toISOString() ?? "none"}
                action={editAnswer}
                className="space-y-4"
              >
                <input type="hidden" name="suite" value={suite.key} />
                <input type="hidden" name="case" value={c.id} />
                <Fields
                  fields={suite.fields.label}
                  values={answer?.value}
                  prefix={`${c.id}-`}
                />
                <p className="readable text-xs text-muted">
                  Saves a new confirmed answer and keeps the old one in the
                  history. Tests are rescored for free.
                </p>
                <Submit>Save answer</Submit>
              </form>
            )
          }
        />
      </div>
    </details>
  );
}
