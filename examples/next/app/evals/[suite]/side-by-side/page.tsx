import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Minus, X } from "lucide-react";
import {
  aroundCase,
  type AnySuite,
  type CheckResult,
  type OutputRecord,
  type RunRecord,
} from "@crowandraven/evalkeeper";
import { DisagreementChip } from "@/components/evalkeeper/DisagreementChip";
import { FieldValues } from "@/components/evalkeeper/Fields";
import { InfoTip, Tip } from "@/components/evalkeeper/Tip";
import { BackLink, Card, pct } from "@/components/evalkeeper/ui";
import { MODELS, requireAdmin, runner, store } from "@/lib/evalkeeper";
import { evalsPath } from "@/lib/evalkeeper/paths";

export const dynamic = "force-dynamic";

/** A search parameter as one string, or null when it's missing or repeated. */
const one = (v: string | string[] | undefined) =>
  typeof v === "string" && v ? v : null;

/**
 * Two tests' answers to one case, side by side with the expected answer
 * and what each check found, and previous and next through the cases the
 * two graded differently. `a` is the test in place, `b` the challenger,
 * and `case` the case (the first disagreement when left out).
 */
export default async function SideBySidePage({
  params,
  searchParams,
}: {
  params: Promise<{ suite: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const { suite: key } = await params;
  const sp = await searchParams;
  const a = one(sp.a);
  const b = one(sp.b);
  if (!a || !b) notFound();
  const result = await runner.compare(key, a, b);
  if (!result) notFound();
  const { suite, disagreements } = result;
  const caseId = one(sp.case) ?? disagreements[0]?.caseId ?? null;
  const compareHref = `${evalsPath(key, "compare")}?${new URLSearchParams({ a, b })}`;
  const back = <BackLink href={compareHref}>Compare</BackLink>;
  if (!caseId)
    return (
      <div className="space-y-4">
        {back}
        <h1 className="text-2xl font-semibold">Side by side</h1>
        <p className="readable text-muted">
          The two tests graded every shared case alike: there&apos;s nothing to
          read side by side.
        </p>
      </div>
    );

  const [cases, outA, outB] = await Promise.all([
    store.listCases(key, { includeRetired: true }),
    store.listOutputs(a),
    store.listOutputs(b),
  ]);
  const c = cases.find((x) => x.id === caseId);
  if (!c) notFound();
  const input = suite.input.parse(c.input);
  const expected =
    c.labels.find((l) => l.status === "CONFIRMED") ??
    c.labels.find((l) => l.status === "PROVISIONAL");
  const here = aroundCase(disagreements, caseId);
  const d = disagreements[here.index];
  const to = (id: string) =>
    `${evalsPath(key, "side-by-side")}?${new URLSearchParams({ a, b, case: id })}`;
  const byRepeat = (os: OutputRecord[]) =>
    os.filter((o) => o.caseId === caseId).sort((x, y) => x.repeat - y.repeat);

  return (
    <div className="space-y-6">
      {back}
      <div className="space-y-2">
        <p className="text-sm text-muted">
          Side by side
          <InfoTip term="sideBySide" />
          {" · "}
          {suite.label}
        </p>
        <h1 className="text-2xl font-semibold">{suite.title(input)}</h1>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-sm text-muted">
            {d ? (
              <>
                <DisagreementChip kind={d.kind} id="kind" />
                <Tip term="disagreements" id="position">
                  <span>
                    {here.index + 1} of {disagreements.length} where they differ
                  </span>
                </Tip>
              </>
            ) : (
              <span>Both tests graded this case alike.</span>
            )}
          </span>
          <nav aria-label="Cases where they differ" className="flex gap-2">
            {here.previous ? (
              <StepLink href={to(here.previous)} dir="previous" />
            ) : (
              <StepLink dir="previous" />
            )}
            {here.next ? (
              <StepLink href={to(here.next)} dir="next" />
            ) : (
              <StepLink dir="next" />
            )}
          </nav>
        </div>
      </div>

      <Card className="grid gap-5 text-sm md:grid-cols-2">
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
            Input
          </h2>
          {suite.fields ? (
            <FieldValues
              fields={suite.fields.input}
              values={c.input}
              prefix="in-"
            />
          ) : (
            <pre className="readable whitespace-pre-wrap text-xs">
              {suite.describe?.(input) ?? JSON.stringify(c.input, null, 2)}
            </pre>
          )}
        </section>
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
            Expected answer
            <InfoTip term="expectedAnswer" />
          </h2>
          {!expected ? (
            <p className="readable text-muted">No answer in use.</p>
          ) : suite.fields ? (
            <FieldValues
              fields={suite.fields.label}
              values={expected.value}
              prefix="expected-"
            />
          ) : (
            <pre className="readable whitespace-pre-wrap text-xs">
              {JSON.stringify(expected.value, null, 2)}
            </pre>
          )}
        </section>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Side
          role="inPlace"
          run={result.a}
          outputs={byRepeat(outA)}
          suite={suite}
          score={d?.champion ?? null}
          runHref={evalsPath(key, "runs", a)}
        />
        <Side
          role="challenger"
          run={result.b}
          outputs={byRepeat(outB)}
          suite={suite}
          score={d?.challenger ?? null}
          runHref={evalsPath(key, "runs", b)}
        />
      </div>
    </div>
  );
}

/** A link to the previous or next disagreement, or a dimmed one at either end. */
function StepLink({ href, dir }: { href?: string; dir: "previous" | "next" }) {
  const label = dir === "previous" ? "Previous" : "Next";
  const body =
    dir === "previous" ? (
      <>
        <ArrowLeft aria-hidden className="h-4 w-4" />
        {label}
      </>
    ) : (
      <>
        {label}
        <ArrowRight aria-hidden className="h-4 w-4" />
      </>
    );
  const cls =
    "inline-flex items-center gap-1 rounded-md border border-line px-3 py-1.5 text-sm";
  return href ? (
    <Link href={href} className={`${cls} hover:bg-tint`}>
      {body}
    </Link>
  ) : (
    <span aria-disabled="true" className={`${cls} text-muted opacity-60`}>
      {body}
    </span>
  );
}

/** One test's answers to the case, with what each check found. */
function Side({
  role,
  run,
  outputs,
  suite,
  score,
  runHref,
}: {
  role: "inPlace" | "challenger";
  run: RunRecord;
  outputs: OutputRecord[];
  suite: AnySuite;
  score: number | null;
  runHref: string;
}) {
  const label = (k: string) =>
    suite.checks.find((x) => x.key === k)?.label ?? k;
  return (
    <Card className="space-y-4 text-sm">
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          {role === "inPlace" ? "In place" : "Challenger"}
          <InfoTip term={role} id={`${role}-side`} />
        </p>
        <h2 className="text-lg font-semibold">
          <Link href={runHref} className="hover:underline">
            {MODELS[run.model]?.label ?? run.model}
          </Link>
        </h2>
        {score !== null && (
          <Tip term="caseScore" id={`${role}-score`}>
            <span className="text-muted">Scored {pct(score)} on this case</span>
          </Tip>
        )}
      </div>
      {outputs.length === 0 && (
        <p className="readable text-muted">This test has no answer here.</p>
      )}
      {outputs.map((o) => {
        const checks: CheckResult[] = o.scores ?? [];
        return (
          <section key={o.id} className="space-y-3 rounded-md bg-tint p-3">
            {outputs.length > 1 && (
              <p className="text-xs text-muted">Repeat {o.repeat + 1}</p>
            )}
            {o.error ? (
              <p className="readable text-bad">No answer: {o.error}</p>
            ) : suite.fields && suite.labelFromOutput ? (
              <FieldValues
                fields={suite.fields.label}
                values={suite.labelFromOutput(o.output)}
                prefix={`${role}-${o.repeat}-`}
              />
            ) : (
              <pre className="readable whitespace-pre-wrap text-xs">
                {JSON.stringify(o.output, null, 2)}
              </pre>
            )}
            {checks.length > 0 && (
              <ul className="space-y-1">
                {checks.map((x) => (
                  <li key={x.key} className="flex items-start gap-1.5">
                    {x.pass === null ? (
                      <Minus
                        aria-label="Doesn't apply"
                        className="mt-0.5 h-4 w-4 shrink-0 text-muted"
                      />
                    ) : x.pass ? (
                      <Check
                        aria-label="Passed"
                        className="mt-0.5 h-4 w-4 shrink-0 text-good"
                      />
                    ) : (
                      <X
                        aria-label="Failed"
                        className="mt-0.5 h-4 w-4 shrink-0 text-warn"
                      />
                    )}
                    <span className="readable">
                      {label(x.key)}
                      {x.note && <span className="text-muted">: {x.note}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </Card>
  );
}
