import Link from "next/link";
import {
  attention,
  perAnswer,
  seconds,
  suiteHealth,
  thumbsSummary,
  type GlossaryTerm,
} from "evalkeeper";
import { Card, StatusBadge, pct } from "@/components/evalkeeper/ui";
import {
  feedbackStore,
  MODELS,
  requireAdmin,
  runner,
  SUITES,
} from "@/lib/evalkeeper";
import { daysAgo } from "@/lib/evalkeeper/time";
import { loadWeekly } from "@/lib/evalkeeper/weekly";
import { WeeklyCheck } from "@/components/evalkeeper/WeeklyCheck";
import { InfoTip } from "@/components/evalkeeper/Tip";
import { evalsPath } from "@/lib/evalkeeper/paths";

export const dynamic = "force-dynamic";

/** The evals hub: where each suite stands, and what needs attention. */
export default async function EvalsHub() {
  await requireAdmin();
  const [boards, weekly] = await Promise.all([
    Promise.all(SUITES.map((s) => runner.board(s.key))),
    loadWeekly(),
  ]);
  const thumbs = thumbsSummary(await feedbackStore.listFeedback(), daysAgo(7));
  const down = thumbs.reduce((t, s) => t + s.down, 0);
  const waiting = thumbs.reduce((t, s) => t + s.open, 0);
  const flagged = thumbs.filter((s) => s.alert).length;
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          title="Most room to improve"
          term="improve"
          value={needs.improve ? pct(needs.improve.best) : "—"}
          detail={
            !needs.improve
              ? "Test a suite to see"
              : needs.improve.best >= 1
                ? "Every suite has a model scoring 100%"
                : `${needs.improve.label}, best on ${needs.improve.model}`
          }
        />
        <Stat
          title="Slowest live model"
          term="slowest"
          value={needs.slowest ? seconds(needs.slowest.ms) : "—"}
          detail={
            needs.slowest
              ? `${needs.slowest.label} on ${needs.slowest.model}`
              : "—"
          }
        />
        <Stat
          title="Costliest live model"
          term="costliest"
          value={needs.costliest ? perAnswer(needs.costliest.usd) : "—"}
          detail={
            needs.costliest
              ? `${needs.costliest.label} on ${needs.costliest.model}`
              : "—"
          }
        />
        <Link href={evalsPath("feedback")}>
          <Stat
            title="Thumbs down this week"
            term="thumbs"
            value={String(down)}
            detail={
              flagged
                ? `${flagged} feature${flagged === 1 ? "" : "s"} need a look · ${waiting} waiting`
                : `${waiting} waiting for a look`
            }
          />
        </Link>
      </div>

      <WeeklyCheck weekly={weekly} />

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
            <Link key={b.suite.key} href={evalsPath(b.suite.key)}>
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
  term,
  value,
  detail,
}: {
  title: string;
  term: GlossaryTerm;
  value: string;
  detail: string;
}) {
  return (
    <Card className="space-y-1">
      <p className="text-sm text-muted">
        {title}
        <InfoTip term={term} />
      </p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-sm text-muted">{detail}</p>
    </Card>
  );
}
