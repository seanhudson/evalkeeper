import { money, type WeeklySummary } from "../index.js";
import {
  Card,
  Chip,
  InfoTip,
  Link,
  RefreshWhile,
  Spinner,
  Submit,
  Tip,
  LocalDate,
} from "./pieces.js";
import { pct, LINK } from "./format.js";
import { evalsPath, type EvalAppConfig } from "./app.js";

/**
 * The weekly check on the evals hub: when it last ran, what it found, and
 * a button to run it now. It only reports; a person decides what to change.
 */
export function WeeklyCheck({
  app,
  weekly,
}: {
  /** Your screens' configuration. */
  app: EvalAppConfig;
  weekly: WeeklySummary;
}) {
  return (
    <section aria-labelledby="weekly" className="space-y-3">
      <RefreshWhile active={weekly.running > 0} />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 id="weekly" className="text-lg font-semibold">
          Weekly check
          <InfoTip term="weeklyCheck" />
        </h2>
        {weekly.running > 0 ? (
          <span
            role="status"
            className="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-muted"
          >
            <Spinner />
            Running
          </span>
        ) : (
          <form action={app.actions.runWeeklyNow}>
            <Submit variant="quiet">Run it now</Submit>
          </form>
        )}
      </div>
      <Card className="space-y-4">
        <p className="readable text-sm text-muted">
          {weekly.running > 0 ? (
            `Running now: ${weekly.running} quick set${weekly.running === 1 ? "" : "s"} left. `
          ) : weekly.lastAt ? (
            <>
              Last run <LocalDate date={weekly.lastAt} />,{" "}
              {money(weekly.costUsd)}.{" "}
            </>
          ) : (
            "Not run yet. "
          )}
          Every Monday, each live model answers its suite&apos;s quick set
          again, so a quiet change by its provider shows up here. It also flags
          models retiring soon and features people rate poorly. Suites that can
          draft cases from the week&apos;s activity add a few for you to review.
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
                    href={evalsPath(app, d.suite)}
                    className={`font-medium ${LINK}`}
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
                    href={evalsPath(app, f.suite)}
                    className={`font-medium ${LINK}`}
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
                    href={evalsPath(app, r.suite)}
                    className={`font-medium ${LINK}`}
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
                  <Link href={evalsPath(app, "feedback")} className={LINK}>
                    Read the reasons
                  </Link>
                  .
                </span>
              </li>
            ))}
          </ul>
        )}

        {weekly.drafted.length > 0 && (
          <ul className="readable space-y-2 text-sm">
            {weekly.drafted.map((d) => (
              <li
                key={`drafted-${d.suite}`}
                className="flex flex-wrap items-baseline gap-2"
              >
                <Tip term="activityDraft" id={`drafted-${d.suite}`}>
                  <Chip tone="neutral">Drafted</Chip>
                </Tip>
                <span>
                  {d.label}: {d.count} case{d.count === 1 ? "" : "s"} drafted
                  from this week&apos;s activity,{" "}
                  {d.waiting === 0
                    ? "all reviewed."
                    : `${d.waiting} waiting for review. `}
                  {d.waiting > 0 && (
                    <Link
                      href={`${evalsPath(app, d.suite)}#answer-key`}
                      className={LINK}
                    >
                      Review them
                    </Link>
                  )}
                  {d.waiting > 0 && "."}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}
