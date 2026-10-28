import Link from "next/link";
import { notFound } from "next/navigation";
import { allPassed, money, summarize } from "@crowandraven/evalkeeper";
import type { Metadata } from "next";
import { FieldValues } from "@crowandraven/evalkeeper/react";
import { ReadableOutput } from "@crowandraven/evalkeeper/react";
import { BackLink, Card, pct } from "@crowandraven/evalkeeper/react";
import {
  MODELS,
  requireAdmin,
  runner,
  store,
  SUITE_BY_KEY,
} from "@/lib/evalkeeper";
import { evalsPath } from "@/lib/evalkeeper/paths";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ suite: string }>;
}): Promise<Metadata> {
  const { suite } = await params;
  return { title: `Test: ${SUITE_BY_KEY[suite]?.label ?? "Evals"}` };
}

/** One test: every answer, with what each check found. */
export default async function RunPage({
  params,
}: {
  params: Promise<{ suite: string; runId: string }>;
}) {
  await requireAdmin();
  const { suite: key, runId } = await params;
  const run = await store.getRun(runId);
  if (!run || run.suite !== key) notFound();
  const suite = runner.suiteOrThrow(key);
  const [outputs, cases] = await Promise.all([
    store.listOutputs(runId),
    store.listCases(key).then((cs) => new Map(cs.map((c) => [c.id, c]))),
  ]);
  const titleOf = (caseId: string) => {
    const c = cases.get(caseId);
    return c ? suite.title(suite.input.parse(c.input)) : "A retired case";
  };
  const metrics = run.metrics;
  const summary = metrics ? summarize(metrics, suite.checks) : null;
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
      <BackLink href={evalsPath(key)}>{suite.label}</BackLink>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">
          {MODELS[run.model]?.label ?? run.model} on {suite.label}
        </h1>
        <p className="text-sm text-muted">
          {run.startedAt.toLocaleString()} · {run.status.toLowerCase()}
          {metrics && ` · spent ${money(metrics.costUsd)}`}
          {run.status === "SUCCEEDED" && (
            <>
              {" · "}
              <Link
                href={`${evalsPath(key, "compare")}?${new URLSearchParams({ b: runId })}`}
                className="hover:text-ink"
              >
                Compare with another test
              </Link>
            </>
          )}
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
        {outputs.map((o) => {
          const checks = (o.scores as Check[] | null) ?? null;
          const ok = allPassed(checks);
          return (
            <div key={o.id} className="rounded-md bg-tint p-3 text-sm">
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
                  href={`${evalsPath(key)}#case-${o.caseId}`}
                  className="mt-2 inline-block text-xs text-accent hover:underline"
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
