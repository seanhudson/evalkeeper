import Link from "next/link";
import {
  FAVOR_TEXT,
  attackMistakes,
  attacksFrom,
  checkBar,
  isInjectionSuite,
  meanCalibrationError,
  money,
  probabilityQuality,
  perAnswer,
  retiresLabel,
  seconds,
  seriousMistakes,
  suggest,
} from "@crowandraven/evalkeeper";
import { AnswerKey } from "@/components/evalkeeper/AnswerKey";
import { IconSubmit, Spinner, Submit } from "@/components/evalkeeper/Submit";
import { RotateCw } from "lucide-react";
import { BackLink, Card, Chip, Score, pct } from "@/components/evalkeeper/ui";
import {
  answerEditors,
  MODELS,
  runner,
  settings,
  SUITE_BY_KEY,
} from "@/lib/evalkeeper";
import { SettingsHistory } from "@/components/evalkeeper/SettingsHistory";
import {
  makeFallback,
  makeLive,
  rescore,
  testAll,
  testModel,
  useSuggestion,
} from "@/lib/evalkeeper/actions";
import { InfoTip, Tip } from "@/components/evalkeeper/Tip";
import { EVALS_BASE, evalsPath } from "@/lib/evalkeeper/paths";

/**
 * Everything a suite's page shows, loaded together: on a remote database
 * each read waits on round trips, so one after the other multiplies the
 * wait. Null for a suite that doesn't exist. Sections read from this, so a
 * page that arranges them its own way loads the same data once.
 *
 * @param key - The suite's key.
 */
export async function loadSuitePage(key: string) {
  const operation = SUITE_BY_KEY[key]?.operation;
  if (!operation) return null;
  const [b, attackBoards, [history, liveSettings], inInstructions] =
    await Promise.all([
      runner.board(key),
      // Injection suites that attack this feature: their results count here.
      runner.attackBoards(key),
      // Records a deploy if the instructions changed under the live
      // settings, before reading them.
      settings
        .syncPrompt(operation)
        .then(() =>
          Promise.all([
            settings.history(operation),
            settings.current(operation),
          ]),
        ),
      runner.casesInInstructions(key),
    ]);
  const { suite, rows } = b;
  const attacks = attacksFrom(attackBoards);
  // An injection suite's models are chosen on its base suite's page.
  const choosesHere = !isInjectionSuite(suite);
  const s = choosesHere
    ? suggest(rows, suite.checks, suite.priority, MODELS, { attacks })
    : null;
  const testing =
    rows.some((r) => r.testing) ||
    attackBoards.some((a) => a.rows.some((r) => r.testing));
  // What testing each model would cost now, counting answers it would reuse.
  const estimates = new Map(
    await Promise.all(
      rows.map(
        async (r) =>
          [
            r.key,
            await runner.estimateRun(key, r.model, "ALL", 1, {
              reasoningEffort: r.effort,
            }),
          ] as const,
      ),
    ),
  );
  // What testing each untested model against the attacks would cost.
  const attackEstimates = new Map(
    await Promise.all(
      attackBoards.flatMap((a) =>
        rows
          .filter((r) => !r.variant)
          .map(
            async (r) =>
              [
                `${a.suite.key}|${r.key}`,
                await runner.estimateRun(a.suite.key, r.model, "ALL", 1),
              ] as const,
          ),
      ),
    ),
  );
  const live = rows.find((r) => r.live);

  return {
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
    attackEstimates,
    live,
  };
}

/** What `loadSuitePage` returns, for sections and custom pages. */
export type SuitePageData = NonNullable<
  Awaited<ReturnType<typeof loadSuitePage>>
>;

/** A share as a whole percent, or a dash when there's nothing to show. */
const asPct = (x: number | null) => (x === null ? "—" : pct(x));

const VS: Record<string, string> = {
  BETTER: "More accurate",
  SAME: "About as accurate",
  WORSE: "Less accurate",
  TOO_FEW: "Too few cases to tell",
};

/** The suite's name, what it tests, and its priority. */
export function SuiteHeader({ data }: { data: SuitePageData }) {
  const { suite } = data;
  return (
    <>
      <div className="space-y-2">
        <BackLink href={EVALS_BASE}>Evals</BackLink>
        <h1 className="text-2xl font-semibold">{suite.label}</h1>
        <p className="readable text-muted">{suite.description}</p>
        <p className="readable text-sm text-muted">
          Priority: {FAVOR_TEXT[suite.priority.favor]}.
          <InfoTip term="priority" />
        </p>
      </div>
    </>
  );
}

/** On an injection suite: models are chosen on its base suite, with a link there. */
export function ChosenOnBase({ data }: { data: SuitePageData }) {
  const { suite } = data;
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
            choice of model serves both. Its results show there as Under attack,
            and the suggestion there never picks a model with more serious
            mistakes under attack than live.
          </p>
          <Link
            href={evalsPath(suite.base.key)}
            className="inline-block text-sm text-accent hover:underline"
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
  const { key, s } = data;
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
                <form action={useSuggestion}>
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
    key,
    suite,
    rows,
    attackBoards,
    choosesHere,
    estimates,
    attackEstimates,
    live,
  } = data;
  return (
    <>
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">Models</h2>
          <div className="flex items-center gap-4">
            <Link
              href={evalsPath(key, "compare")}
              className="text-sm text-muted hover:text-ink"
            >
              Compare two tests
            </Link>
            <form action={testAll}>
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
                    Score
                  </Tip>
                </th>
                <th className="p-3 font-normal">
                  <Tip term="seriousMistakes" side="bottom">
                    Serious mistakes
                  </Tip>
                </th>
                {attackBoards.length > 0 && (
                  <th className="p-3 font-normal">
                    <Tip term="underAttack" side="bottom">
                      Under attack
                    </Tip>
                  </th>
                )}
                <th className="p-3 font-normal">
                  <Tip term="time" side="bottom" align="end">
                    Time
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
                      {suite.decisions && MODELS[r.model]?.decisions && (
                        <Tip
                          term={
                            MODELS[r.model]?.decisions === "native"
                              ? "nativeProbabilities"
                              : "promptedProbabilities"
                          }
                          side="bottom"
                          id={`decisions-${r.key}`}
                        >
                          <Chip tone="neutral">
                            {MODELS[r.model]?.decisions === "native"
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
                      <Link href={evalsPath(key, "runs", r.test.runId)}>
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
                  {attackBoards.length > 0 && (
                    <td className="p-3">
                      <div className="flex flex-col gap-1">
                        {attackBoards.map((a) => (
                          <UnderAttack
                            key={a.suite.key}
                            attackSuite={a.suite.key}
                            attackLabel={a.suite.label}
                            row={a.rows.find((x) => x.key === r.key)}
                            mistakes={attackMistakes(r.key, attacksFrom([a]))}
                            model={r.model}
                            variant={r.variant}
                            estimate={attackEstimates.get(
                              `${a.suite.key}|${r.key}`,
                            )}
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
                        href={`${evalsPath(key, "compare")}?${new URLSearchParams({ a: live.test.runId, b: r.test.runId })}`}
                      >
                        {VS[r.vsLive]}
                      </Link>
                    ) : r.vsLive ? (
                      VS[r.vsLive]
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex flex-col items-end gap-0.5">
                      <div className="flex justify-end gap-2">
                        {choosesHere && r.canMakeFallback && (
                          <form action={makeFallback}>
                            <input type="hidden" name="suite" value={key} />
                            <input type="hidden" name="model" value={r.model} />
                            <Submit variant="quiet">Make fallback</Submit>
                          </form>
                        )}
                        {choosesHere && !r.live && r.canMakeLive && (
                          <form action={makeLive}>
                            <input type="hidden" name="suite" value={key} />
                            <input type="hidden" name="model" value={r.model} />
                            <Submit variant="quiet">Make live</Submit>
                          </form>
                        )}
                        <form action={testModel}>
                          <input type="hidden" name="suite" value={key} />
                          <input type="hidden" name="model" value={r.model} />
                          <Tip
                            control
                            id={`test-${r.key}`}
                            text={
                              r.test
                                ? "Test this model again on every case in use."
                                : "Test this model on every case in use."
                            }
                            side="bottom"
                            align="end"
                          >
                            <IconSubmit
                              label="Test"
                              icon={
                                <RotateCw aria-hidden className="h-4 w-4" />
                              }
                            />
                          </Tip>
                        </form>
                      </div>
                      <EstimateNote
                        id={r.key}
                        estimate={estimates.get(r.key)}
                      />
                      {r.test && !r.test.stale && r.test.failedAnswers > 0 && (
                        <span className="text-right text-xs text-muted">
                          {r.test.failedAnswers}{" "}
                          {r.test.failedAnswers === 1 ? "answer" : "answers"}{" "}
                          failed on its last test
                        </span>
                      )}
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

/** The feature's settings history, with rollback; not on an injection suite. */
export function Versions({ data }: { data: SuitePageData }) {
  const { key, history, liveSettings, choosesHere } = data;
  return (
    <>
      {choosesHere && (
        <SettingsHistory
          suite={key}
          entries={history}
          liveId={liveSettings.version?.id ?? null}
          label={(m) => MODELS[m]?.label ?? m}
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
          {suite.checks.map((c) => {
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
                        {pct(rate.passed / rate.n)}
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

/** The answer key: the cases in use and their answers, with ways to add and rate them. */
export function AnswerKeySection({ data }: { data: SuitePageData }) {
  const { key, b, suite, rows } = data;
  return (
    <>
      {/* The weekly check links here to review drafts. */}
      <section id="answer-key" className="scroll-mt-4 space-y-3">
        <AnswerKey
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
                (suite.labelFromForm || answerEditors[key]) && (
                  <Tip control term="rateBlind" side="bottom" align="end">
                    <Link
                      href={evalsPath(key, "rate")}
                      className="inline-flex items-center rounded-md border border-accent/40 bg-card px-3 py-1.5 text-sm text-accent hover:bg-accent/10"
                    >
                      Rate blind
                    </Link>
                  </Tip>
                )}
              <form action={rescore}>
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
      </section>
    </>
  );
}

/** "Free: all 16 reused" or "~$0.03, 4 of 16 reused", under a model's buttons. */
function EstimateNote({
  id,
  estimate,
}: {
  id: string;
  estimate:
    { answers: number; reused: number; costUsd: number | null } | undefined;
}) {
  if (!estimate || estimate.answers === 0) return null;
  const { answers, reused, costUsd } = estimate;
  const text =
    reused === answers
      ? `Free: all ${answers} reused`
      : `${costUsd === null ? "Cost unknown" : `~${money(costUsd)}`}${reused ? `, ${reused} of ${answers} reused` : ""}`;
  return (
    <Tip
      text="What testing this model costs now. Answers an identical request gave in the last 7 days are reused for free."
      id={`estimate-${id}`}
      side="bottom"
      align="end"
    >
      <span className="whitespace-nowrap text-xs text-muted">{text}</span>
    </Tip>
  );
}

/**
 * A model's serious mistakes on one injection suite, linked to that test,
 * or a button to test it there. Out of date and failed tests say so: the
 * suggestion counts only current, complete ones.
 */
function UnderAttack({
  attackSuite,
  attackLabel,
  row,
  mistakes,
  model,
  variant,
  estimate,
}: {
  attackSuite: string;
  attackLabel: string;
  row:
    | {
        key: string;
        testing: boolean;
        test: { runId: string; stale: boolean; failedAnswers: number } | null;
      }
    | undefined;
  mistakes: number | null;
  model: string;
  variant: boolean;
  estimate:
    { answers: number; reused: number; costUsd: number | null } | undefined;
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
        href={evalsPath(attackSuite, "runs", row.test.runId)}
        title={attackLabel}
        className="tabular-nums"
      >
        {mistakes ?? "—"}
        {row.test.stale
          ? " · out of date"
          : row.test.failedAnswers
            ? " · answers failed"
            : ""}
      </Link>
    );
  // Settings rows are tested on the base suite only.
  if (variant) return <span className="text-muted">—</span>;
  return (
    <form action={testModel} className="flex flex-col items-start gap-0.5">
      <input type="hidden" name="suite" value={attackSuite} />
      <input type="hidden" name="model" value={model} />
      <Tip
        control
        id={`attack-${attackSuite}-${row?.key ?? model}`}
        text={`Test this model on ${attackLabel}, every attack case in use.`}
        side="bottom"
      >
        <Submit variant="quiet">Test attacks</Submit>
      </Tip>
      <EstimateNote id={`attack-${attackSuite}-${model}`} estimate={estimate} />
    </form>
  );
}
