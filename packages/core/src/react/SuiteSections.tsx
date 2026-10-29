import {
  FAVOR_TEXT,
  answerKeyHealth,
  attacksFrom,
  barStatus,
  checkBar,
  draftAnswers,
  draftsToTarget,
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
} from "../index.js";
import { AnswerKey } from "./AnswerKey.js";
import { ModelMenu } from "./ModelMenu.js";
import { Tabs } from "./Tabs.js";
import {
  Link,
  BackLink,
  Card,
  RefreshWhile,
  Chip,
  IconSubmit,
  InfoTip,
  Score,
  Select,
  Spinner,
  Submit,
  TextInput,
  Tip,
} from "./pieces.js";
import { pct, LINK } from "./format.js";
import { ChevronDown, RotateCw, ShieldAlert, Sparkles } from "lucide-react";
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
  const [b, attackBoards, [history, liveSettings], inInstructions, cases] =
    await Promise.all([
      app.runner.board(key),
      // Injection suites that attack this feature: their results count here.
      app.runner.attackBoards(key),
      // Records a deploy if the instructions changed under the live
      // settings, before reading them.
      app.settings
        .syncPrompt(operation)
        .then(() =>
          Promise.all([
            app.settings.history(operation),
            app.settings.current(operation),
          ]),
        ),
      app.runner.casesInInstructions(key),
      // Retired ones too: starters already added once aren't offered again.
      app.store.listCases(key, { includeRetired: true }),
    ]);
  const { suite, rows } = b;
  const attacks = attacksFrom(attackBoards);
  // An injection suite's models are chosen on its base suite's page.
  const choosesHere = !isInjectionSuite(suite);
  // The suite's priority, or the one an admin chose in its settings.
  const priority = priorityOf(suite, liveSettings.settings);
  const s = choosesHere
    ? suggest(rows, suite.checks, priority, app.models, { attacks })
    : null;
  const testing =
    rows.some((r) => r.testing) ||
    attackBoards.some((a) => a.rows.some((r) => r.testing));
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
  const health = answerKeyHealth(cases, b.caseResults);

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
  };
}

/** What `loadSuitePage` returns, for sections and custom pages. */
export type SuitePageData = NonNullable<
  Awaited<ReturnType<typeof loadSuitePage>>
>;

/** A share as a whole percent, or a dash when there's nothing to show. */
const asPct = (x: number | null) => (x === null ? "—" : pct(x));

/** The choices when changing it: accuracy is always held. */
const CHOICES = {
  quality: "Accuracy alone",
  speed: "Speed",
  cost: "Cost",
} as const;

/** The suite's priority, as the page names it. */
const FAVORS = { cost: "cost", speed: "speed", quality: "accuracy" } as const;

const VS: Record<string, string> = {
  BETTER: "More accurate",
  SAME: "About as accurate",
  WORSE: "Less accurate",
  TOO_FEW: "Too few cases to tell",
};

/** The suite's name, what it tests, and its priority. */
export function SuiteHeader({ data }: { data: SuitePageData }) {
  const { app, suite, priority } = data;
  return (
    <>
      <div className="space-y-2">
        <BackLink href={app.basePath}>Evals</BackLink>
        <h1 className="text-2xl font-semibold">{suite.label}</h1>
        <p className="readable text-muted">{suite.description}</p>
        <p className="readable text-sm text-muted">
          Priority: {FAVOR_TEXT[priority.favor]}.
          <InfoTip term="priority" />
        </p>
      </div>
    </>
  );
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
            serious mistakes on them than live.
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
  const { app, key, s } = data;
  return (
    <>
      {/* Shown when nothing would change too, so a higher score that
          isn't enough to switch for comes with its reason. */}
      {s && (
        <Card className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h2 className="font-semibold">
              {s.same ? "No change suggested" : "Suggested"}
              <InfoTip term="suggestion" />
            </h2>
            {/* Retesting live changes nothing until the fallback would. */}
            {!s.same &&
              !(s.retestLive && (!s.fallback || s.fallback.fallback)) && (
                <form action={app.actions.useSuggestion}>
                  <input type="hidden" name="suite" value={key} />
                  <Submit>Use these</Submit>
                </form>
              )}
          </div>
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
  return (
    <>
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">Models</h2>
            <Tip term="favors" side="bottom" id="favors">
              <Chip tone="neutral">Favors {FAVORS[priority.favor]}</Chip>
            </Tip>
            {choosesHere && app.actions.setPriority && (
              <PriorityControl
                action={app.actions.setPriority}
                suite={key}
                favor={priority.favor}
                own={suite.priority.favor}
              />
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
                    Serious mistakes
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
                          <span className="text-xs text-muted">
                            {r.test.failedAnswers}{" "}
                            {r.test.failedAnswers === 1 ? "answer" : "answers"}{" "}
                            failed: test again
                          </span>
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
          </table>
        </Card>
      </section>
    </>
  );
}

/**
 * Testing a model at a reasoning setting other than the feature's: less
 * reasoning is faster and cheaper, more can be more accurate. Each setting
 * gets its own row in the model table. Shows only when a model the feature
 * may use lists its settings in your catalog.
 */
export function TestSettingSection({ data }: { data: SuitePageData }) {
  const { app, key, operation, choosesHere } = data;
  const tunable = app.runner.modelsFor(operation).flatMap((m) => {
    const efforts = app.models[m]?.efforts;
    return efforts?.length
      ? [{ model: m, label: app.models[m]?.label ?? m, efforts }]
      : [];
  });
  if (!choosesHere || !tunable.length) return null;
  return (
    <form
      action={app.actions.testModel}
      className="flex flex-wrap items-end gap-2"
    >
      <input type="hidden" name="suite" value={key} />
      <div>
        <label htmlFor="test-setting" className="block text-sm font-medium">
          Test a reasoning setting
          <InfoTip term="reasoningSetting" id="test-setting" />
        </label>
        <Select
          id="test-setting"
          name="setting"
          className="mt-1 rounded-md border border-line bg-card px-3 py-2 text-sm"
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
      </div>
      <Submit variant="quiet">Test this setting</Submit>
    </form>
  );
}

const BAR_TONE = {
  meets:
    "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-200",
  close: "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200",
  below: "bg-red-100 text-red-900 dark:bg-red-500/15 dark:text-red-200",
} as const;

/**
 * Where the mistakes are: how often each check passed, for every model
 * with a current test, beside each check's bar. Serious checks first. The
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
              ["meets", "Meets the bar"],
              ["close", "Within 10 points"],
              ["below", "Further below"],
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
                <th className="py-2 pr-4 font-normal">Bar</th>
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
                    <Chip
                      tone={c.severity === "serious" ? "serious" : "neutral"}
                    >
                      {c.severity}
                    </Chip>
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
  const { app, key, history, liveSettings, choosesHere } = data;
  return (
    <>
      {choosesHere && (
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

/** Each check: what it checks, its severity and bar, and how the live model does. */
export function ChecksSection({ data }: { data: SuitePageData }) {
  const { suite, live } = data;
  return (
    <>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">
          Checks
          <InfoTip term="checks" />
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          {/* Serious first; each group keeps the suite's own order. */}
          {[
            ...suite.checks.filter((c) => c.severity === "serious"),
            ...suite.checks.filter((c) => c.severity !== "serious"),
          ].map((c) => {
            const rate = live?.test?.byCheck[c.key];
            return (
              <Card key={c.key} className="space-y-1">
                <div className="flex justify-between gap-4">
                  <h3 className="font-medium">{c.label}</h3>
                  <Tip term={c.severity} id={`severity-${c.key}`}>
                    <Chip
                      tone={c.severity === "serious" ? "serious" : "neutral"}
                    >
                      {c.severity}
                    </Chip>
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
                  <Tip term="bar" id={`bar-${c.key}`}>
                    <span className="text-muted">Bar: {pct(checkBar(c))}</span>
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
 * Ways to fill the answer key, beside adding a case by hand: how to judge
 * an answer, testing with draft answers before review, an injection
 * suite's attack cases, starter cases not added yet, and more drafts from
 * the suite's `draftMore`. Each shows only when it applies and your app
 * passes its action.
 */
export function AnswerKeyToolsSection({ data }: { data: SuitePageData }) {
  const { app, key, suite, cases } = data;
  const { actions } = app;
  const inUse = cases.filter((c) => c.status !== "RETIRED");
  const drafts = draftAnswers(cases);
  const fresh = newStarters(suite.starter, cases);
  const guide =
    suite.answerGuide ??
    (suite.labelHelp ? { points: [{ text: suite.labelHelp }] } : null);
  const injection = isInjectionSuite(suite) ? suite : null;
  const parts = [
    guide && (
      <details
        key="guide"
        className="group rounded-lg border border-line bg-card"
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 text-sm font-medium">
          How to judge an answer
          <ChevronDown
            aria-hidden
            className="h-4 w-4 transition-transform group-open:rotate-180"
          />
        </summary>
        <div className="readable space-y-2 px-4 pb-4 text-sm">
          {guide.lead && <p className="font-medium">{guide.lead}</p>}
          {(() => {
            const items = guide.points.map((p, n) => (
              <li key={n}>
                {p.term && <strong>{p.term} </strong>}
                {p.text}
              </li>
            ));
            return guide.ordered ? (
              <ol className="list-decimal space-y-1 pl-5">{items}</ol>
            ) : (
              <ul className="list-disc space-y-1 pl-5">{items}</ul>
            );
          })()}
          {guide.note && <p className="text-muted">{guide.note}</p>}
        </div>
      </details>
    ),
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
    actions.draftMore && suite.draftMore && inUse.length > 0 && (
      <details
        key="draft"
        className="group rounded-lg border border-line bg-card"
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 text-sm font-medium">
          <span className="flex items-center gap-1.5">
            <Sparkles aria-hidden className="h-4 w-4" />
            Draft {draftsToTarget(inUse.length)} more cases
          </span>
          <ChevronDown
            aria-hidden
            className="h-4 w-4 transition-transform group-open:rotate-180"
          />
        </summary>
        <form action={actions.draftMore} className="space-y-3 px-4 pb-4">
          <input type="hidden" name="suite" value={key} />
          <div>
            <label htmlFor="draft-focus" className="block text-sm font-medium">
              Anything to focus on? (optional)
            </label>
            <TextInput
              id="draft-focus"
              name="focus"
              maxLength={500}
              placeholder="e.g. longer, messier notes; more than one owner"
              className="mt-1 w-full rounded-md border border-line bg-card px-3 py-2 text-sm"
            />
            <p className="readable mt-1 text-xs text-muted">
              A model looks at the cases you have and covers what&apos;s
              missing. Drafts need your review and count only once you confirm
              them.
            </p>
          </div>
          <Submit>Draft cases</Submit>
        </form>
      </details>
    ),
  ].filter(Boolean);
  if (!parts.length) return null;
  return <div className="space-y-3">{parts}</div>;
}
/** The answer key: the cases in use and their answers, with ways to add and rate them. */
export function AnswerKeySection({ data }: { data: SuitePageData }) {
  const { app, key, b, suite, rows, attackBoards } = data;
  // A feature's attack cases are a tab of its answer key.
  const attacked = attackBoards.filter((a) => a.cases > 0);
  const cases = (
    <AnswerKey
      app={app}
      suite={suite}
      rows={rows}
      heading={
        <h2 className="text-lg font-semibold">
          Answer key ({b.cases} cases in use)
          <InfoTip term="answerKey" />
        </h2>
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

/** "Free: all 16 reused" or "~$0.03, 4 of 16 reused", under a model's buttons. */
/**
 * Changing what a feature's suggestion favors: accuracy, speed, or cost.
 * It's saved as a new settings version, with an optional reason, so it
 * shows under Versions and can be rolled back.
 */
function PriorityControl({
  action,
  suite,
  favor,
  own,
}: {
  action: FormAction;
  suite: string;
  favor: SuitePriority["favor"];
  /** The suite's own priority, from its code. */
  own: SuitePriority["favor"];
}) {
  return (
    <details className="group relative text-sm font-normal">
      <summary className="cursor-pointer list-none text-accent hover:underline">
        Change
      </summary>
      <form
        action={action}
        className="absolute left-0 z-20 mt-2 w-72 space-y-3 rounded-md border border-line bg-card p-4 shadow-lg"
      >
        <input type="hidden" name="suite" value={suite} />
        <div>
          <label htmlFor="favor" className="block font-medium">
            Once accuracy holds, favor
          </label>
          <Select
            id="favor"
            name="favor"
            defaultValue={favor}
            className="mt-1 w-full rounded-md border border-line bg-card px-3 py-2"
          >
            {(["quality", "speed", "cost"] as const).map((f) => (
              <option key={f} value={f}>
                {CHOICES[f]}
                {f === own ? " (the suite's own)" : ""}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label htmlFor="favor-reason" className="block font-medium">
            Why? <span className="font-normal text-muted">(optional)</span>
          </label>
          <TextInput
            id="favor-reason"
            name="reason"
            maxLength={300}
            className="mt-1 w-full rounded-md border border-line bg-card px-3 py-2"
          />
        </div>
        <Submit>Save as a new version</Submit>
      </form>
    </details>
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
 * Keeping the answer key useful: easy cases to retire (a floor stays),
 * cases models split on and near-duplicates to check, old drafts, and
 * tags with a single case. Shows only what needs a look, and nothing on
 * an injection suite, whose cases are made from its base suite's.
 */
export function AnswerKeyHealthSection({ data }: { data: SuitePageData }) {
  const { app, key, suite, health: h, choosesHere } = data;
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
  const { retireEasy, retireStaleDrafts } = app.actions;
  const cases = (n: number) => `${n} ${n === 1 ? "case" : "cases"}`;
  const drafts = (n: number) => `${n} ${n === 1 ? "draft" : "drafts"}`;
  const { draftMore } = app.actions;
  const check = h.split.length > 0 || h.duplicates.length > 0;
  const retire = h.easyToRetire.length > 0 || h.staleDrafts.length > 0;
  return (
    <section className="space-y-3" aria-labelledby="answer-key-health">
      <h2 id="answer-key-health" className="text-lg font-semibold">
        Answer key health
        <InfoTip term="answerKeyHealth" />
      </h2>
      {/* What to do, in order: fix doubtful answers, fill thin spots, prune. */}
      <Card className="space-y-6 text-sm">
        {check && (
          <div className="readable space-y-3">
            <h3 className="font-medium">Check these answers</h3>
            {h.split.length > 0 && (
              <div className="space-y-1">
                <p>
                  Models split about evenly on {cases(h.split.length)}. That
                  usually means the answer key is wrong or the case has no clear
                  answer. Open each one: fix the answer, or retire the case if
                  there&apos;s no right one.
                  <InfoTip term="splitCases" />
                </p>
                <ul className="list-disc space-y-0.5 pl-5">
                  {h.split.map((c) => (
                    <li key={c.id}>{caseLink(c)}</li>
                  ))}
                </ul>
              </div>
            )}
            {h.duplicates.length > 0 && (
              <div className="space-y-1">
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
            <ul className="flex flex-wrap gap-1.5">
              {thin.map((t) => (
                <li key={t}>
                  <Chip tone="warn">{t}</Chip>
                </li>
              ))}
            </ul>
            {draftMore && suite.draftMore && (
              <form action={draftMore}>
                <input type="hidden" name="suite" value={key} />
                <input
                  type="hidden"
                  name="focus"
                  value={`Cases on these topics: ${thin.join(", ")}`.slice(
                    0,
                    500,
                  )}
                />
                <Submit variant="quiet">Draft cases for these topics</Submit>
              </form>
            )}
            <details className="group">
              <summary className="cursor-pointer text-muted">
                Show all topics
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
                  Every current model gets {cases(h.easy.length)} fully right,
                  so they no longer tell models apart. Retire{" "}
                  {h.easyToRetire.length} and keep{" "}
                  {h.easy.length - h.easyToRetire.length} as a floor, so a test
                  still catches a model that breaks the basics. Recent tests are
                  rescored for free.
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
      <ChosenOnBase data={data} />
      <SuggestionCard data={data} />
      <CasesInInstructions data={data} />
      <ModelTable data={data} />
      <TestSettingSection data={data} />
      <CheckBreakdownSection data={data} />
      <Versions data={data} />
      <ChecksSection data={data} />
      <AnswerKeyHealthSection data={data} />
      <AnswerKeyToolsSection data={data} />
      <AnswerKeySection data={data} />
    </div>
  );
}
