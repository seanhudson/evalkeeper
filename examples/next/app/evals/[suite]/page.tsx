import Link from "next/link";
import { notFound } from "next/navigation";
import {
  FAVOR_TEXT,
  checkBar,
  confirmedLabel,
  perAnswer,
  seconds,
  seriousMistakes,
  suggest,
} from "evalkeeper";
import { RefreshWhile } from "@/components/evalkeeper/RefreshWhile";
import { Submit } from "@/components/evalkeeper/Submit";
import { Card, Score, pct } from "@/components/evalkeeper/ui";
import { prisma } from "@/lib/db";
import { runner } from "@/lib/evalkeeper";
import { MODELS } from "@/lib/models";
import { SUITE_BY_KEY } from "@/lib/suites";
import {
  confirmAnswer,
  makeFallback,
  makeLive,
  rescore,
  testAll,
  testModel,
} from "./actions";

export const dynamic = "force-dynamic";

const VS: Record<string, string> = {
  BETTER: "More accurate",
  SAME: "About as accurate",
  WORSE: "Less accurate",
  TOO_FEW: "Too few cases to tell",
};

export default async function SuitePage({
  params,
}: {
  params: Promise<{ suite: string }>;
}) {
  const { suite: key } = await params;
  if (!SUITE_BY_KEY[key]) notFound();
  const b = await runner.board(key);
  const { suite, rows } = b;
  const s = suggest(rows, suite.checks, suite.priority, MODELS);
  const testing = rows.some((r) => r.testing);
  const live = rows.find((r) => r.live);
  const cases = await prisma.evalCase.findMany({
    where: { suite: key, status: { not: "RETIRED" } },
    include: { labels: true },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="space-y-8">
      <RefreshWhile active={testing} />
      <div className="space-y-2">
        <Link href="/evals" className="text-sm text-muted">
          ← Evals
        </Link>
        <h1 className="text-2xl font-semibold">{suite.label}</h1>
        <p className="readable text-muted">{suite.description}</p>
        <p className="readable text-sm text-muted">
          Priority: {FAVOR_TEXT[suite.priority.favor]}.
        </p>
      </div>

      {s && !s.same && (
        <Card className="space-y-3">
          <h2 className="font-semibold">Suggested</h2>
          <p>
            Live: <strong>{s.live.label}</strong>
            {s.fallback && (
              <>
                {" "}
                · Fallback: <strong>{s.fallback.label}</strong>
              </>
            )}
          </p>
          <ul className="readable list-disc space-y-1 pl-5 text-sm text-muted">
            {s.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </Card>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">Models</h2>
          <form action={testAll}>
            <input type="hidden" name="suite" value={key} />
            <Submit variant="quiet">Test every model</Submit>
          </form>
        </div>
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="text-left text-muted">
              <tr className="border-b border-line">
                <th className="p-3 font-normal">Model</th>
                <th className="p-3 font-normal">Score</th>
                <th className="p-3 font-normal">Serious mistakes</th>
                <th className="p-3 font-normal">Time</th>
                <th className="p-3 font-normal">Cost</th>
                <th className="p-3 font-normal">Against live</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-b border-line last:border-0">
                  <td className="p-3">
                    <div className="font-medium">{r.label}</div>
                    <div className="text-xs text-muted">
                      {[
                        r.live && "Live",
                        r.fallback && "Fallback",
                        MODELS[r.model]?.retiring && "Retiring",
                        r.test?.stale && "Out of date",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </td>
                  <td className="p-3">
                    {r.testing ? (
                      <span className="text-muted">Testing…</span>
                    ) : r.test ? (
                      <Link href={`/evals/${key}/runs/${r.test.runId}`}>
                        <Score right={r.test.right} total={r.test.total} />
                      </Link>
                    ) : (
                      <span className="text-muted">
                        {r.failed ?? "Not tested"}
                      </span>
                    )}
                  </td>
                  <td className="p-3 tabular-nums">
                    {r.test ? seriousMistakes(r, suite.checks) : "—"}
                  </td>
                  <td className="p-3 tabular-nums">
                    {r.test ? seconds(r.test.avgMs) : "—"}
                  </td>
                  <td className="p-3 tabular-nums">
                    {r.test ? perAnswer(r.test.costPerAnswer) : "—"}
                  </td>
                  <td className="p-3">{r.vsLive ? VS[r.vsLive] : "—"}</td>
                  <td className="p-3">
                    <div className="flex justify-end gap-2">
                      <form action={testModel}>
                        <input type="hidden" name="suite" value={key} />
                        <input type="hidden" name="model" value={r.model} />
                        <Submit variant="quiet">Test</Submit>
                      </form>
                      {!r.live && r.canMakeLive && (
                        <form action={makeLive}>
                          <input type="hidden" name="suite" value={key} />
                          <input type="hidden" name="model" value={r.model} />
                          <Submit variant="quiet">Make live</Submit>
                        </form>
                      )}
                      {r.canMakeFallback && (
                        <form action={makeFallback}>
                          <input type="hidden" name="suite" value={key} />
                          <input type="hidden" name="model" value={r.model} />
                          <Submit variant="quiet">Make fallback</Submit>
                        </form>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Checks</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {suite.checks.map((c) => {
            const rate = live?.test?.byCheck[c.key];
            return (
              <Card key={c.key} className="space-y-1">
                <div className="flex justify-between gap-4">
                  <h3 className="font-medium">{c.label}</h3>
                  <span className="text-sm text-muted">
                    {c.severity} · bar {pct(checkBar(c))}
                  </span>
                </div>
                <p className="readable text-sm text-muted">{c.description}</p>
                {rate && rate.n > 0 && (
                  <p className="text-sm">
                    Live: {pct(rate.passed / rate.n)} ({rate.passed}/{rate.n})
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">
            Answer key ({cases.length} cases)
          </h2>
          <form action={rescore}>
            <input type="hidden" name="suite" value={key} />
            <Submit variant="quiet">Rescore tests</Submit>
          </form>
        </div>
        <p className="readable text-sm text-muted">
          Tests grade against confirmed answers only. A model can draft answers,
          but they stay pending until a person confirms them.
        </p>
        <Card className="space-y-4">
          {cases.map((c) => {
            const used = confirmedLabel(
              c.labels.map((l) => ({
                ...l,
                kind: "EXPECTED" as const,
                status: l.status as never,
              })),
            );
            const pending = c.labels.find((l) => l.status === "PENDING");
            const result = b.caseResults[c.id];
            return (
              <div key={c.id} className="rounded-md bg-tint p-3 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">
                    {suite.title(suite.input.parse(c.input))}
                  </span>
                  <span className="text-xs text-muted">
                    {c.split}
                    {result &&
                      ` · right on ${result.passed} of ${result.models} models`}
                  </span>
                </div>
                <pre className="mt-1 whitespace-pre-wrap font-mono text-xs text-muted">
                  {JSON.stringify(used?.value ?? pending?.value ?? null)}
                </pre>
                {!used && pending && (
                  <form action={confirmAnswer} className="mt-2">
                    <input type="hidden" name="suite" value={key} />
                    <input type="hidden" name="label" value={pending.id} />
                    <Submit variant="quiet">Confirm this answer</Submit>
                  </form>
                )}
              </div>
            );
          })}
        </Card>
      </section>
    </div>
  );
}
