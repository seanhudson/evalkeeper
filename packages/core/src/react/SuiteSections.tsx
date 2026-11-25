import {
  FAVOR_TEXT,
  allPassed,
  answerKeyHealth,
  attacksFrom,
  barStatus,
  checkBar,
  draftAnswers,
  newStarters,
  orderRows,
  pctBeside,
  priorityGain,
  priorityOf,
  type SuitePriority,
  isInjectionSuite,
  meanCalibrationError,
  money,
  probabilityQuality,
  perAnswer,
  retiresLabel,
  seconds,
  seriousMistakes,
  suggest,
  withRounds,
  EASY_MIN_ROUNDS,
  currentSettings,
  replacedStarters,
  suiteStatus,
  suiteTodos,
  targetCasesOf,
  todoText,
  type Todo,
  type TodoInput,
} from "../index.js";
import { AnswerKey } from "./AnswerKey.js";
import { ModelMenu } from "./ModelMenu.js";
import { PriorityPicker } from "./PriorityPicker.js";
import { InfoPopover } from "./InfoPopover.js";
import { GLOSSARY } from "../glossary.js";
import type { AnswerGuide } from "../types.js";
import { Tabs } from "./Tabs.js";
import {
  Link,
  BackLink,
  Card,
  RefreshWhile,
  Chip,
  SeverityChip,
  SuiteStatusBadge,
  IconSubmit,
  InfoTip,
  Score,
  Select,
  Spinner,
  Submit,
  Tip,
} from "./pieces.js";
import { pct, LINK, QUIET_BUTTON, TINT } from "./format.js";
import {
  ArrowRight,
  Plus,
  RotateCw,
  ShieldAlert,
  Sparkles,
  Square,
} from "lucide-react";
import { PageMenu, type PageMenuEntry } from "./Drawer.js";
import { SpendingAlert, SpendingForm } from "./Spending.js";
import { TARGET_CASES_RANGE } from "../suiteSettings.js";
import {
  evalsPath,
  type EvalAppConfig,
  type FormAction,
  attacksResisted,
} from "./app.js";
import { SettingsHistory } from "./SettingsHistory.js";

/**
 * Everything a suite's page shows, loaded together: on a remote database
 * each read waits on round trips, so one after the other multiplies the
 * wait. Null for a suite that doesn't exist. Sections read from this, so a
 * page that arranges them its own way loads the same data once.
 *
 * @param key - The suite's key.
 */
export async function loadSuitePage(app: EvalAppConfig, key: string) {
  const operation = app.suiteByKey[key]?.operation;
  if (!operation) return null;
  const [
    b,
    attackBoards,
    [history, liveSettings],
    inInstructions,
    cases,
    savedSettings,
    spending,
  ] = await Promise.all([
    app.runner.board(key),
    // Injection suites that attack this feature: their results count here.
    app.runner.attackBoards(key),
    // Records a deploy if the instructions changed under the live
    // settings, before reading them.
    app.settings.syncPrompt(operation).then(() =>
      Promise.all([
        app.settings.history(operation),
        // Null for a feature with no settings yet: the page still shows.
        currentSettings(app.settings, operation),
      ]),
    ),
    app.runner.casesInInstructions(key),
    // Retired ones too: starters already added once aren't offered again.
    app.store.listCases(key, { includeRetired: true }),
    app.runner.suiteSettings(key),
    // The page must load even when spending can't be read.
    app.spending ? app.spending.read(operation).catch(() => null) : null,
  ]);
  const { suite, rows } = b;
  const attacks = attacksFrom(attackBoards);
  // An injection suite's models are chosen on its base suite's page.
  const choosesHere = !isInjectionSuite(suite);
  // The suite's priority, or the one an admin chose in its settings.
  const priority = priorityOf(suite, liveSettings?.settings);
  const target = targetCasesOf(suite, savedSettings);
  const testing =
    rows.some((r) => r.testing) ||
    attackBoards.some((a) => a.rows.some((r) => r.testing));
  // No suggestion while a test runs: it would weigh half a board.
  const s =
    choosesHere && !testing
      ? suggest(rows, suite.checks, priority, app.models, { attacks })
      : null;
  // What testing each model would cost now, attack cases included,
  // counting answers it would reuse.
  const estimates = new Map(
    await Promise.all(
      rows.map(
        async (r) =>
          [
            r.key,
            await app.runner.estimateTest(key, r.model, "ALL", 1, {
              reasoningEffort: r.effort,
            }),
          ] as const,
      ),
    ),
  );
  // Results under attack show once the feature has attack cases: a test
  // makes them from its confirmed answers.
  const showAttacks = attackBoards.some((a) => a.cases > 0);
  const live = rows.find((r) => r.live);
  // What would keep the answer key useful, from the same tests.
  const current = rows.filter((r) => r.test && !r.test.stale && !r.baseline);
  const testedAt = current.reduce<Date | null>(
    (m, r) => (r.test && (!m || r.test.at > m) ? r.test.at : m),
    null,
  );
  // Rounds each case passed (read only past the floor of cases).
  const rounds = await app.runner.easyRounds(key, cases, target);
  const health = answerKeyHealth(
    cases,
    withRounds(b.caseResults, rounds),
    new Date(),
    testedAt,
    target,
  );
  const replaced = replacedStarters(suite, cases);
  // Attack tests set up but not made yet.
  const unmade = attackBoards.filter((a) => a.cases === 0);
  const todoInput: TodoInput = {
    rows,
    checks: suite.checks,
    priority,
    models: app.models,
    attacks,
    cases: b.cases,
    provisional: b.provisional,
    target,
    unmadeAttacks: app.actions.makeAttackCases
      ? unmade.map((a) => ({ key: a.suite.key, label: a.suite.label }))
      : [],
    replacedStarters: replaced.length,
    splitCases: health.split.length,
  };
  // For each split case, which models got it fully right and which didn't,
  // so a person sees the disagreement before deciding.
  const split = new Set(health.split.map((c) => c.id));
  const splitBy: Record<string, { right: string[]; wrong: string[] }> = {};
  // Must-pass checks every tested model misses: count the cases each
  // misses them on, for the to-do list.
  const fixing = new Set(
    suiteTodos(todoInput).flatMap((t) =>
      t.kind === "fixCheck" ? [t.check] : [],
    ),
  );
  // check → case → models that missed it there
  const missedBy = new Map<string, Map<string, Set<string>>>();
  const scored = current.filter((r) => !r.variant);
  if (split.size || fixing.size)
    await Promise.all(
      scored.map(async (r) => {
        if (!r.test) return;
        for (const o of await app.store.listOutputs(r.test.runId)) {
          if (o.error) continue;
          if (split.has(o.caseId)) {
            const side = allPassed(o.scores) ? "right" : "wrong";
            const entry = (splitBy[o.caseId] ??= { right: [], wrong: [] });
            if (!entry[side].includes(r.label)) entry[side].push(r.label);
          }
          for (const x of o.scores ?? []) {
            if (!fixing.has(x.key) || x.pass !== false) continue;
            const byCase =
              missedBy.get(x.key) ?? new Map<string, Set<string>>();
            const models = byCase.get(o.caseId) ?? new Set<string>();
            models.add(r.key);
            byCase.set(o.caseId, models);
            missedBy.set(x.key, byCase);
          }
        }
      }),
    );
  const missedByCheck = Object.fromEntries(
    [...fixing].map((k) => [
      k,
      [...(missedBy.get(k)?.values() ?? [])].filter(
        (models) => models.size === scored.length,
      ).length,
    ]),
  );
  // The to-do list, on the page that chooses models.
  const todos: Todo[] = choosesHere
    ? suiteTodos({ ...todoInput, missedByCheck })
    : [];
  const status = choosesHere
    ? suiteStatus({ ...todoInput, missedByCheck }, todos)
    : null;

  return {
    app,
    key,
    operation,
    b,
    suite,
    rows,
    attackBoards,
    attacks,
    history,
    liveSettings,
    inInstructions,
    s,
    choosesHere,
    testing,
    estimates,
    showAttacks,
    live,
    health,
    cases,
    priority,
    splitBy,
    target,
    savedSettings,
    spending,
    todos,
    status,
    replaced,
  };
}

/** What `loadSuitePage` returns, for sections and custom pages. */
export type SuitePageData = NonNullable<
  Awaited<ReturnType<typeof loadSuitePage>>
>;

/** A share as a whole percent, or a dash when there's nothing to show. */
const asPct = (x: number | null) => (x === null ? "—" : pct(x));

/**
 * What a priority means for the suggestion, as a sentence: the
 * explanation without its leading name ("cost: this runs…").
 */
const whyFavor = (favor: SuitePriority["favor"]) => {
  const text = FAVOR_TEXT[favor].replace(/^\w+: /, "");
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
};

/** The suite's priority, as the page names it. */
const FAVORS = { cost: "cost", speed: "speed", quality: "accuracy" } as const;

const VS: Record<string, string> = {
  BETTER: "Better",
  SAME: "Similar",
  WORSE: "Worse",
  TOO_FEW: "Can't tell",
};

/**
 * The suite's name and status, its menu (Suite settings, Spending and
 * daily limits), what it tests, and spending when it needs room.
 */
export function SuiteHeader({ data }: { data: SuitePageData }) {
  const { app, suite, status } = data;
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <BackLink href={app.basePath}>Evals</BackLink>
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold">{suite.label}</h1>
            {status && (
              <span className="inline-flex items-center">
                <SuiteStatusBadge status={status} />
                <InfoTip term="standing" id="suite-status" align="end" />
              </span>
            )}
          </div>
          <PageMenu label={`${suite.label} menu`} entries={menuEntries(data)} />
        </div>
        <p className="readable text-muted">{suite.description}</p>
      </div>
      <SpendingAlert app={app} reading={data.spending} />
    </div>
  );
}

/** The title menu's entries, each opening its own drawer. */
function menuEntries(data: SuitePageData): PageMenuEntry[] {
  const { app, key, suite, spending, choosesHere } = data;
  const entries: PageMenuEntry[] = [];
  if (
    choosesHere &&
    app.runner.canSaveSuiteSettings &&
    app.actions.saveSuiteSettings
  )
    entries.push({
      key: "settings",
      label: "Suite settings",
      body: <SuiteSettingsForm data={data} />,
    });
  if (spending && app.actions.saveLimits)
    entries.push({
      key: "spending",
      label: "Spending and daily limits",
      body: (
        <SpendingForm
          app={app}
          reading={spending}
          suite={key}
          label={suite.label}
        />
      ),
    });
  return entries;
}

/**
 * Suite settings: one form, one Save. Its target number of cases, kept
 * apart from the model versions, so changing it never makes a version.
 */
function SuiteSettingsForm({ data }: { data: SuitePageData }) {
  const { app, key, suite, savedSettings, target } = data;
  const action = app.actions.saveSuiteSettings;
  if (!action) return null;
  const own = suite.targetCases ?? 50;
  return (
    <form key={target} action={action} className="space-y-4">
      <p className="readable text-muted">{GLOSSARY.suiteSettings}</p>
      <input type="hidden" name="suite" value={key} />
      <div className="space-y-1">
        <label htmlFor="target-cases" className="block font-medium">
          Target number of cases
        </label>
        <input
          id="target-cases"
          name="targetCases"
          type="number"
          inputMode="numeric"
          min={TARGET_CASES_RANGE.min}
          max={TARGET_CASES_RANGE.max}
          step={1}
          placeholder={String(own)}
          defaultValue={savedSettings.targetCases ?? ""}
          aria-describedby="target-cases-help"
          className="w-32 rounded-md border border-line bg-card px-3 py-2 tabular-nums focus:border-accent focus:outline-none"
        />
        <p id="target-cases-help" className="readable text-xs text-muted">
          {GLOSSARY.targetCases} Leave it empty for the suite&apos;s own ({own}
          ). It sets when the page asks for more cases, how many to draft, and
          the fewest that retiring easy cases leaves.
        </p>
      </div>
      <Submit>Save</Submit>
    </form>
  );
}

/**
 * What to do next on this suite, in order, each with why and the way to
 * do it here. Each drops off once it's done; empty, the section says
 * there's nothing to do. Not on an injection suite, whose models are
 * chosen on its feature's page.
 */
export function TodoSection({ data }: { data: SuitePageData }) {
  const { app, key, todos, choosesHere, status } = data;
  if (!choosesHere) return null;
  return (
    <section aria-labelledby="todo" className="space-y-3">
      <h2 id="todo" className="text-lg font-semibold">
        To do
        <InfoTip term="todo" />
      </h2>
      {todos.length === 0 ? (
        <p className="readable text-sm text-muted">
          {status === "unknown"
            ? "Nothing to do here yet."
            : "Nothing to do: every must-pass check meets its aim, and the answer key is at its target."}
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line bg-card">
          {todos.map((t) => {
            const { what, why } = todoText(t);
            return (
              <li
                key={`${t.kind}-${t.kind === "fixCheck" ? t.check : ""}`}
                className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 py-3 text-sm"
              >
                <p className="readable flex min-w-0 items-start gap-2">
                  <Square
                    aria-hidden
                    className="mt-0.5 h-4 w-4 shrink-0 text-muted"
                  />
                  <span>
                    <span className="font-medium">{what}</span>: {why}
                  </span>
                </p>
                <TodoAction app={app} suite={key} todo={t} />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Where a to-do item is done: a button for this page's action, or a link to its section. */
function TodoAction({
  app,
  suite,
  todo: t,
}: {
  app: EvalAppConfig;
  suite: string;
  todo: Todo;
}) {
  const go = (href: string, text: string) => (
    <a
      href={href}
      className={`inline-flex shrink-0 items-center gap-1 text-sm ${LINK}`}
    >
      {text}
      <ArrowRight aria-hidden className="h-3.5 w-3.5" />
    </a>
  );
  const button = (
    action: FormAction | undefined,
    text: string,
    fields: Record<string, string> = {},
  ) =>
    action ? (
      <form action={action} className="shrink-0">
        <input type="hidden" name="suite" value={suite} />
        {Object.entries(fields).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <Submit variant="quiet">{text}</Submit>
      </form>
    ) : null;
  switch (t.kind) {
    case "testAll":
      return button(app.actions.testAll, "Test every model");
    case "retest":
      return button(app.actions.testAll, "Test every model again");
    case "makeLive":
      return button(app.actions.useSuggestion, "Use the suggestion");
    case "fixCheck":
      return t.runId
        ? go(
            `${evalsPath(app, suite, "runs", t.runId)}#check-${t.check}`,
            "See the cases",
          )
        : go("#checks", "See the check");
    case "confirm":
      return go("#answer-key", "Review them");
    case "addCases":
      return go("#add-case=", "Add a case");
    case "makeAttacks":
      return (
        <span className="flex shrink-0 flex-wrap gap-2">
          {t.suites.map((a) => (
            <form key={a.key} action={app.actions.makeAttackCases}>
              <input type="hidden" name="suite" value={a.key} />
              <Submit variant="quiet">
                {t.suites.length > 1 ? `Make ${a.label}` : "Make attack cases"}
              </Submit>
            </form>
          ))}
        </span>
      );
    case "retireStarters":
      return button(app.actions.retireReplacedStarters, `Retire ${t.cases}`);
    case "reviewSplit":
      return go("#answer-key-health", "Review them");
  }
}

/** On an injection suite: models are chosen on its base suite, with a link there. */
export function ChosenOnBase({ data }: { data: SuitePageData }) {
  const { app, suite } = data;
  return (
    <>
      {isInjectionSuite(suite) && (
        <Card className="space-y-2">
          <h2 className="font-semibold">
            Models are chosen on {suite.base.label}
            <InfoTip term="attackResults" />
          </h2>
          <p className="readable text-sm text-muted">
            This suite tests the same feature as {suite.base.label}, so one
            choice of model serves both. Its results show there as Attacks
            resisted, and the suggestion there never picks a model with more
            must-pass misses on them than live.
          </p>
          <Link
            href={evalsPath(app, suite.base.key)}
            className={`inline-block text-sm ${LINK}`}
          >
            Choose models on {suite.base.label}
          </Link>
        </Card>
      )}
    </>
  );
}

/** Which models to make live and the fallback, and why; shown when nothing would change too. */
export function SuggestionCard({ data }: { data: SuitePageData }) {
  const { s, choosesHere, testing } = data;
  if (choosesHere && testing)
    return (
      <section className="space-y-3" aria-labelledby="suggestion">
        <h2 id="suggestion" className="text-lg font-semibold">
          Suggested
          <InfoTip term="suggestion" />
        </h2>
        <Card>
          <p className="readable text-sm text-muted">
            Waiting for the tests running now to finish. The suggestion weighs
            every model&apos;s finished test, so it follows then.
          </p>
        </Card>
      </section>
    );
  return (
    <>
      {/* Shown when nothing would change too, so a higher score that
          isn't enough to switch for comes with its reason. A section like
          Models: the heading outside, Use these beside it. */}
      {s && (
        <section className="space-y-3" aria-labelledby="suggestion">
          <div className="flex items-center justify-between gap-4">
            <h2 id="suggestion" className="text-lg font-semibold">
              {s.same ? "No change suggested" : "Suggested"}
              <InfoTip term="suggestion" />
            </h2>
            {/* The to-do list above is where to act on it; this says why. */}
          </div>
          <Card className="space-y-3">
            {!s.same && (
              <p>
                Live: <strong>{s.live.label}</strong>
                {s.fallback && (
                  <>
                    {" "}
                    · Fallback: <strong>{s.fallback.label}</strong>
                  </>
                )}
              </p>
            )}
            <ul className="readable list-disc space-y-1 pl-5 text-sm text-muted">
              {s.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </Card>
        </section>
      )}
    </>
  );
}

/** Cases whose words appear in the feature's instructions. */
export function CasesInInstructions({ data }: { data: SuitePageData }) {
  const { inInstructions } = data;
  return (
    <>
      {inInstructions.length > 0 && (
        <Card className="space-y-2">
          <h2 className="font-semibold text-warn">
            Cases in the instructions
            <InfoTip term="inInstructions" />
          </h2>
          <p className="readable text-sm text-muted">
            These cases&apos; words appear in what the model is told, so a test
            grades it on answers it was handed. Take the example out of the
            instructions, or rewrite or retire the case.
          </p>
          <ul className="readable list-disc space-y-1 pl-5 text-sm">
            {inInstructions.map((c) => (
              <li key={c.caseId}>
                {c.title}: “{c.found}”
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

/** Every model the feature can use: its latest test, how it compares with live, under attack, and buttons to test it or choose it. */
export function ModelTable({ data }: { data: SuitePageData }) {
  const {
    app,
    key,
    suite,
    rows,
    attackBoards,
    choosesHere,
    estimates,
    showAttacks,
    live,
    s,
    priority,
  } = data;
  const suggestedLive = s && !s.keepLive ? s.live.key : null;
  const suggestedFallback =
    s?.fallback && !s.fallback.fallback ? s.fallback.key : null;
  const ordered = orderRows(rows, suite.checks, priority, {
    live: suggestedLive,
  });
  const tunable = tunableModels(data);
  const columns = 7 + (showAttacks ? 1 : 0) + (suite.decisions ? 2 : 0);
  return (
    <>
      <section className="space-y-3" aria-labelledby="models">
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="models" className="text-lg font-semibold">
              Models
            </h2>
            {/* Why this priority, in its words: the page says it once. */}
            {choosesHere && app.actions.setPriority ? (
              <PriorityPicker
                action={app.actions.setPriority}
                suite={key}
                favor={priority.favor}
                own={suite.priority.favor}
                label={`Favors ${FAVORS[priority.favor]}`}
                why={whyFavor(priority.favor)}
              />
            ) : (
              <Tip text={whyFavor(priority.favor)} side="bottom" id="favors">
                <Chip tone="neutral">Favors {FAVORS[priority.favor]}</Chip>
              </Tip>
            )}
          </div>
          <div className="flex items-center gap-4">
            <form action={app.actions.testAll}>
              <input type="hidden" name="suite" value={key} />
              <Submit variant="quiet">Test every model</Submit>
            </form>
          </div>
        </div>
        <Card className="overflow-x-auto p-0 lg:overflow-visible">
          <table className="w-full text-sm">
            <thead className="text-left text-muted">
              <tr className="border-b border-line">
                <th className="p-3 font-normal">Model</th>
                <th className="p-3 font-normal">
                  <Tip term="score" side="bottom">
                    Accuracy
                  </Tip>
                </th>
                <th className="p-3 font-normal">
                  <Tip term="seriousMistakes" side="bottom">
                    Must-pass misses
                  </Tip>
                </th>
                {showAttacks && (
                  <th className="p-3 font-normal">
                    <Tip term="attacksResisted" side="bottom">
                      Attacks resisted
                    </Tip>
                  </th>
                )}
                <th className="p-3 font-normal">
                  <Tip term="time" side="bottom" align="end">
                    Speed
                  </Tip>
                </th>
                {suite.decisions && (
                  <>
                    <th className="p-3 font-normal">
                      <Tip term="probabilityQuality" side="bottom">
                        Probability quality
                      </Tip>
                    </th>
                    <th className="p-3 font-normal">
                      <Tip term="calibrationError" side="bottom" align="end">
                        Calibration error
                      </Tip>
                    </th>
                  </>
                )}
                <th className="p-3 font-normal">
                  <Tip term="cost" side="bottom" align="end">
                    Cost
                  </Tip>
                </th>
                <th className="p-3 font-normal">
                  <Tip term="againstLive" side="bottom" align="end">
                    Against live
                  </Tip>
                </th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {ordered.map((r) => (
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
                      {(r.key === suggestedLive ||
                        r.key === suggestedFallback) && (
                        <Tip
                          term="suggestion"
                          side="bottom"
                          id={`suggested-${r.key}`}
                        >
                          <Chip tone="suggested">
                            {r.key === suggestedLive
                              ? "Suggested"
                              : "Suggested fallback"}
                          </Chip>
                        </Tip>
                      )}
                      {retiresLabel(app.models, r.model) && (
                        <Tip
                          term="retiring"
                          side="bottom"
                          id={`retiring-${r.key}`}
                        >
                          <Chip tone="warn">
                            Retires {retiresLabel(app.models, r.model)}
                          </Chip>
                        </Tip>
                      )}
                      {suite.decisions && app.models[r.model]?.decisions && (
                        <Tip
                          term={
                            app.models[r.model]?.decisions === "native"
                              ? "nativeProbabilities"
                              : "promptedProbabilities"
                          }
                          side="bottom"
                          id={`decisions-${r.key}`}
                        >
                          <Chip tone="neutral">
                            {app.models[r.model]?.decisions === "native"
                              ? "Native probabilities"
                              : "Prompted"}
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
                      <div className="flex flex-col gap-0.5">
                        <Link href={evalsPath(app, key, "runs", r.test.runId)}>
                          <Score right={r.test.right} total={r.test.total} />
                        </Link>
                        {!r.test.stale && r.test.failedAnswers > 0 && (
                          <Link
                            href={`${evalsPath(app, key, "runs", r.test.runId)}#failed`}
                            className="text-xs text-muted hover:underline"
                          >
                            {r.test.failedAnswers}{" "}
                            {r.test.failedAnswers === 1 ? "answer" : "answers"}{" "}
                            failed: see why
                          </Link>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted">
                        {r.failed ?? "Not tested"}
                      </span>
                    )}
                  </td>
                  <td className="p-3 tabular-nums">
                    {r.test ? seriousMistakes(r, suite.checks) : "—"}
                  </td>
                  {showAttacks && (
                    <td className="p-3">
                      <div className="flex flex-col gap-1">
                        {attackBoards.map((a) => (
                          <UnderAttack
                            app={app}
                            key={a.suite.key}
                            attackSuite={a.suite.key}
                            attackLabel={a.suite.label}
                            row={a.rows.find((x) => x.key === r.key)}
                            resisted={attacksResisted(r.key, [a])}
                          />
                        ))}
                      </div>
                    </td>
                  )}
                  <td className="p-3 tabular-nums">
                    {r.test ? seconds(r.test.avgMs) : "—"}
                  </td>
                  {suite.decisions && (
                    <>
                      <td className="p-3 tabular-nums">
                        {asPct(
                          r.test ? probabilityQuality(r.test.measures) : null,
                        )}
                      </td>
                      <td className="p-3 tabular-nums">
                        {asPct(
                          r.test ? meanCalibrationError(r.test.measures) : null,
                        )}
                      </td>
                    </>
                  )}
                  <td className="p-3 tabular-nums">
                    {r.test ? perAnswer(r.test.costPerAnswer) : "—"}
                  </td>
                  <td className="p-3">
                    {r.vsLive && live?.test && r.test && !r.live ? (
                      <Link
                        href={`${evalsPath(app, key, "compare")}?${new URLSearchParams({ a: live.test.runId, b: r.test.runId })}`}
                        className={LINK}
                      >
                        {VS[r.vsLive]}
                        {(r.vsLive === "SAME" || r.vsLive === "BETTER") &&
                          priorityGain(r, live, priority) &&
                          `, ${priorityGain(r, live, priority)}`}
                      </Link>
                    ) : r.vsLive ? (
                      VS[r.vsLive]
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex justify-end">
                      <ModelMenu
                        suite={key}
                        model={r.model}
                        label={r.label}
                        test={{
                          action: app.actions.testModel,
                          text: r.test ? "Test again" : "Test",
                          note: estimateText(estimates.get(r.key)),
                        }}
                        makeLive={
                          choosesHere && !r.live && r.canMakeLive
                            ? app.actions.makeLive
                            : null
                        }
                        makeFallback={
                          choosesHere && r.canMakeFallback
                            ? app.actions.makeFallback
                            : null
                        }
                        effort={r.variant ? r.effort : undefined}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            {tunable.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={columns} className="p-2">
                    <TestSettingForm data={data} tunable={tunable} />
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </Card>
      </section>
    </>
  );
}

/**
 * The models a feature may use that list reasoning settings in your
 * catalog, each with its settings; empty when there's nothing to test.
 */
function tunableModels(data: SuitePageData) {
  const { app, operation, choosesHere } = data;
  if (!choosesHere) return [];
  return app.runner.modelsFor(operation).flatMap((m) => {
    const efforts = app.models[m]?.efforts;
    return efforts?.length
      ? [{ model: m, label: app.models[m]?.label ?? m, efforts }]
      : [];
  });
}

/**
 * Testing a model at a reasoning setting other than the feature's: less
 * reasoning is faster and cheaper, more can be more accurate. Each setting
 * gets its own row in the model table. The table's last row, inset.
 */
function TestSettingForm({
  data,
  tunable,
}: {
  data: SuitePageData;
  tunable: ReturnType<typeof tunableModels>;
}) {
  const { app, key } = data;
  return (
    <form
      action={app.actions.testModel}
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md bg-tint px-3 py-2.5"
    >
      <input type="hidden" name="suite" value={key} />
      <label htmlFor="test-setting" className="text-sm font-medium">
        Test a reasoning setting
        <InfoTip term="reasoningSetting" id="test-setting" />
      </label>
      <Select
        id="test-setting"
        name="setting"
        className="rounded-md border border-line bg-card px-3 py-1.5 text-sm"
      >
        {tunable.map((t) => (
          <optgroup key={t.model} label={t.label}>
            {t.efforts.map((e) => (
              <option key={e} value={JSON.stringify([t.model, e])}>
                {t.label} · {e} reasoning
              </option>
            ))}
          </optgroup>
        ))}
      </Select>
      <Submit variant="quiet">Test this setting</Submit>
    </form>
  );
}

/**
 * @deprecated The model table's last row holds this now; it renders
 * nothing. Remove it from your page.
 */
export function TestSettingSection(_props: { data: SuitePageData }) {
  return null;
}

// From the app's color names, so its evalkeeper.css decides both themes.
const BAR_TONE = {
  meets: TINT.good,
  close: TINT.warn,
  below: TINT.bad,
} as const;

/**
 * Where the mistakes are: how often each check passed, for every model
 * with a current test, beside each check's aim. Must-pass checks first. The
 * checks section shows the live model alone; this shows which model fails
 * which check.
 */
export function CheckBreakdownSection({ data }: { data: SuitePageData }) {
  const { suite, rows } = data;
  const tested = rows.filter((r) => r.test && !r.test.stale);
  if (!tested.length) return null;
  const checks = [...suite.checks].sort(
    (a, b) => Number(a.severity === "minor") - Number(b.severity === "minor"),
  );
  return (
    <section aria-labelledby="check-breakdown" className="space-y-3">
      <h2 id="check-breakdown" className="text-lg font-semibold">
        Where the mistakes are
        <InfoTip term="checkBreakdown" />
      </h2>
      <Card className="space-y-3">
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          {(
            [
              ["meets", "Meets its aim"],
              ["close", "Within 10 points of it"],
              ["below", "Further off"],
            ] as const
          ).map(([k, text]) => (
            <span key={k} className="flex items-center gap-1.5">
              <span className={`inline-block h-3 w-3 rounded ${BAR_TONE[k]}`} />
              {text}
            </span>
          ))}
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <th className="py-2 pr-4 font-normal">Check</th>
                <th className="py-2 pr-4 font-normal">
                  <Tip term="aim" side="bottom" id="breakdown-aim">
                    Aim
                  </Tip>
                </th>
                {tested.map((r) => (
                  <th key={r.key} className="py-2 pr-3 font-normal">
                    {r.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {checks.map((c) => (
                <tr key={c.key}>
                  <td className="py-1.5 pr-4">
                    <span className="mr-2">{c.label}</span>
                    <SeverityChip severity={c.severity} />
                  </td>
                  <td className="py-1.5 pr-4 tabular-nums text-muted">
                    {pct(checkBar(c))}
                  </td>
                  {tested.map((r) => {
                    const x = r.test?.byCheck[c.key];
                    const rate = x?.n ? x.passed / x.n : null;
                    return (
                      <td key={r.key} className="py-1 pr-2">
                        {rate === null ? (
                          <span className="text-muted">–</span>
                        ) : (
                          <span
                            className={`inline-block rounded px-2 py-0.5 tabular-nums ${BAR_TONE[barStatus(rate, checkBar(c))]}`}
                          >
                            {pctBeside(rate, checkBar(c))}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr>
                <td className="py-1.5 pr-4">Answers with no mistakes at all</td>
                <td />
                {tested.map((r) => (
                  <td key={r.key} className="py-1.5 pr-3 tabular-nums">
                    {r.test?.answersRight} of {r.test?.answers}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </section>
  );
}
/** The feature's settings history, with rollback; not on an injection suite. */
export function Versions({ data }: { data: SuitePageData }) {
  const { app, key, history, liveSettings, choosesHere, suite } = data;
  if (choosesHere && !liveSettings)
    return (
      <Card className="space-y-2">
        <h2 className="font-semibold">
          No settings yet
          <InfoTip term="versions" />
        </h2>
        <p className="readable text-sm text-muted">
          {suite.label} has no settings version yet, and no default in code, so
          nothing says which model it runs on. Record its first version (
          <code>settings.seed</code> or <code>settings.change</code>), or give
          it a default in your wiring. Tests still run.
        </p>
      </Card>
    );
  return (
    <>
      {choosesHere && liveSettings && (
        <SettingsHistory
          app={app}
          suite={key}
          entries={history}
          liveId={liveSettings.version?.id ?? null}
          label={(m) => app.models[m]?.label ?? m}
          defaults={liveSettings.settings}
        />
      )}
    </>
  );
}

/** Each check: what it checks, must pass or nice to have, its aim, and how the live model does. */
export function ChecksSection({ data }: { data: SuitePageData }) {
  const { suite, live } = data;
  return (
    <>
      <section id="checks" className="scroll-mt-4 space-y-3">
        <h2 className="text-lg font-semibold">
          Checks
          <InfoTip term="checks" />
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          {/* Must pass first; each group keeps the suite's own order. */}
          {[
            ...suite.checks.filter((c) => c.severity === "serious"),
            ...suite.checks.filter((c) => c.severity !== "serious"),
          ].map((c) => {
            const rate = live?.test?.byCheck[c.key];
            return (
              <Card key={c.key} className="space-y-1">
                <div className="flex justify-between gap-4">
                  <h3 className="font-medium">{c.label}</h3>
                  <Tip term={c.severity} id={`severity-${c.key}`} align="end">
                    <SeverityChip severity={c.severity} />
                  </Tip>
                </div>
                <p className="readable text-sm text-muted">{c.description}</p>
                <p className="text-sm">
                  {rate && rate.n > 0 && (
                    <>
                      Live:{" "}
                      <span
                        className={
                          rate.passed / rate.n >= checkBar(c)
                            ? "text-good"
                            : "text-warn"
                        }
                      >
                        {pctBeside(rate.passed / rate.n, checkBar(c))}
                      </span>{" "}
                      ({rate.passed}/{rate.n}) ·{" "}
                    </>
                  )}
                  <Tip term="aim" id={`aim-${c.key}`}>
                    <span className="text-muted">Aim: {pct(checkBar(c))}</span>
                  </Tip>
                </p>
              </Card>
            );
          })}
        </div>
      </section>
    </>
  );
}

/**
 * Ways to fill the answer key, beside adding a case by hand: testing with
 * draft answers before review, an injection
 * suite's attack cases, starter cases not added yet, and more drafts from
 * the suite's `draftMore`. Each shows only when it applies and your app
 * passes its action.
 */
export function AnswerKeyToolsSection({ data }: { data: SuitePageData }) {
  const { app, key, suite, cases, replaced } = data;
  const { actions } = app;
  const inUse = cases.filter((c) => c.status !== "RETIRED");
  const drafts = draftAnswers(cases);
  const fresh = newStarters(suite.starter, cases);
  // New starters named like a case they replace: said up front, so nobody
  // retires the wrong one of two cases with the same title.
  const titleOf = (input: unknown) => {
    const p = suite.input.safeParse(input);
    return p.success ? suite.title(p.data) : null;
  };
  const oldTitles = new Set(replaced.map((c) => titleOf(c.input)));
  const sameTitle = fresh.filter((c) => {
    const t = titleOf(c.input);
    return t !== null && oldTitles.has(t);
  }).length;
  const injection = isInjectionSuite(suite) ? suite : null;
  const parts = [
    actions.useDraftsProvisionally && drafts.length > 0 && (
      <Card key="provisional" className="space-y-3">
        <p className="readable text-sm">
          To test before you&apos;ve reviewed them, put the {drafts.length}{" "}
          draft {drafts.length === 1 ? "answer" : "answers"} to use as
          provisional. Scores then say they rest on unreviewed answers until you
          confirm each.
          <InfoTip term="provisional" />
        </p>
        <form action={actions.useDraftsProvisionally}>
          <input type="hidden" name="suite" value={key} />
          <Submit variant="quiet">Test with drafts, as provisional</Submit>
        </form>
      </Card>
    ),
    actions.makeAttackCases && injection && (
      <Card key="attacks" className="space-y-3">
        <p className="readable text-sm">
          Each attack case is a confirmed {injection.base.label} case with an
          attack planted where untrusted text goes, and keeps that case&apos;s
          answer: an attack shouldn&apos;t change it. Run this again after you
          confirm, change, or retire {injection.base.label} answers.
        </p>
        <form action={actions.makeAttackCases}>
          <input type="hidden" name="suite" value={key} />
          <Submit variant={inUse.length ? "quiet" : "primary"}>
            <ShieldAlert aria-hidden className="mr-1.5 inline h-4 w-4" />
            {inUse.length ? "Update attack cases" : "Make attack cases"}
          </Submit>
        </form>
      </Card>
    ),
    actions.addStarters && fresh.length > 0 && (
      <Card key="starters" className="space-y-3">
        <p className="readable text-sm">
          {inUse.length
            ? `${fresh.length} more starter ${fresh.length === 1 ? "case is" : "cases are"} ready.`
            : `No cases yet. Start with the suite's ${fresh.length} starter ${fresh.length === 1 ? "case" : "cases"}.`}{" "}
          Each needs your review and counts only once you confirm it, unless the
          suite&apos;s author already reviewed it.
          {sameTitle > 0 &&
            ` ${sameTitle === 1 ? "One shares its title" : `${sameTitle} share their titles`} with a starter case ${sameTitle === 1 ? "it replaces" : "they replace"}: the old ${sameTitle === 1 ? "one is" : "ones are"} marked No longer a starter in the answer key.`}
        </p>
        <form action={actions.addStarters}>
          <input type="hidden" name="suite" value={key} />
          <Submit variant={inUse.length ? "quiet" : "primary"}>
            <Sparkles aria-hidden className="mr-1.5 inline h-4 w-4" />
            Add {fresh.length} starter {fresh.length === 1 ? "case" : "cases"}
          </Submit>
        </form>
      </Card>
    ),
  ].filter(Boolean);
  if (!parts.length) return null;
  return <div className="space-y-3">{parts}</div>;
}
/** A suite's answer guide: its lead-in, points (numbered when in order), and note. */
function AnswerGuideText({ guide }: { guide: AnswerGuide }) {
  const items = guide.points.map((p, n) => (
    <li key={n}>
      {p.term && <strong>{p.term} </strong>}
      {p.text}
    </li>
  ));
  return (
    <div className="space-y-2">
      {guide.lead && <p>{guide.lead}</p>}
      {guide.ordered ? (
        <ol className="list-decimal space-y-1 pl-5">{items}</ol>
      ) : (
        <ul className="list-disc space-y-1 pl-5">{items}</ul>
      )}
      {guide.note && <p className="text-muted">{guide.note}</p>}
    </div>
  );
}

/** The answer key: the cases in use and their answers, with ways to add and rate them. */
export function AnswerKeySection({ data }: { data: SuitePageData }) {
  const { app, key, b, suite, rows, attackBoards } = data;
  // A feature's attack cases are a tab of its answer key.
  const attacked = attackBoards.filter((a) => a.cases > 0);
  const guide =
    suite.answerGuide ??
    (suite.labelHelp ? { points: [{ text: suite.labelHelp }] } : null);
  const cases = (
    <AnswerKey
      app={app}
      suite={suite}
      rows={rows}
      heading={
        guide ? (
          // The guide's list can't sit inside the heading; its button sits beside it.
          <div className="flex items-center">
            <h2 className="text-lg font-semibold">
              Answer key ({b.cases} cases in use)
            </h2>
            <InfoPopover label="About the answer key">
              <p className="text-muted">{GLOSSARY.answerKey}</p>
              <p className="font-medium">How to judge an answer</p>
              <AnswerGuideText guide={guide} />
            </InfoPopover>
          </div>
        ) : (
          <h2 className="text-lg font-semibold">
            Answer key ({b.cases} cases in use)
            <InfoTip term="answerKey" />
          </h2>
        )
      }
      tools={
        <>
          {suite.caseKind === "imported" &&
            suite.rateBlind !== false &&
            (suite.labelFromForm || app.answerEditors[key]) && (
              <Tip control term="rateBlind" side="bottom" align="end">
                <Link
                  href={evalsPath(app, key, "rate")}
                  className="inline-flex items-center rounded-md border border-accent/40 bg-card px-3 py-1.5 text-sm text-accent hover:bg-accent/10"
                >
                  Rate blind
                </Link>
              </Tip>
            )}
          <form action={app.actions.rescore}>
            <input type="hidden" name="suite" value={key} />
            <Tip control term="rescore" side="bottom" align="end">
              <IconSubmit
                label="Rescore tests"
                icon={<RotateCw aria-hidden className="h-4 w-4" />}
              />
            </Tip>
          </form>
        </>
      }
    />
  );
  return (
    // The weekly check links here to review drafts.
    <section id="answer-key" className="scroll-mt-4 space-y-3">
      {attacked.length === 0 ? (
        cases
      ) : (
        <Tabs
          label="The answer key's cases"
          tabs={[
            { id: "cases", title: `Cases (${b.cases})`, panel: cases },
            ...attacked.map((a) => ({
              id: a.suite.key,
              title: `Attacks (${a.cases})`,
              panel: (
                <AnswerKey
                  app={app}
                  readOnly
                  suite={a.suite}
                  rows={a.rows}
                  heading={
                    <p className="readable text-sm text-muted">
                      Each is a confirmed case with an attack planted where
                      untrusted text goes, and keeps that case&apos;s answer. A
                      model&apos;s Test runs them, and they follow the cases as
                      answers change.
                    </p>
                  }
                  tools={
                    <>
                      <a
                        href="https://seanhudson.github.io/evalkeeper/guides/suites/#more-attacks"
                        className={LINK}
                      >
                        Add an attack
                      </a>
                      {app.actions.makeAttackCases && (
                        <form action={app.actions.makeAttackCases}>
                          <input
                            type="hidden"
                            name="suite"
                            value={a.suite.key}
                          />
                          <Submit variant="quiet">Update attack cases</Submit>
                        </form>
                      )}
                    </>
                  }
                />
              ),
            })),
          ]}
        />
      )}
    </section>
  );
}

/**
 * What testing a model costs now, as the menu says it: "free, all 34
 * reused", "~$0.10, 15 of 34 reused". Null before any cases.
 */
function estimateText(
  estimate:
    { answers: number; reused: number; costUsd: number | null } | undefined,
): string | null {
  if (!estimate || estimate.answers === 0) return null;
  const { answers, reused, costUsd } = estimate;
  return reused === answers
    ? `free, all ${answers} reused`
    : `${costUsd === null ? "cost unknown" : `~${money(costUsd)}`}${reused ? `, ${reused} of ${answers} reused` : ""}`;
}

/**
 * A model's serious mistakes on one injection suite, linked to that test,
 * or a dash until the model's Test runs the attacks along with its cases.
 * Out of date and failed tests say so: the suggestion counts only
 * current, complete ones.
 */
function UnderAttack({
  app,
  attackSuite,
  attackLabel,
  row,
  resisted,
}: {
  app: EvalAppConfig;
  attackSuite: string;
  attackLabel: string;
  row:
    | {
        key: string;
        testing: boolean;
        test: { runId: string; stale: boolean; failedAnswers: number } | null;
      }
    | undefined;
  resisted: { resisted: number; of: number } | null;
}) {
  if (row?.testing)
    return (
      <span role="status" title="Testing" className="inline-flex text-accent">
        <Spinner />
      </span>
    );
  if (row?.test)
    return (
      <Link
        href={evalsPath(app, attackSuite, "runs", row.test.runId)}
        title={attackLabel}
        className="tabular-nums"
      >
        {row.test.stale ? (
          `${resisted ? pct(resisted.resisted / resisted.of) : "—"} · out of date`
        ) : row.test.failedAnswers && !resisted ? (
          <Tip
            term="attackFailures"
            side="bottom"
            id={`attack-failed-${row.key}`}
          >
            <span className="text-warn">
              {row.test.failedAnswers} failed: test again
            </span>
          </Tip>
        ) : resisted ? (
          pct(resisted.resisted / resisted.of)
        ) : (
          "—"
        )}
      </Link>
    );
  // Not tested yet: the model's Test runs the attacks with its cases.
  return <span className="text-muted">—</span>;
}

/**
 * Keeping the answer key useful: easy cases to retire (past the suite's
 * target number of cases),
 * cases models split on and near-duplicates to check, old drafts, and
 * tags with a single case. Shows only what needs a look, and nothing on
 * an injection suite, whose cases are made from its base suite's.
 */
export function AnswerKeyHealthSection({ data }: { data: SuitePageData }) {
  const { app, key, suite, health: h, choosesHere, splitBy, target } = data;
  const thin = h.tags.filter(([, n]) => n === 1).map(([t]) => t);
  const needs =
    h.easyToRetire.length ||
    h.split.length ||
    h.duplicates.length ||
    h.staleDrafts.length ||
    thin.length;
  if (!choosesHere || !needs) return null;
  const title = (c: { input: unknown }) => {
    const p = suite.input.safeParse(c.input);
    return p.success ? suite.title(p.data) : "(case)";
  };
  const caseLink = (c: { id: string; input: unknown }) => (
    <a href={`#case-${c.id}`} className={LINK}>
      {title(c)}
    </a>
  );
  const { retireEasy, retireStaleDrafts, keepAnswer } = app.actions;
  const cases = (n: number) => `${n} ${n === 1 ? "case" : "cases"}`;
  const drafts = (n: number) => `${n} ${n === 1 ? "draft" : "drafts"}`;
  const { draftMore } = app.actions;
  const check = h.split.length > 0 || h.duplicates.length > 0;
  const retire = h.easyToRetire.length > 0 || h.staleDrafts.length > 0;
  return (
    <section className="space-y-3" aria-labelledby="answer-key-health">
      <h2 id="answer-key-health" className="scroll-mt-4 text-lg font-semibold">
        Answer key health
        <InfoTip term="answerKeyHealth" />
      </h2>
      {/* What to do, in order: fix doubtful answers, fill thin spots, prune. */}
      <Card className="space-y-6 text-sm">
        {check && (
          <div className="space-y-3">
            <h3 className="font-medium">Answers worth a second look</h3>
            {h.split.length > 0 && (
              <div className="space-y-2">
                <p className="readable">
                  Models split about evenly on {cases(h.split.length)}: some
                  give the answer key&apos;s answer, some don&apos;t. That often
                  means the answer is wrong or the case is unclear, and either
                  one makes every score less trustworthy. For each, decide
                  who&apos;s right: keep the answer, fix it, or retire the case
                  if there&apos;s no right answer.
                  <InfoTip term="splitCases" />
                </p>
                <ul className="space-y-2">
                  {h.split.map((c) => {
                    const by = splitBy[c.id];
                    const names = (xs: string[]) =>
                      new Intl.ListFormat("en-US").format(xs);
                    return (
                      // The tint spans the panel; the words keep their
                      // readable width inside it.
                      <li
                        key={c.id}
                        className="w-full space-y-2 rounded-md bg-tint p-3"
                      >
                        <div className="readable font-medium">
                          {caseLink(c)}
                        </div>
                        {by && (
                          <p className="readable text-xs text-muted">
                            {by.right.length > 0 &&
                              `Gave the answer key's answer: ${names(by.right)}. `}
                            {by.wrong.length > 0 &&
                              `Didn't: ${names(by.wrong)}.`}
                          </p>
                        )}
                        <div className="flex flex-wrap items-center gap-2">
                          {keepAnswer && (
                            <form action={keepAnswer}>
                              <input type="hidden" name="suite" value={key} />
                              <input type="hidden" name="case" value={c.id} />
                              <Submit variant="quiet">
                                The answer is right
                              </Submit>
                            </form>
                          )}
                          <a
                            href={`#case-${c.id}`}
                            className={`inline-flex items-center rounded-md px-3 py-1.5 text-sm ${QUIET_BUTTON}`}
                          >
                            Fix the answer
                          </a>
                          <form action={app.actions.retireCase}>
                            <input type="hidden" name="suite" value={key} />
                            <input type="hidden" name="case" value={c.id} />
                            <Submit variant="quiet">Retire it</Submit>
                          </form>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            {h.duplicates.length > 0 && (
              <div className="readable space-y-1">
                <p>
                  These pairs share nearly all their words, so each counts
                  twice. Keep the clearer one and retire the other.
                  <InfoTip term="nearDuplicates" />
                </p>
                <ul className="list-disc space-y-0.5 pl-5">
                  {h.duplicates.map(([a, b]) => (
                    <li key={`${a.id}-${b.id}`}>
                      {caseLink(a)} and {caseLink(b)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        {thin.length > 0 && (
          <div className="space-y-2">
            <h3 className="font-medium">Add cases here</h3>
            <p className="readable">
              {thin.length} {thin.length === 1 ? "topic has" : "topics have"}{" "}
              only one case, so the score on each rests on a single example: one
              mistake swings it, and a fix can&apos;t be confirmed. Add a case
              or two to each.
              <InfoTip term="tagCoverage" />
            </p>
            {!(draftMore && suite.draftMore) && (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="readable text-muted">
                  Pick a topic to open Add a case with it filled in.
                </p>
                <a
                  href="#add-case="
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm ${QUIET_BUTTON}`}
                >
                  <Plus aria-hidden className="h-4 w-4" />
                  Add a case
                </a>
              </div>
            )}
            {draftMore && suite.draftMore ? (
              <form action={draftMore} className="space-y-2">
                <input type="hidden" name="suite" value={key} />
                <ul className="flex flex-wrap gap-1.5">
                  {thin.map((t) => (
                    <li key={t}>
                      <label
                        className={`inline-flex cursor-pointer items-center gap-1 rounded-full px-2 py-0.5 text-xs ${TINT.warn} has-[:checked]:bg-warn/40`}
                      >
                        <input
                          type="checkbox"
                          name="topic"
                          value={t}
                          className="h-3 w-3 accent-[var(--color-warn)]"
                        />
                        {t}
                      </label>
                    </li>
                  ))}
                </ul>
                <Submit variant="quiet">
                  Draft cases for the topics you picked
                </Submit>
                <p className="readable text-xs text-muted">
                  Two drafts a topic, to confirm like any draft. Pick none to
                  cover them all.
                </p>
              </form>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {thin.map((t) => (
                  <li key={t}>
                    <a
                      href={`#add-case=${encodeURIComponent(t)}`}
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs hover:underline ${TINT.warn}`}
                    >
                      <Plus aria-hidden className="h-3 w-3" />
                      {t}
                    </a>
                  </li>
                ))}
              </ul>
            )}
            <details className="group">
              <summary className="cursor-pointer text-xs text-muted">
                Every topic and its cases
              </summary>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {h.tags.map(([t, n]) => (
                  <li key={t}>
                    <Chip tone={n === 1 ? "warn" : "neutral"}>
                      {t} · {n}
                    </Chip>
                  </li>
                ))}
              </ul>
            </details>
          </div>
        )}
        {retire && (
          <div className="readable space-y-3">
            <h3 className="font-medium">Retire these</h3>
            {h.easyToRetire.length > 0 && (
              <div className="space-y-2">
                <p>
                  Every model got {cases(h.easyToRetire.length)} fully right in{" "}
                  {EASY_MIN_ROUNDS} or more rounds of testing, so they no longer
                  tell models apart. Retiring them keeps{" "}
                  {h.inUse - h.easyToRetire.length} cases, at or above the
                  suite&apos;s target of {target}. Recent tests are rescored for
                  free.
                  <InfoTip term="easyCases" />
                </p>
                {retireEasy && (
                  <form action={retireEasy}>
                    <input type="hidden" name="suite" value={key} />
                    <Submit variant="quiet">
                      Retire {h.easyToRetire.length} easy{" "}
                      {h.easyToRetire.length === 1 ? "case" : "cases"}
                    </Submit>
                  </form>
                )}
              </div>
            )}
            {h.staleDrafts.length > 0 && (
              <div className="space-y-2">
                <p>
                  {drafts(h.staleDrafts.length)} nobody reviewed in 30 days. The
                  weekly check retires them on its own.
                  <InfoTip term="oldDrafts" />
                </p>
                {retireStaleDrafts && (
                  <form action={retireStaleDrafts}>
                    <input type="hidden" name="suite" value={key} />
                    <Submit variant="quiet">
                      Retire {h.staleDrafts.length} old{" "}
                      {h.staleDrafts.length === 1 ? "draft" : "drafts"} now
                    </Submit>
                  </form>
                )}
              </div>
            )}
          </div>
        )}
      </Card>
    </section>
  );
}

/**
 * A suite's page as Evalkeeper arranges it, or null for a suite you don't
 * have. A page of your own loads the same data (`loadSuitePage`) and
 * arranges these sections another way.
 */
export async function SuitePage({
  app,
  suite,
}: {
  app: EvalAppConfig;
  suite: string;
}) {
  const data = await loadSuitePage(app, suite);
  if (!data) return null;
  return (
    <div className="space-y-8">
      <RefreshWhile active={data.testing} />
      <SuiteHeader data={data} />
      <TodoSection data={data} />
      <ChosenOnBase data={data} />
      <SuggestionCard data={data} />
      <CasesInInstructions data={data} />
      <ModelTable data={data} />
      <CheckBreakdownSection data={data} />
      <Versions data={data} />
      <ChecksSection data={data} />
      <AnswerKeyHealthSection data={data} />
      <AnswerKeyToolsSection data={data} />
      <AnswerKeySection data={data} />
    </div>
  );
}
