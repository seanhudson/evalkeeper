import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  checkBar,
  perAnswer,
  seconds,
  verdictSentence,
  type Rate,
  type RunRecord,
} from "@crowandraven/evalkeeper";
import { DisagreementChip } from "@/components/evalkeeper/DisagreementChip";
import { Submit } from "@/components/evalkeeper/Submit";
import { InfoTip, Tip } from "@/components/evalkeeper/Tip";
import { BackLink, Card, Chip, pct } from "@/components/evalkeeper/ui";
import {
  MODELS,
  SUITE_BY_KEY,
  requireAdmin,
  routeFor,
  runner,
  store,
} from "@/lib/evalkeeper";
import { evalsPath } from "@/lib/evalkeeper/paths";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ suite: string }>;
}): Promise<Metadata> {
  const { suite } = await params;
  return { title: `Compare: ${SUITE_BY_KEY[suite]?.label ?? "Evals"}` };
}

/** A search parameter as one string, or null when it's missing or repeated. */
const one = (v: string | string[] | undefined) =>
  typeof v === "string" && v ? v : null;

/** A test's name: its model, reasoning setting, set, and when it ran. */
function testName(r: RunRecord): string {
  const model = MODELS[r.model]?.label ?? r.model;
  const effort = r.reasoningEffort ? `, ${r.reasoningEffort} reasoning` : "";
  const set = r.set === "ALL" ? "" : `, ${r.set.toLowerCase()} set`;
  return `${model}${effort}${set} · ${r.startedAt.toLocaleString()}`;
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
export default async function ComparePage({
  params,
  searchParams,
}: {
  params: Promise<{ suite: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const { suite: key } = await params;
  const sp = await searchParams;
  const suiteDef = SUITE_BY_KEY[key];
  if (!suiteDef) notFound();
  const runs = await store.listRuns(key, { status: "SUCCEEDED" });
  const b = one(sp.b);
  // Without a test in place, the live model's latest finished test.
  let a = one(sp.a);
  if (!a) {
    // A feature with no settings yet has no live model to start from.
    const live = await routeFor(suiteDef.operation).then(
      (r) => r.model,
      () => null,
    );
    a = runs.find((r) => r.model === live && r.id !== b)?.id ?? null;
  }
  const result = a && b ? await runner.compare(key, a, b) : null;
  const titles = new Map(
    (await store.listCases(key, { includeRetired: true })).map((c) => [
      c.id,
      suiteDef.title(suiteDef.input.parse(c.input)),
    ]),
  );
  const sideBySide = (caseId: string) =>
    result
      ? `${evalsPath(key, "side-by-side")}?${new URLSearchParams({ a: result.a.id, b: result.b.id, case: caseId })}`
      : "";

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <BackLink href={evalsPath(key)}>{suiteDef.label}</BackLink>
        <h1 className="text-2xl font-semibold">
          Compare two tests
          <InfoTip term="comparison" />
        </h1>
        <p className="readable text-muted">
          Pick the test in place and a challenger. Only finished tests of{" "}
          {suiteDef.label} can be compared.
        </p>
      </div>

      <Card>
        {/* Keyed by the tests, so the pickers show them after a swap. */}
        <form
          key={`${a ?? ""}-${b ?? ""}`}
          action={evalsPath(key, "compare")}
          className="grid items-end gap-4 md:grid-cols-[1fr_1fr_auto]"
        >
          <TestPicker
            name="a"
            label="In place"
            term="inPlace"
            runs={runs}
            value={a}
          />
          <TestPicker
            name="b"
            label="Challenger"
            term="challenger"
            runs={runs}
            value={b}
          />
          <div className="pb-1">
            <Submit>Compare</Submit>
          </div>
        </form>
      </Card>

      {a && b && !result && (
        <p className="readable text-warn">
          These can&apos;t be compared: pick two different finished tests of
          this suite.
        </p>
      )}
      {runs.length < 2 && (
        <p className="readable text-muted">
          This suite needs two finished tests to compare. Test another model on
          the suite page first.
        </p>
      )}

      {result && (
        <>
          <Card className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h2 className="font-semibold">
                Verdict
                <InfoTip term="verdict" />
              </h2>
              <Link
                href={`${evalsPath(key, "compare")}?${new URLSearchParams({ a: result.b.id, b: result.a.id })}`}
                className="text-sm text-muted hover:text-ink"
              >
                Swap them
              </Link>
            </div>
            <p className="readable text-lg">
              {verdictSentence(
                result.comparison,
                MODELS[result.b.model]?.label ?? result.b.model,
              )}
            </p>
            <p className="readable text-sm text-muted">
              <Link href={evalsPath(key, "runs", result.a.id)}>
                {testName(result.a)}
              </Link>{" "}
              (in place) against{" "}
              <Link href={evalsPath(key, "runs", result.b.id)}>
                {testName(result.b)}
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
                  Cost per answer: {perAnswer(result.comparison.cost.champion)}{" "}
                  in place, {perAnswer(result.comparison.cost.challenger)}{" "}
                  challenger
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
                                  c.severity === "serious"
                                    ? "serious"
                                    : "neutral"
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
                  className="text-sm text-accent"
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
                      className="font-medium hover:underline"
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
      )}
    </div>
  );
}

/** One of the two tests to compare, chosen from the suite's finished tests. */
function TestPicker({
  name,
  label,
  term,
  runs,
  value,
}: {
  name: string;
  label: string;
  term: "inPlace" | "challenger";
  runs: RunRecord[];
  value: string | null;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={`pick-${name}`} className="block text-sm font-medium">
        {label}
        <InfoTip term={term} id={`${term}-pick`} />
      </label>
      <select
        id={`pick-${name}`}
        name={name}
        defaultValue={value ?? ""}
        required
        className="w-full rounded-md border border-line bg-card px-3 py-2 text-sm focus:border-accent focus:outline-none"
      >
        <option value="" disabled>
          Pick a test
        </option>
        {runs.map((r) => (
          <option key={r.id} value={r.id}>
            {testName(r)}
          </option>
        ))}
      </select>
    </div>
  );
}
