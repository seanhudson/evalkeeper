import {
  attacksFrom,
  attention,
  isInjectionSuite,
  perAnswer,
  seconds,
  suiteHealth,
  thumbsSummary,
  type GlossaryTerm,
  type HistoryEntry,
  type Settings,
  type SettingsVersion,
} from "../index.js";
import { Link, Card, InfoTip, StatusBadge } from "./pieces.js";
import { pct, dayOf } from "./format.js";
import { HistoryEntries } from "./SettingsHistory.js";
import {
  daysAgo,
  evalsPath,
  loadWeekly,
  type EvalAppConfig,
  attacksResisted,
} from "./app.js";
import type { Runner } from "../runner.js";
import { ChevronDown } from "lucide-react";
import { WeeklyCheck } from "./WeeklyCheck.js";

/**
 * Everything the evals hub shows, loaded together. Sections read from
 * this, so a hub of your own loads the same data once.
 */
export async function loadHub(app: EvalAppConfig) {
  const [boards, weekly] = await Promise.all([
    Promise.all(app.suites.map((s) => app.runner.board(s.key))),
    loadWeekly(app),
  ]);
  const histories = await Promise.all(
    app.suites.map((s) =>
      Promise.all([
        app.settings.history(s.operation),
        app.settings.current(s.operation),
      ]),
    ),
  );
  const thumbs = thumbsSummary(
    await app.feedbackStore.listFeedback(),
    daysAgo(7),
  );
  const down = thumbs.reduce((t, s) => t + s.down, 0);
  const waiting = thumbs.reduce((t, s) => t + s.open, 0);
  const flagged = thumbs.filter((s) => s.alert).length;
  // An injection suite shows on its base suite's card, not its own.
  const attacksOn = (key: string) =>
    boards.filter((x) => isInjectionSuite(x.suite) && x.suite.base.key === key);
  const cards = boards
    .map((b, i) => ({ b, i }))
    .filter(({ b }) => !isInjectionSuite(b.suite));
  const needs = attention(
    cards.map(({ b }) => ({
      key: b.suite.key,
      label: b.suite.label,
      rows: b.rows,
      toReview: b.provisional,
    })),
  );
  return {
    app,
    boards,
    weekly,
    histories,
    thumbs,
    down,
    waiting,
    flagged,
    attacksOn,
    cards,
    needs,
  };
}

/** What `loadHub` returns, for sections and custom pages. */
export type HubData = Awaited<ReturnType<typeof loadHub>>;

/** What the evals hub is for. */
export function HubIntro() {
  return (
    <>
      <div className="readable space-y-2">
        <h1 className="text-2xl font-semibold">Evals</h1>
        <p className="text-muted">
          Each suite tests one AI feature against answers people confirmed. Test
          models on it, then pick the live one on evidence.
        </p>
      </div>
    </>
  );
}

/** Where the features stand: most room to improve, the slowest and costliest live models, and thumbs down this week. */
export function HubStats({ data }: { data: HubData }) {
  const { app, down, waiting, flagged, needs } = data;
  return (
    <>
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
        <Link href={evalsPath(app, "feedback")}>
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
    </>
  );
}

/** One card per feature, with an injection suite's results on its base feature's card. */
export function SuiteList({ data }: { data: HubData }) {
  const { app, histories, attacksOn, cards } = data;
  return (
    <>
      <section aria-labelledby="suites" className="space-y-3">
        <h2 id="suites" className="text-lg font-semibold">
          Suites
          <InfoTip term="suites" />
        </h2>
        {cards.length === 0 && <NoSuites />}
        <div className="space-y-4">
          {cards.map(({ b, i }) => {
            const attacked = attacksOn(b.suite.key);
            const h = suiteHealth(
              b.rows,
              b.suite.checks,
              b.suite.priority,
              b.cases,
              b.provisional,
              app.models,
              { attacks: attacksFrom(attacked) },
            );
            const [history, current] = histories[i] ?? [[], null];
            return (
              <SuiteCard
                app={app}
                key={b.suite.key}
                board={b}
                attacked={attacked}
                health={h}
                history={history}
                current={current}
              />
            );
          })}
        </div>
      </section>
    </>
  );
}

/** Before the first suite: what a suite is, and how to add one. */
function NoSuites() {
  return (
    <Card className="readable space-y-3 text-sm">
      <p className="font-semibold">No suites yet</p>
      <p className="text-muted">
        A suite tests one AI feature: its cases, the answers a person confirms,
        and the checks that grade any model against them. To add one:
      </p>
      <ol className="list-decimal space-y-2 pl-4">
        <li>
          Write it: the input and answer shapes with zod, two or three checks,{" "}
          <code>run</code>, and <code>grade</code>.
        </li>
        <li>
          Add it to <code>app.suites</code> in{" "}
          <code>lib/evalkeeper/index.ts</code>, with its instructions hash.
        </li>
        <li>
          Add cases (here, or with <code>importCases</code> from files you
          have), confirm their answers, and test models.
        </li>
      </ol>
      <p className="text-muted">
        Step by step:{" "}
        <a
          href="https://seanhudson.github.io/evalkeeper/start/adding-to-your-app/#5-write-your-first-suite"
          target="_blank"
          rel="noreferrer"
          className="underline"
        >
          Write your first suite
        </a>
        .
      </p>
    </Card>
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

type Board = Awaited<ReturnType<Runner["board"]>>;

const day = dayOf;
/** Green at 95% and up, amber from 80%, red below. */
const scoreTone = (rate: number) =>
  rate >= 0.95 ? "text-good" : rate >= 0.8 ? "text-warn" : "text-bad";

/**
 * One feature on the hub: its live version and models, what the live
 * model costs and how fast it is, its latest test, how it does under
 * attack, what needs a look, and its settings history.
 */
function SuiteCard({
  app,
  board: b,
  attacked,
  health: h,
  history,
  current,
}: {
  app: EvalAppConfig;
  board: Board;
  /** The injection suites that attack this feature. */
  attacked: Board[];
  health: ReturnType<typeof suiteHealth>;
  history: HistoryEntry[];
  current: { settings: Settings; version: SettingsVersion | null } | null;
}) {
  const label = (model: string) => app.models[model]?.label ?? model;
  const live = b.rows.find((r) => r.live && !r.variant);
  const t = live?.test;
  const version = current?.version ?? null;
  const since = version
    ? (history.find((e) => e.to.id === version.id)?.createdAt ??
      version.createdAt)
    : null;
  const s = current?.settings;
  const price = s ? app.models[s.model] : undefined;
  const versions = Math.max(1, ...history.map((e) => e.to.number));
  return (
    <Card className="relative space-y-4 transition-colors hover:border-muted">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold">
              {/* Covers the whole card; the versions toggle sits above it. */}
              <Link
                href={evalsPath(app, b.suite.key)}
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

      {/* The models and how live does, read together. */}
      <div className="space-y-1">
        {s && (
          <p className="text-sm text-muted">
            <span className="font-semibold text-ink">{label(s.model)}</span>
            {s.fallbackModel ? (
              <>
                {" "}
                · fallback{" "}
                <span className="font-semibold text-ink">
                  {label(s.fallbackModel)}
                </span>
              </>
            ) : (
              " · no fallback"
            )}
            {s.reasoningEffort ? ` · reasoning ${s.reasoningEffort}` : ""}
          </p>
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
          · {b.cases} cases · {h.testedModels} models tested
        </p>
      </div>

      {h.details.length > 0 && (
        <ul className="readable list-disc space-y-1 pl-5 text-sm text-muted">
          {h.details.slice(0, 3).map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      )}

      {/* Once the feature has attack cases (a test makes them). */}
      {attacked
        .filter((a) => a.cases > 0)
        .map((a) => {
          const r = live ? attacksResisted(live.key, [a]) : null;
          return (
            <p key={a.suite.key} className="relative text-sm">
              Attacks resisted
              <InfoTip term="attacksResisted" />:{" "}
              {r === null ? (
                <span className="text-muted">not tested yet</span>
              ) : (
                <Link
                  href={evalsPath(app, a.suite.key)}
                  className={`font-semibold hover:underline ${scoreTone(r.resisted / r.of)}`}
                >
                  {pct(r.resisted / r.of)}
                </Link>
              )}{" "}
              of {a.cases} {a.cases === 1 ? "attack" : "attacks"}
            </p>
          );
        })}

      {s && (
        <details className="group/history relative rounded-md bg-tint">
          <summary className="flex list-none items-center justify-between gap-2 p-3 text-sm font-medium">
            Versions
            <span className="flex items-center gap-1 text-xs font-normal text-muted">
              <span className="font-medium text-ink">
                v{version?.number ?? 1}
              </span>{" "}
              {since ? `live since ${day(since)}` : "defaults from code"} ·{" "}
              {versions} version{versions === 1 ? "" : "s"}
              <ChevronDown
                aria-hidden
                className="h-4 w-4 transition-transform group-open/history:rotate-180"
              />
            </span>
          </summary>
          <div className="px-3 pb-3">
            <HistoryEntries
              app={app}
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

/**
 * The AI features no suite tests yet, from your app's `features`: where
 * an eval would tell you the most next. Shows nothing without them.
 */
export function NoEvalYet({ data }: { data: HubData }) {
  const { app } = data;
  const tested = new Set(app.suites.map((s) => s.operation));
  const gaps = (app.features ?? []).filter((f) => !tested.has(f.operation));
  if (!gaps.length) return null;
  return (
    <section aria-labelledby="no-eval-yet" className="space-y-2">
      <h2 id="no-eval-yet" className="text-lg font-semibold">
        No eval yet
      </h2>
      <p className="readable text-sm text-muted">
        {new Intl.ListFormat("en-US").format(gaps.map((f) => f.label))}. Nothing
        tells you yet whether {gaps.length === 1 ? "it" : "they"} got worse.
      </p>
    </section>
  );
}
/**
 * The hub as Evalkeeper arranges it: where each suite stands and what
 * needs attention. A hub of your own loads the same data (`loadHub`) and
 * arranges these sections another way.
 */
export async function HubPage({ app }: { app: EvalAppConfig }) {
  const data = await loadHub(app);
  return (
    <div className="space-y-8">
      <HubIntro />
      <HubStats data={data} />
      <WeeklyCheck app={app} weekly={data.weekly} />
      <SuiteList data={data} />
      <NoEvalYet data={data} />
    </div>
  );
}
