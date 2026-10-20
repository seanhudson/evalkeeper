import type { BoardRow } from "./board.js";
import { confidenceFor, TARGET_CASES } from "./summary.js";
import { suggest } from "./suggest.js";
import type { ModelCatalog } from "./models.js";
import { checkBar, type CheckDef, type SuitePriority } from "./types.js";

/**
 * Where a suite stands, for its card on the evals hub: one status and the
 * reasons, from the same board and suggestion its own page shows. Pure.
 */

/** Where a suite stands, from not tested to good. */
export type HealthStatus =
  "untested" | "stale" | "few" | "improve" | "fair" | "good";

/**
 * A suite's status for its card, with the live model's score and the reasons, most important first.
 */
export type Health = {
  status: HealthStatus;
  title: string;
  /** The live model, its score, and how many models were tested. */
  live: { label: string; rate: number } | null;
  testedModels: number;
  /** What to do or watch, most important first. */
  details: string[];
};

const pct = (x: number) => `${Math.round(x * 100)}%`;

/**
 * Where a suite stands, for its card on the hub, from the same board and suggestion its
 * page shows.
 *
 * @example
 * ```ts
 * const board = await runner.board("ticket_triage");
 * const h = suiteHealth(board.rows, suite.checks, suite.priority, board.cases, board.provisional, MODELS);
 * // h.status: "good" | "fair" | "improve" | "few" | "stale" | "untested"
 * ```
 */
export function suiteHealth(
  rows: BoardRow[],
  checks: CheckDef[],
  priority: SuitePriority,
  cases: number,
  /** Cases in use on unreviewed answers. */
  provisional = 0,
  /** Your model catalog, for retirements and the fallback's provider. */
  models: ModelCatalog = {},
): Health {
  const liveRow = rows.find((r) => r.live) ?? null;
  const testedModels = rows.filter(
    (r) => !r.baseline && r.test && !r.test.stale,
  ).length;
  const t = liveRow?.test;
  const live =
    liveRow && t ? { label: liveRow.label, rate: t.right / t.total } : null;
  const base = { live, testedModels };
  const fewer = cases < TARGET_CASES ? `${cases} of ${TARGET_CASES} cases` : "";

  if (!t)
    return {
      ...base,
      status: "untested",
      title: "Not tested yet",
      details: [
        `Test the models to see how ${liveRow?.label ?? "the live model"} does.`,
      ],
    };
  if (t.stale)
    return {
      ...base,
      status: "stale",
      title: "Test again",
      details: ["Cases, answers, or instructions changed since the last test."],
    };

  const details: string[] = [];
  if (provisional)
    details.push(
      `${provisional} of ${cases} answers are provisional: review them before trusting these scores.`,
    );
  // Live checks under their bars, serious first.
  const below = checks
    .map((c) => ({ c, rate: t.byCheck[c.key]?.rate ?? null }))
    .filter(
      (x): x is { c: CheckDef; rate: number } =>
        x.rate !== null && x.rate < checkBar(x.c),
    )
    .sort(
      (a, b) =>
        Number(b.c.severity === "serious") -
          Number(a.c.severity === "serious") || a.rate - b.rate,
    );
  for (const { c, rate } of below.slice(0, 3))
    details.push(
      `${c.label}: ${pct(rate)}, under the ${pct(checkBar(c))} bar${c.severity === "serious" ? " (serious)" : ""}.`,
    );
  if (below.length > 3) details.push(`${below.length - 3} more under the bar.`);

  const s = suggest(rows, checks, priority, models);
  const change = s && !s.same;
  if (change)
    details.push(
      s.keepLive
        ? `A better fallback is suggested: ${s.fallback?.label}.`
        : `${s.live.label} is suggested over ${liveRow.label}.`,
    );
  if (testedModels < 2)
    details.push("Only one model tested: test others to compare.");

  const confidence = confidenceFor(cases, live?.rate ?? 0.5);
  if (confidence.level === "too-few")
    return {
      ...base,
      status: "few",
      title: "Too few cases to trust",
      details: [
        `${fewer}: a score could be off by about ${confidence.margin} points.`,
        ...details,
      ],
    };
  if (below.length || change)
    return {
      ...base,
      status: "improve",
      title: "Room to improve",
      details: fewer
        ? [...details, `${fewer}: add more to firm it up.`]
        : details,
    };
  if (confidence.level === "rough")
    return {
      ...base,
      status: "fair",
      title: "Good so far",
      details: [
        `Meets every bar, but with ${fewer} a score could be off by about ${confidence.margin} points.`,
        ...details,
      ],
    };
  return {
    ...base,
    status: "good",
    title: "In good shape",
    details: details.length ? details : ["Meets every bar on enough cases."],
  };
}
