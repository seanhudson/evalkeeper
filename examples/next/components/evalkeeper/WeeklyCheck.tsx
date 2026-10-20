import Link from "next/link";
import { money, type WeeklySummary } from "@crowandraven/evalkeeper";
import { runWeeklyNow } from "@/lib/evalkeeper/actions";
import { RefreshWhile } from "./RefreshWhile";
import { Submit } from "./Submit";
import { InfoTip } from "./Tip";
import { Card, Chip, pct } from "./ui";
import { evalsPath } from "@/lib/evalkeeper/paths";

/**
 * The weekly check on the evals hub: when it last ran, what it found, and
 * a button to run it now. It only reports; a person decides what to change.
 */
export function WeeklyCheck({ weekly }: { weekly: WeeklySummary }) {
  return (
    <section aria-labelledby="weekly" className="space-y-3">
      <RefreshWhile active={weekly.running > 0} />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 id="weekly" className="text-lg font-semibold">
          Weekly check
          <InfoTip term="weeklyCheck" />
        </h2>
        <form action={runWeeklyNow}>
          <Submit variant="quiet">Run it now</Submit>
        </form>
      </div>
      <Card className="space-y-4">
        <p className="readable text-sm text-muted">
          {weekly.running > 0
            ? `Running now: ${weekly.running} quick set${weekly.running === 1 ? "" : "s"} left. `
            : weekly.lastAt
              ? `Last run ${weekly.lastAt.toLocaleDateString("en-US", { month: "long", day: "numeric" })}, ${money(weekly.costUsd)}. `
              : "Not run yet. "}
          Every Monday, each live model answers its suite&apos;s quick set
          again, so a quiet change by its provider shows up here. It also flags
          models retiring soon and features people rate poorly.
        </p>

        {weekly.clear && (
          <p className="readable text-sm text-good">
            All clear: no drift, no retirements within 60 days, and no feature
            with a high thumbs-down share.
          </p>
        )}

        {!weekly.clear && weekly.lastAt && (
          <ul className="readable space-y-2 text-sm">
            {weekly.drift.map((d) => (
              <li
                key={`drift-${d.suite}`}
                className="flex flex-wrap items-baseline gap-2"
              >
                <Chip tone="serious">Drift</Chip>
                <span>
                  <Link
                    href={evalsPath(d.suite)}
                    className="font-medium underline"
                  >
                    {d.label}
                  </Link>{" "}
                  on {d.model} fell from {pct(d.previous)} to {pct(d.latest)} on
                  its quick set. Test every model there to see if it&apos;s
                  real.
                </span>
              </li>
            ))}
            {weekly.failed.map((f) => (
              <li
                key={`failed-${f.suite}`}
                className="flex flex-wrap items-baseline gap-2"
              >
                <Chip tone="serious">Didn&apos;t finish</Chip>
                <span>
                  <Link
                    href={evalsPath(f.suite)}
                    className="font-medium underline"
                  >
                    {f.label}
                  </Link>
                  : <span className="text-muted">{f.error}</span>
                </span>
              </li>
            ))}
            {weekly.retiring.map((r) => (
              <li
                key={`retiring-${r.suite}-${r.role}`}
                className="flex flex-wrap items-baseline gap-2"
              >
                <Chip tone="warn">Retiring</Chip>
                <span>
                  {r.model}, the {r.role} model for{" "}
                  <Link
                    href={evalsPath(r.suite)}
                    className="font-medium underline"
                  >
                    {r.label}
                  </Link>
                  , retires {r.when}
                  {r.days < 0 ? " (already)" : ` (in ${r.days} days)`}. Pick
                  another on its suite page.
                </span>
              </li>
            ))}
            {weekly.thumbs.map((t) => (
              <li
                key={`thumbs-${t.operation}`}
                className="flex flex-wrap items-baseline gap-2"
              >
                <Chip tone="warn">Thumbs down</Chip>
                <span>
                  {t.operation}: {t.down} of {t.up + t.down} ratings this week.{" "}
                  <Link href={evalsPath("feedback")} className="underline">
                    Read the reasons
                  </Link>
                  .
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}
