import { evalsPath, type EvalAppConfig } from "./app.js";
import { BackLink, Card, Chip, InfoTip, Link, Tip } from "./pieces.js";
import { pct, momentOf, LINK } from "./format.js";
import {
  checkBar,
  perAnswer,
  seconds,
  verdictSentence,
  type Rate,
  type RunRecord,
  type ModelCatalog,
} from "../index.js";
import { DisagreementChip } from "./DisagreementChip.js";

/** A search parameter as one string, or null when it's missing or repeated. */
const one = (v: string | string[] | undefined) =>
  typeof v === "string" && v ? v : null;

/** A test's name: its model, reasoning setting, set, and when it ran. */
function testName(models: ModelCatalog, r: RunRecord): string {
  const model = models[r.model]?.label ?? r.model;
  const effort = r.reasoningEffort ? `, ${r.reasoningEffort} reasoning` : "";
  const set = r.set === "ALL" ? "" : `, ${r.set.toLowerCase()} set`;
  return `${model}${effort}${set} · ${momentOf(r.startedAt)}`;
}

/** A pass rate as "80% (8/10)", or a dash when the check never applied. */
function rateText(r: Rate | undefined): string {
  return r && r.n > 0 ? `${pct(r.passed / r.n)} (${r.passed}/${r.n})` : "—";
}

/**
 * Two finished tests of a suite compared: the verdict in plain words, each
 * check's pass rate side by side, and the cases they graded differently,
 * each linked to its answers side by side. `a` is the test in place (the
 * live model's latest when left out), `b` the challenger.
 */

/** Two tests of a suite compared: the verdict, each check, and the cases they graded differently. Null when it doesn't exist. */
export async function CompareView({
  app,
  suite: key,
  search,
}: {
  /** Your screens' configuration. */
  app: EvalAppConfig;
  suite: string;
  search: Record<string, string | string[] | undefined>;
}) {
  const sp = search;
  const suiteDef = app.suiteByKey[key];
  if (!suiteDef) return null;
  // Opened from an "Against live" verdict: the test in place and the
  // challenger, both finished tests of this suite.
  const a = one(sp.a);
  const b = one(sp.b);
  if (!a || !b) return null;
  const result = await app.runner.compare(key, a, b);
  if (!result) return null;
  const titles = new Map(
    (await app.store.listCases(key, { includeRetired: true })).map((c) => [
      c.id,
      suiteDef.title(suiteDef.input.parse(c.input)),
    ]),
  );
  const sideBySide = (caseId: string) =>
    `${evalsPath(app, key, "side-by-side")}?${new URLSearchParams({ a: result.a.id, b: result.b.id, case: caseId })}`;

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <BackLink href={evalsPath(app, key)}>{suiteDef.label}</BackLink>
        <h1 className="text-2xl font-semibold">
          {app.models[result.b.model]?.label ?? result.b.model} against{" "}
          {app.models[result.a.model]?.label ?? result.a.model}
          <InfoTip term="comparison" />
        </h1>
      </div>

      <>
        <Card className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h2 className="font-semibold">
              Verdict
              <InfoTip term="verdict" />
            </h2>
          </div>
          <p className="readable text-lg">
            {verdictSentence(
              result.comparison,
              app.models[result.b.model]?.label ?? result.b.model,
            )}
          </p>
          <p className="readable text-sm text-muted">
            <Link
              href={evalsPath(app, key, "runs", result.a.id)}
              className={LINK}
            >
              {testName(app.models, result.a)}
            </Link>{" "}
            (in place) against{" "}
            <Link
              href={evalsPath(app, key, "runs", result.b.id)}
              className={LINK}
            >
              {testName(app.models, result.b)}
            </Link>{" "}
            (challenger), on{" "}
            <Tip term="sharedCases">
              <span>{result.comparison.n} shared cases</span>
            </Tip>
            .
          </p>
          <p className="text-sm text-muted">
            <Tip term="cost" id="cost-compare">
              <span>
                Cost per answer: {perAnswer(result.comparison.cost.champion)} in
                place, {perAnswer(result.comparison.cost.challenger)} challenger
              </span>
            </Tip>
            {" · "}
            <Tip term="time" id="time-compare" align="end">
              <span>
                Time: {seconds(result.comparison.avgMs.champion)} in place,{" "}
                {seconds(result.comparison.avgMs.challenger)} challenger
              </span>
            </Tip>
          </p>
          {result.caveats.length > 0 && (
            <div className="readable rounded-md bg-tint p-3 text-sm">
              <p className="font-medium">
                Measured differently
                <InfoTip term="measuredDifferently" />
              </p>
              <ul className="list-disc pl-5 text-muted">
                {result.caveats.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">
            Checks
            <InfoTip term="checks" />
          </h2>
          <Card className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="text-left text-muted">
                <tr className="border-b border-line">
                  <th className="p-3 font-normal">Check</th>
                  <th className="p-3 font-normal">
                    <Tip term="inPlace" side="bottom" id="inPlace-col">
                      In place
                    </Tip>
                  </th>
                  <th className="p-3 font-normal">
                    <Tip term="challenger" side="bottom" id="challenger-col">
                      Challenger
                    </Tip>
                  </th>
                  <th className="p-3 font-normal">
                    <Tip term="bar" side="bottom" align="end">
                      Bar
                    </Tip>
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.suite.checks.map((c) => {
                  const r = result.comparison.byCheck[c.key];
                  return (
                    <tr
                      key={c.key}
                      className="border-b border-line last:border-0"
                    >
                      <td className="p-3">
                        <span className="flex flex-wrap items-center gap-2">
                          {c.label}
                          <Tip
                            term={c.severity}
                            id={`severity-${c.key}`}
                            side="bottom"
                          >
                            <Chip
                              tone={
                                c.severity === "serious" ? "serious" : "neutral"
                              }
                            >
                              {c.severity}
                            </Chip>
                          </Tip>
                        </span>
                      </td>
                      <td className="p-3 tabular-nums">
                        <Tip term="passRate" id={`a-${c.key}`} side="bottom">
                          <span>{rateText(r?.champion)}</span>
                        </Tip>
                      </td>
                      <td className="p-3 tabular-nums">
                        <Tip term="passRate" id={`b-${c.key}`} side="bottom">
                          <span>{rateText(r?.challenger)}</span>
                        </Tip>
                      </td>
                      <td className="p-3 tabular-nums text-muted">
                        {pct(checkBar(c))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </section>

        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">
              Where they differ ({result.disagreements.length})
              <InfoTip term="disagreements" />
            </h2>
            {result.disagreements[0] && (
              <Link
                href={sideBySide(result.disagreements[0].caseId)}
                className={`text-sm ${LINK}`}
              >
                Read them side by side
              </Link>
            )}
          </div>
          {result.disagreements.length === 0 ? (
            <p className="readable text-muted">
              The two tests graded every shared case alike.
            </p>
          ) : (
            <Card className="space-y-2">
              {result.disagreements.map((d) => (
                <div
                  key={d.caseId}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-tint p-3 text-sm"
                >
                  <Link
                    href={sideBySide(d.caseId)}
                    className={`font-medium ${LINK}`}
                  >
                    {titles.get(d.caseId) ?? "A retired case"}
                  </Link>
                  <span className="flex items-center gap-3">
                    <Tip term="caseScore" id={`score-${d.caseId}`}>
                      <span className="text-xs text-muted tabular-nums">
                        {pct(d.champion)} → {pct(d.challenger)}
                      </span>
                    </Tip>
                    <DisagreementChip
                      kind={d.kind}
                      id={`kind-${d.caseId}`}
                      align="end"
                    />
                  </span>
                </div>
              ))}
            </Card>
          )}
        </section>
      </>
    </div>
  );
}
