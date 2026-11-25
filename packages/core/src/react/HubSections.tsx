import {
  answerKeyHealth,
  attacksFrom,
  currentSettings,
  isInjectionSuite,
  priorityOf,
  replacedStarters,
  SUITE_STATUS_LABEL,
  SUITE_STATUS_ORDER,
  suiteStatus,
  suiteTodos,
  targetCasesOf,
  thumbsSummary,
  type TodoInput,
} from "../index.js";
import { Link, Card, InfoTip, SuiteStatusBadge } from "./pieces.js";
import { LINK } from "./format.js";
import { daysAgo, evalsPath, loadWeekly, type EvalAppConfig } from "./app.js";
import { ChevronRight } from "lucide-react";
import { WeeklyCheck } from "./WeeklyCheck.js";
import { PageMenu } from "./Drawer.js";
import { SpendingAlert, SpendingForm } from "./Spending.js";

/**
 * Everything the evals hub shows, loaded together. Sections read from
 * this, so a hub of your own loads the same data once.
 */
export async function loadHub(app: EvalAppConfig) {
  const [boards, weekly, feedback, spending] = await Promise.all([
    Promise.all(app.suites.map((s) => app.runner.board(s.key))),
    loadWeekly(app),
    app.feedbackStore.listFeedback(),
    // The hub must load even when spending can't be read.
    app.spending ? app.spending.read().catch(() => null) : null,
  ]);
  const thumbs = thumbsSummary(feedback, daysAgo(7));
  const down = thumbs.reduce((t, s) => t + s.down, 0);
  const waiting = thumbs.reduce((t, s) => t + s.open, 0);
  const flagged = thumbs.filter((s) => s.alert).length;
  // An injection suite shows on its base suite's row, not its own.
  const attacksOn = (key: string) =>
    boards.filter((x) => isInjectionSuite(x.suite) && x.suite.base.key === key);
  const features = boards.filter((b) => !isInjectionSuite(b.suite));
  const suites = await Promise.all(
    features.map(async (b) => {
      const { suite } = b;
      const [current, saved, cases] = await Promise.all([
        // One feature with no settings yet mustn't break the hub.
        currentSettings(app.settings, suite.operation),
        app.runner.suiteSettings(suite.key),
        app.store.listCases(suite.key),
      ]);
      const attacked = attacksOn(suite.key);
      const tested = b.rows.filter(
        (r) => r.test && !r.test.stale && !r.baseline,
      );
      const testedAt = tested.reduce<Date | null>(
        (m, r) => (r.test && (!m || r.test.at > m) ? r.test.at : m),
        null,
      );
      const input: TodoInput = {
        rows: b.rows,
        checks: suite.checks,
        priority: priorityOf(suite, current?.settings),
        models: app.models,
        attacks: attacksFrom(attacked),
        cases: b.cases,
        provisional: b.provisional,
        target: targetCasesOf(suite, saved),
        unmadeAttacks: app.actions.makeAttackCases
          ? attacked
              .filter((a) => a.cases === 0)
              .map((a) => ({ key: a.suite.key, label: a.suite.label }))
          : [],
        replacedStarters: replacedStarters(suite, cases).length,
        splitCases: answerKeyHealth(cases, b.caseResults, new Date(), testedAt)
          .split.length,
      };
      const todos = suiteTodos(input);
      return {
        suite,
        board: b,
        todos,
        status: suiteStatus(input, todos),
        settings: current,
      };
    }),
  );
  return {
    app,
    boards,
    weekly,
    thumbs,
    down,
    waiting,
    flagged,
    attacksOn,
    suites,
    spending,
  };
}

/** What `loadHub` returns, for sections and custom pages. */
export type HubData = Awaited<ReturnType<typeof loadHub>>;

/**
 * What the evals hub is for, with its menu (Spending and daily limits)
 * beside the title, and spending when it needs room: over a limit,
 * stopped, or a test running.
 */
export function HubIntro({ data }: { data?: HubData }) {
  const app = data?.app;
  const spending = data?.spending ?? null;
  const entries =
    app && spending && app.actions.saveLimits
      ? [
          {
            key: "spending",
            label: "Spending and daily limits",
            body: <SpendingForm app={app} reading={spending} />,
          },
        ]
      : [];
  return (
    <div className="space-y-4">
      <div className="readable space-y-2">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold">Evals</h1>
          <PageMenu label="Evals menu" entries={entries} />
        </div>
        <p className="text-muted">
          Each suite tests one AI feature against answers people confirmed. Test
          models on it, then pick the live one on evidence.
        </p>
      </div>
      {app && <SpendingAlert app={app} reading={spending} />}
    </div>
  );
}

/**
 * Thumbs down people gave this week, in one line linking to them, shown
 * only when there's something to look at. The hub's one number: the rest
 * (cost, speed, scores) is on each suite's page.
 */
export function HubStats({ data }: { data: HubData }) {
  const { app, down, waiting, flagged } = data;
  if (!down && !waiting) return null;
  return (
    <p className="text-sm">
      <Link href={evalsPath(app, "feedback")} className={LINK}>
        {down} thumbs down this week
      </Link>
      <InfoTip term="thumbs" />
      <span className="text-muted">
        {" "}
        · {waiting} waiting for a look
        {flagged
          ? ` · ${flagged} feature${flagged === 1 ? "" : "s"} need a look`
          : ""}
      </span>
    </p>
  );
}

/**
 * One short row per feature, its name and status, with what needs you
 * first: Needs attention, then Can't tell yet, then Healthy. Each row
 * opens the suite's page, where its to-do list and details are. An
 * injection suite counts on its base feature's row.
 */
export function SuiteList({ data }: { data: HubData }) {
  const { app, suites } = data;
  const ordered = SUITE_STATUS_ORDER.flatMap((status) =>
    suites.filter((s) => s.status === status),
  );
  return (
    <section aria-labelledby="suites" className="space-y-3">
      <h2 id="suites" className="text-lg font-semibold">
        Suites
        <InfoTip term="suites" />
      </h2>
      {suites.length === 0 ? (
        <NoSuites />
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-card">
          {ordered.map((s) => (
            <li key={s.suite.key}>
              <Link
                href={evalsPath(app, s.suite.key)}
                className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-tint"
                title={`${s.suite.label}: ${SUITE_STATUS_LABEL[s.status]}`}
              >
                <span className="min-w-0 truncate font-medium">
                  {s.suite.label}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <SuiteStatusBadge status={s.status} />
                  <ChevronRight aria-hidden className="h-4 w-4 text-muted" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {suites.length > 0 && (
        <p className="readable text-xs text-muted">
          Needs attention: something is on the suite&apos;s to-do list.
          Can&apos;t tell yet: no model tested, or too few cases to judge.
          Healthy: nothing to do.
          <InfoTip term="standing" id="standing-key" />
        </p>
      )}
    </section>
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
        Nothing tells you yet whether{" "}
        {gaps.length === 1 ? "this feature" : "these features"} got worse.
      </p>
      {/* One slim card per feature, like the suites above. */}
      <ul className="space-y-3">
        {gaps.map((f) => (
          <li key={f.operation}>
            <Card className="space-y-1 py-3">
              <p className="font-semibold">{f.label}</p>
              {f.description && (
                <p className="readable text-sm text-muted">{f.description}</p>
              )}
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
/**
 * The hub as Evalkeeper arranges it: where each suite stands, in one row
 * each. A hub of your own loads the same data (`loadHub`) and arranges
 * these sections another way.
 */
export async function HubPage({ app }: { app: EvalAppConfig }) {
  const data = await loadHub(app);
  return (
    <div className="space-y-8">
      <HubIntro data={data} />
      <SuiteList data={data} />
      <HubStats data={data} />
      <WeeklyCheck app={app} weekly={data.weekly} />
      <NoEvalYet data={data} />
    </div>
  );
}
