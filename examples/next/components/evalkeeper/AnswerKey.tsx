import {
  allPassed,
  type AnySuite,
  type BoardRow,
  type CheckResult,
} from "evalkeeper";
import {
  addCase,
  confirmAnswer,
  editAnswer,
  retireCase,
} from "@/app/evals/[suite]/actions";
import { prisma } from "@/lib/db";
import { FieldValues, Fields } from "./Fields";
import { Submit } from "./Submit";
import { Card } from "./ui";

type CaseRow = Awaited<ReturnType<typeof loadCases>>[number];

function loadCases(suite: string) {
  return prisma.evalCase.findMany({
    where: { suite, status: { not: "RETIRED" } },
    include: { labels: { orderBy: { updatedAt: "desc" } } },
    orderBy: { createdAt: "asc" },
  });
}

const STATUS: Record<string, { text: string; tone: string }> = {
  CONFIRMED: { text: "Confirmed", tone: "text-good" },
  PROVISIONAL: { text: "Provisional", tone: "text-warn" },
  PENDING: { text: "Waiting for review", tone: "text-warn" },
};

/**
 * The answer key: every case in use, each opening to its input, its
 * answer, and how each model's latest test did on it, with forms to add a
 * case, edit an answer, or retire a case.
 */
export async function AnswerKey({
  suite,
  rows,
}: {
  suite: AnySuite;
  rows: BoardRow[];
}) {
  const cases = await loadCases(suite.key);
  // Each model's latest test (at the operation's setting), by case.
  const tested = rows.filter((r) => r.test && !r.variant);
  const outputs = await prisma.evalOutput.findMany({
    where: { runId: { in: tested.map((r) => r.test!.runId) } },
  });
  const byCase = new Map<
    string,
    { model: string; output: (typeof outputs)[number] }[]
  >();
  for (const o of outputs) {
    const row = tested.find((r) => r.test!.runId === o.runId)!;
    byCase.set(o.caseId, [
      ...(byCase.get(o.caseId) ?? []),
      { model: row.label, output: o },
    ]);
  }
  const fields = suite.fields;

  return (
    <div className="space-y-4">
      {fields && suite.labelFromForm && (
        <Card className="p-0">
          <details>
            <summary className="cursor-pointer list-none p-4 font-medium">
              + Add a case
            </summary>
            <form action={addCase} className="space-y-4 px-4 pb-4">
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
          </details>
        </Card>
      )}

      <Card className="space-y-2">
        {cases.map((c) => (
          <CaseItem
            key={c.id}
            suite={suite}
            c={c}
            results={byCase.get(c.id) ?? []}
          />
        ))}
        {!cases.length && <p className="text-sm text-muted">No cases yet.</p>}
      </Card>
    </div>
  );
}

function CaseItem({
  suite,
  c,
  results,
}: {
  suite: AnySuite;
  c: CaseRow;
  results: {
    model: string;
    output: { scores: unknown; error: string | null };
  }[];
}) {
  const answer =
    c.labels.find((l) => l.status === "CONFIRMED") ??
    c.labels.find((l) => l.status === "PROVISIONAL") ??
    c.labels.find((l) => l.status === "PENDING");
  const status = answer ? STATUS[answer.status] : null;
  const input = suite.input.parse(c.input);
  const right = results.filter(
    (r) =>
      !r.output.error && allPassed(r.output.scores as CheckResult[] | null),
  ).length;
  const label = (key: string) =>
    suite.checks.find((x) => x.key === key)?.label ?? key;
  const tags = Array.isArray(c.tags) ? (c.tags as string[]) : [];

  return (
    <details className="group rounded-md bg-tint">
      <summary className="flex cursor-pointer list-none flex-wrap items-baseline justify-between gap-2 p-3 text-sm">
        <span className="font-medium">
          <span className="mr-2 inline-block text-muted transition-transform group-open:rotate-90">
            ›
          </span>
          {suite.title(input)}
        </span>
        <span className="text-xs text-muted">
          {status && <span className={status.tone}>{status.text}</span>}
          {" · "}
          {c.split}
          {results.length > 0 &&
            ` · right on ${right} of ${results.length} models`}
        </span>
      </summary>

      <div className="space-y-5 px-3 pb-4 text-sm">
        <div className="grid gap-5 md:grid-cols-2">
          <section className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
              Input
            </h4>
            {suite.fields ? (
              <FieldValues fields={suite.fields.input} values={c.input} />
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
              <FieldValues fields={suite.fields.label} values={answer.value} />
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
                  <li key={model}>
                    <span
                      className={
                        output.error
                          ? "text-bad"
                          : failed.length
                            ? "text-warn"
                            : "text-good"
                      }
                    >
                      {output.error
                        ? "No answer"
                        : failed.length
                          ? "Wrong"
                          : "Right"}
                    </span>{" "}
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
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <div className="flex flex-wrap items-start gap-2">
          {answer?.status === "PENDING" && (
            <form action={confirmAnswer}>
              <input type="hidden" name="suite" value={suite.key} />
              <input type="hidden" name="label" value={answer.id} />
              <Submit>Confirm this answer</Submit>
            </form>
          )}
          <form action={retireCase}>
            <input type="hidden" name="suite" value={suite.key} />
            <input type="hidden" name="case" value={c.id} />
            <Submit variant="quiet">Retire case</Submit>
          </form>
        </div>

        {suite.fields && suite.labelFromForm && (
          <details className="rounded-md bg-card p-3">
            <summary className="cursor-pointer list-none text-sm font-medium">
              Edit answer
            </summary>
            <form
              key={answer?.updatedAt.toISOString() ?? "none"}
              action={editAnswer}
              className="mt-3 space-y-4"
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
          </details>
        )}
      </div>
    </details>
  );
}
