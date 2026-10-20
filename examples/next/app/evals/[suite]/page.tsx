import Link from "next/link";
import { notFound } from "next/navigation";
import {
  FAVOR_TEXT,
  checkBar,
  perAnswer,
  retiresLabel,
  seconds,
  seriousMistakes,
  suggest,
} from "evalkeeper";
import { AnswerKey } from "@/components/evalkeeper/AnswerKey";
import { RefreshWhile } from "@/components/evalkeeper/RefreshWhile";
import { Spinner, Submit } from "@/components/evalkeeper/Submit";
import { Card, Chip, Score, pct } from "@/components/evalkeeper/ui";
import { runner } from "@/lib/evalkeeper";
import { MODELS } from "@/lib/models";
import { SUITE_BY_KEY } from "@/lib/suites";
import { makeFallback, makeLive, rescore, testAll, testModel } from "./actions";
import { InfoTip, Tip } from "@/components/evalkeeper/Tip";

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
          <InfoTip term="priority" />
        </p>
      </div>

      {s && !s.same && (
        <Card className="space-y-3">
          <h2 className="font-semibold">
            Suggested
            <InfoTip term="suggestion" />
          </h2>
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
                <th className="p-3 font-normal">
                  Score
                  <InfoTip term="score" side="bottom" />
                </th>
                <th className="p-3 font-normal">
                  Serious mistakes
                  <InfoTip term="seriousMistakes" side="bottom" />
                </th>
                <th className="p-3 font-normal">
                  Time
                  <InfoTip term="time" side="bottom" align="end" />
                </th>
                <th className="p-3 font-normal">
                  Cost
                  <InfoTip term="cost" side="bottom" align="end" />
                </th>
                <th className="p-3 font-normal">
                  Against live
                  <InfoTip term="againstLive" side="bottom" align="end" />
                </th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-b border-line last:border-0">
                  <td className="p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={r.live ? "font-semibold" : "font-medium"}
                      >
                        {r.label}
                      </span>
                      {r.live && (
                        <Tip term="live" side="bottom" id={`live-${r.key}`}>
                          <Chip tone="live">Live</Chip>
                        </Tip>
                      )}
                      {r.fallback && (
                        <Tip
                          term="fallback"
                          side="bottom"
                          id={`fallback-${r.key}`}
                        >
                          <Chip tone="fallback">Fallback</Chip>
                        </Tip>
                      )}
                      {retiresLabel(MODELS, r.model) && (
                        <Tip
                          term="retiring"
                          side="bottom"
                          id={`retiring-${r.key}`}
                        >
                          <Chip tone="warn">
                            Retires {retiresLabel(MODELS, r.model)}
                          </Chip>
                        </Tip>
                      )}
                      {r.test?.stale && (
                        <Tip
                          term="outOfDate"
                          side="bottom"
                          id={`stale-${r.key}`}
                        >
                          <Chip tone="neutral">Out of date</Chip>
                        </Tip>
                      )}
                    </div>
                  </td>
                  <td className="p-3">
                    {r.testing ? (
                      <span
                        role="status"
                        title="Testing"
                        className="inline-flex text-accent"
                      >
                        <Spinner />
                      </span>
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
                  <span className="flex items-center gap-2 text-sm text-muted">
                    <Tip term={c.severity} id={`severity-${c.key}`}>
                      <Chip
                        tone={c.severity === "serious" ? "serious" : "neutral"}
                      >
                        {c.severity}
                      </Chip>
                    </Tip>
                    <Tip term="bar" id={`bar-${c.key}`}>
                      <span>bar {pct(checkBar(c))}</span>
                    </Tip>
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
            Answer key ({b.cases} cases in use)
          </h2>
          <form action={rescore} className="flex items-center gap-1">
            <input type="hidden" name="suite" value={key} />
            <Submit variant="quiet">Rescore tests</Submit>
            <InfoTip term="rescore" />
          </form>
        </div>
        <p className="readable text-sm text-muted">
          Tests grade against confirmed answers only. A model can draft answers,
          but they stay pending until a person confirms them. Open a case to see
          how each model did on it.
        </p>
        <AnswerKey suite={suite} rows={rows} />
      </section>
    </div>
  );
}
