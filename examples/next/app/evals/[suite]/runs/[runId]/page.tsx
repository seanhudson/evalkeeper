import Link from "next/link";
import { notFound } from "next/navigation";
import { allPassed, money, summarize } from "evalkeeper";
import { Card, pct } from "@/components/evalkeeper/ui";
import { MODELS, requireAdmin, runner, store } from "@/lib/evalkeeper";
import { evalsPath } from "@/lib/evalkeeper/paths";

export const dynamic = "force-dynamic";

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
  type Check = { key: string; pass: boolean | null; note?: string };

  return (
    <div className="space-y-6">
      <Link href={evalsPath(key)} className="text-sm text-muted">
        ← {suite.label}
      </Link>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">
          {MODELS[run.model]?.label ?? run.model} on {suite.label}
        </h1>
        <p className="text-sm text-muted">
          {run.startedAt.toLocaleString()} · {run.status.toLowerCase()}
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
              {checks
                ?.filter((c) => c.pass === false)
                .map((c) => (
                  <p key={c.key} className="readable text-muted">
                    {label(c.key)}: {c.note ?? "failed"}
                  </p>
                ))}
            </div>
          );
        })}
      </Card>
    </div>
  );
}
