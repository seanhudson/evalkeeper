import { evalsPath, type EvalAppConfig } from "./app.js";
import { Link, LocalDate } from "./pieces.js";
import { allPassed, money, summarize } from "../index.js";
import { FieldValues } from "./Fields.js";
import { ReadableOutput } from "./ReadableOutput.js";
import { BackLink, Card } from "./pieces.js";
import { pct, LINK } from "./format.js";

/** One test: every answer, with what each check found. */

/** One test: every answer, with what each check found. Null when it doesn't exist. */
export async function RunView({
  app,
  suite: key,
  runId,
}: {
  /** Your screens' configuration. */
  app: EvalAppConfig;
  suite: string;
  runId: string;
}) {
  const run = await app.store.getRun(runId);
  if (!run || run.suite !== key) return null;
  const suite = app.runner.suiteOrThrow(key);
  const [outputs, cases] = await Promise.all([
    app.store.listOutputs(runId),
    app.store.listCases(key).then((cs) => new Map(cs.map((c) => [c.id, c]))),
  ]);
  const titleOf = (caseId: string) => {
    const c = cases.get(caseId);
    return c ? suite.title(suite.input.parse(c.input)) : "A retired case";
  };
  const metrics = run.metrics;
  const summary = metrics ? summarize(metrics, suite.checks) : null;
  // Answers that never came back first, then wrong ones, then right ones,
  // so what needs a look is at the top.
  const rank = (o: (typeof outputs)[number]) =>
    o.error ? 0 : allPassed(o.scores ?? null) ? 2 : 1;
  const ordered = [...outputs].sort((a, b) => rank(a) - rank(b));
  const failed = outputs.filter((o) => o.error);
  // Why they failed, counted: "timed out after 60s (3)".
  const reasons = [
    ...failed
      .reduce((m, o) => {
        const why = (o.error ?? "").split("\n")[0]?.slice(0, 120) ?? "";
        return m.set(why, (m.get(why) ?? 0) + 1);
      }, new Map<string, number>())
      .entries(),
  ];
  const label = (k: string) =>
    suite.checks.find((c) => c.key === k)?.label ?? k;
  type Check = {
    key: string;
    pass: boolean | null;
    note?: string;
    given?: string;
    matches?: { expected: string; actual: string; why: string }[];
  };

  return (
    <div className="space-y-6">
      <BackLink href={evalsPath(app, key)}>{suite.label}</BackLink>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">
          {app.models[run.model]?.label ?? run.model} on {suite.label}
        </h1>
        <p className="text-sm text-muted">
          <LocalDate date={run.startedAt} time /> · {run.status.toLowerCase()}
          {metrics && ` · spent ${money(metrics.costUsd)}`}
        </p>
        {run.error && <p className="readable text-bad">{run.error}</p>}
      </div>
      {summary && (
        <Card className="space-y-2">
          <p className="text-lg">
            {summary.right} of {summary.total} answers fully right (
            {pct(summary.total ? summary.right / summary.total : 0)})
          </p>
          <p className="readable text-sm text-muted">{summary.trust}</p>
          {failed.length > 0 && (
            <p className="readable text-sm text-bad">
              {failed.length} {failed.length === 1 ? "answer" : "answers"}{" "}
              didn&apos;t come back:{" "}
              {reasons.map(([why, n]) => `${why} (${n})`).join("; ")}.{" "}
              <a href="#failed" className={LINK}>
                See {failed.length === 1 ? "it" : "them"}
              </a>
            </p>
          )}
          {summary.problems.length > 0 && (
            <ul className="readable list-disc pl-5 text-sm">
              {summary.problems.map((p) => (
                <li key={p.key}>
                  {p.label}: failed {p.failed} of {p.of}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
      <Card className="space-y-3">
        {ordered.map((o, i) => {
          const checks = (o.scores as Check[] | null) ?? null;
          const ok = allPassed(checks);
          return (
            <div
              key={o.id}
              // The summary's "See them" lands on the first failed answer.
              id={o.error && i === 0 ? "failed" : undefined}
              className="scroll-mt-4 rounded-md bg-tint p-3 text-sm"
            >
              <div className="flex justify-between gap-4">
                <span className="font-medium">{titleOf(o.caseId)}</span>
                <span
                  className={
                    o.error ? "text-bad" : ok ? "text-good" : "text-warn"
                  }
                >
                  {o.error ? "No answer" : ok ? "Right" : "Wrong"}
                </span>
              </div>
              {o.error && <p className="text-bad">{o.error}</p>}
              {!o.error && o.output !== null && (
                <div className="mt-2">
                  {suite.fields && suite.labelFromOutput ? (
                    <FieldValues
                      fields={suite.fields.label}
                      values={suite.labelFromOutput(o.output)}
                      prefix={`${o.id}-`}
                    />
                  ) : (
                    <ReadableOutput value={o.output} />
                  )}
                </div>
              )}
              {suite.decisions &&
                checks?.some((c) => c.given !== undefined) && (
                  <ul className="mt-2 space-y-0.5 text-xs">
                    {checks
                      .filter((c) => c.given !== undefined)
                      .map((c) => (
                        <li key={c.key}>
                          <span className="text-muted">{label(c.key)}:</span>{" "}
                          {c.given}{" "}
                          <span className={c.pass ? "text-good" : "text-warn"}>
                            {c.pass ? "right" : "wrong"}
                          </span>
                        </li>
                      ))}
                  </ul>
                )}
              {checks
                ?.filter((c) => c.pass === false)
                .map((c) => (
                  <p key={c.key} className="readable mt-2 text-muted">
                    {label(c.key)}: {c.note ?? "failed"}
                  </p>
                ))}
              {checks
                ?.flatMap((c) => c.matches ?? [])
                .slice(0, 20)
                .map((m, i) => (
                  <p key={i} className="readable mt-1 text-xs text-muted">
                    Matched “{m.expected}” with “{m.actual}”: {m.why}
                  </p>
                ))}
              {cases.has(o.caseId) && (
                <Link
                  href={`${evalsPath(app, key)}#case-${o.caseId}`}
                  className={`mt-2 inline-block text-xs ${LINK}`}
                >
                  Find the case in the answer key
                </Link>
              )}
            </div>
          );
        })}
      </Card>
    </div>
  );
}
