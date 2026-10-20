import Link from "next/link";
import { attention, perAnswer, seconds, suiteHealth } from "evalkeeper";
import { Card, StatusBadge, pct } from "@/components/evalkeeper/ui";
import { runner } from "@/lib/evalkeeper";
import { MODELS } from "@/lib/models";
import { SUITES } from "@/lib/suites";

export const dynamic = "force-dynamic";

/** The evals hub: where each suite stands, and what needs attention. */
export default async function EvalsHub() {
  const boards = await Promise.all(SUITES.map((s) => runner.board(s.key)));
  const needs = attention(
    boards.map((b) => ({
      key: b.suite.key,
      label: b.suite.label,
      rows: b.rows,
      toReview: b.provisional,
    })),
  );
  return (
    <div className="space-y-8">
      <div className="readable space-y-2">
        <h1 className="text-2xl font-semibold">Evals</h1>
        <p className="text-muted">
          Each suite tests one AI feature against answers people confirmed. Test
          models on it, then pick the live one on evidence.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          title="Most room to improve"
          value={needs.improve ? pct(needs.improve.best) : "—"}
          detail={
            needs.improve
              ? `${needs.improve.label}, best on ${needs.improve.model}`
              : "Test a suite to see"
          }
        />
        <Stat
          title="Slowest live model"
          value={needs.slowest ? seconds(needs.slowest.ms) : "—"}
          detail={
            needs.slowest
              ? `${needs.slowest.label} on ${needs.slowest.model}`
              : "—"
          }
        />
        <Stat
          title="Costliest live model"
          value={needs.costliest ? perAnswer(needs.costliest.usd) : "—"}
          detail={
            needs.costliest
              ? `${needs.costliest.label} on ${needs.costliest.model}`
              : "—"
          }
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {boards.map((b) => {
          const h = suiteHealth(
            b.rows,
            b.suite.checks,
            b.suite.priority,
            b.cases,
            b.provisional,
            MODELS,
          );
          return (
            <Link key={b.suite.key} href={`/evals/${b.suite.key}`}>
              <Card className="h-full space-y-3 hover:bg-tint">
                <div className="flex items-start justify-between gap-4">
                  <h2 className="font-semibold">{b.suite.label}</h2>
                  <StatusBadge status={h.status} />
                </div>
                <p className="readable text-sm text-muted">
                  {b.suite.description}
                </p>
                <p className="text-sm">
                  {h.live
                    ? `${h.live.label} live at ${pct(h.live.rate)}`
                    : "Live model not tested yet"}{" "}
                  · {b.cases} cases · {h.testedModels} models tested
                </p>
                {h.details.length > 0 && (
                  <ul className="readable list-disc space-y-1 pl-5 text-sm text-muted">
                    {h.details.slice(0, 3).map((d) => (
                      <li key={d}>{d}</li>
                    ))}
                  </ul>
                )}
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function Stat({
  title,
  value,
  detail,
}: {
  title: string;
  value: string;
  detail: string;
}) {
  return (
    <Card className="space-y-1">
      <p className="text-sm text-muted">{title}</p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-sm text-muted">{detail}</p>
    </Card>
  );
}
