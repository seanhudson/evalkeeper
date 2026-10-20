import Link from "next/link";
import {
  attention,
  perAnswer,
  seconds,
  suiteHealth,
  thumbsSummary,
  type GlossaryTerm,
  type HistoryEntry,
  type Settings,
  type SettingsVersion,
} from "@crowandraven/evalkeeper";
import { Card, StatusBadge, pct } from "@/components/evalkeeper/ui";
import {
  feedbackStore,
  MODELS,
  requireAdmin,
  runner,
  settings,
  SUITES,
} from "@/lib/evalkeeper";
import { daysAgo } from "@/lib/evalkeeper/time";
import { loadWeekly } from "@/lib/evalkeeper/weekly";
import { WeeklyCheck } from "@/components/evalkeeper/WeeklyCheck";
import { InfoTip } from "@/components/evalkeeper/Tip";
import { evalsPath } from "@/lib/evalkeeper/paths";
import { HistoryEntries } from "@/components/evalkeeper/SettingsHistory";
import { ChevronDown } from "lucide-react";

export const dynamic = "force-dynamic";

/** The evals hub: where each suite stands, and what needs attention. */
export default async function EvalsHub() {
  await requireAdmin();
  const [boards, weekly] = await Promise.all([
    Promise.all(SUITES.map((s) => runner.board(s.key))),
    loadWeekly(),
  ]);
  const histories = await Promise.all(
    SUITES.map((s) =>
      Promise.all([
        settings.history(s.operation),
        settings.current(s.operation),
      ]),
    ),
  );
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

      <section aria-labelledby="suites" className="space-y-3">
        <h2 id="suites" className="text-lg font-semibold">
          Suites
          <InfoTip term="suites" />
        </h2>
        <div className="space-y-4">
          {boards.map((b, i) => {
            const h = suiteHealth(
              b.rows,
              b.suite.checks,
              b.suite.priority,
              b.cases,
              b.provisional,
              MODELS,
            );
            const [history, current] = histories[i] ?? [[], null];
            return (
              <SuiteCard
                key={b.suite.key}
                board={b}
                health={h}
                history={history}
                current={current}
              />
            );
          })}
        </div>
      </section>
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

type Board = Awaited<ReturnType<typeof runner.board>>;

const label = (model: string) => MODELS[model]?.label ?? model;
const day = (d: Date) => d.toLocaleDateString();
/** Green at 95% and up, amber from 80%, red below. */
const scoreTone = (rate: number) =>
  rate >= 0.95 ? "text-good" : rate >= 0.8 ? "text-warn" : "text-bad";

/**
 * One feature on the hub: its live version and models, what the live
 * model costs and how fast it is, its latest test, what needs a look, and
 * its settings history.
 */
function SuiteCard({
  board: b,
  health: h,
  history,
  current,
}: {
  board: Board;
  health: ReturnType<typeof suiteHealth>;
  history: HistoryEntry[];
  current: { settings: Settings; version: SettingsVersion | null } | null;
}) {
  const live = b.rows.find((r) => r.live && !r.variant);
  const t = live?.test;
  const version = current?.version ?? null;
  const since = version
    ? (history.find((e) => e.to.id === version.id)?.createdAt ??
      version.createdAt)
    : null;
  const s = current?.settings;
  const price = s ? MODELS[s.model] : undefined;
  const versions = Math.max(1, ...history.map((e) => e.to.number));
  return (
    <Card className="relative space-y-4 transition-colors hover:border-muted">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold">
              {/* Covers the whole card; the versions toggle sits above it. */}
              <Link
                href={evalsPath(b.suite.key)}
                className="after:absolute after:inset-0 after:rounded-lg"
              >
                {b.suite.label}
              </Link>
            </h2>
            <StatusBadge status={h.status} />
          </div>
          <p className="readable text-sm text-muted">{b.suite.description}</p>
        </div>
        {t && (
          <div className="shrink-0 space-y-0.5 text-right text-sm">
            <p className="font-semibold tabular-nums">
              {perAnswer(t.costPerAnswer)} / answer
            </p>
            <p className="text-xs text-muted">{seconds(t.avgMs)} avg</p>
            {price?.inputPer1M !== undefined &&
              price.outputPer1M !== undefined && (
                <p className="text-xs text-muted">
                  ${price.inputPer1M} / ${price.outputPer1M} per 1M
                </p>
              )}
          </div>
        )}
      </div>

      {s && (
        <div className="space-y-0.5 text-sm">
          <p>
            <span className="font-medium">v{version?.number ?? 1}</span>{" "}
            <span className="text-muted">
              · {since ? `live since ${day(since)}` : "defaults from code"}
            </span>
          </p>
          <p className="text-xs text-muted">
            {label(s.model)}
            {s.fallbackModel
              ? ` · fallback ${label(s.fallbackModel)}`
              : " · no fallback"}
            {s.reasoningEffort ? ` · reasoning ${s.reasoningEffort}` : ""}
          </p>
        </div>
      )}

      <p className="text-sm">
        {t ? (
          <>
            Score{" "}
            <span className={`font-semibold ${scoreTone(t.right / t.total)}`}>
              {pct(t.right / t.total)}
            </span>
          </>
        ) : (
          "Live model not tested yet"
        )}{" "}
        · {b.cases} cases · {h.testedModels} models tested ·{" "}
        <Link
          href={evalsPath(b.suite.key)}
          className="relative text-accent hover:underline"
        >
          Compare models
        </Link>
      </p>

      {h.details.length > 0 && (
        <ul className="readable list-disc space-y-1 pl-5 text-sm text-muted">
          {h.details.slice(0, 3).map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      )}

      {s && (
        <details className="group/history relative rounded-md bg-tint">
          <summary className="flex list-none items-center justify-between gap-2 p-3 text-sm font-medium">
            Versions
            <span className="flex items-center gap-1 text-xs font-normal text-muted">
              {versions} version{versions === 1 ? "" : "s"}
              <ChevronDown
                aria-hidden
                className="h-4 w-4 transition-transform group-open/history:rotate-180"
              />
            </span>
          </summary>
          <div className="px-3 pb-3">
            <HistoryEntries
              suite={b.suite.key}
              entries={history}
              liveId={version?.id ?? null}
              label={label}
              defaults={s}
              plain
            />
          </div>
        </details>
      )}
    </Card>
  );
}
