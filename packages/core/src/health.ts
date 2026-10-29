import type { BoardRow } from "./board.js";
import { confidenceFor, TARGET_CASES } from "./summary.js";
import { suggest, type SuggestOptions } from "./suggest.js";
import type { ModelCatalog } from "./models.js";
import {
  checkBar,
  pctBeside,
  type CheckDef,
  type SuitePriority,
} from "./types.js";

/**
 * Where a suite stands, for its card on the evals hub: one status and the
 * reasons, from the same board and suggestion its own page shows. Pure.
 */

/** Where a suite stands, from not tested to good. */
export type HealthStatus =
  "untested" | "stale" | "few" | "improve" | "change" | "fair" | "good";

/**
 * One reason a suite stands where it does, for a chip on its card. A suite
 * can have several: checks under their bar and a suggestion, say.
 */
export type HealthFlag =
  | { kind: "untested" }
  | { kind: "stale" }
  | { kind: "below"; serious: number; minor: number }
  | { kind: "suggestLive" }
  | { kind: "suggestFallback" }
  | { kind: "retestLive" }
  | { kind: "provisional"; answers: number }
  | { kind: "fewCases"; cases: number }
  | { kind: "addCases"; cases: number; target: number }
  | { kind: "good" };

/**
 * A suite's status for its card, with the live model's score and the reasons, most important first.
 */
export type Health = {
  status: HealthStatus;
  /** Each reason behind the status, most important first, for chips. */
  flags: HealthFlag[];
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
 * // h.status: "good" | "fair" | "change" | "improve" | "few" | "stale" | "untested"
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
  /** The feature's injection suites, so the status matches its page's suggestion. */
  opts: SuggestOptions = {},
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
      flags: [{ kind: "untested" }],
      title: "Not tested yet",
      details: [
        `Test the models to see how ${liveRow?.label ?? "the live model"} does.`,
      ],
    };
  if (t.stale)
    return {
      ...base,
      status: "stale",
      flags: [{ kind: "stale" }],
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
      `${c.label}: ${pctBeside(rate, checkBar(c))}, under the ${pct(checkBar(c))} bar${c.severity === "serious" ? " (serious)" : ""}.`,
    );
  if (below.length > 3) details.push(`${below.length - 3} more under the bar.`);

  const s = suggest(rows, checks, priority, models, opts);
  const change = s && !s.same;
  if (change)
    details.push(
      s.retestLive
        ? (s.reasons[0] ?? `Test ${s.live.label} again.`)
        : s.keepLive
          ? `A better fallback is suggested: ${s.fallback?.label}.`
          : `${s.live.label} is suggested over ${liveRow.label}.`,
    );
  if (testedModels < 2)
    details.push("Only one model tested: test others to compare.");

  const confidence = confidenceFor(cases, live?.rate ?? 0.5);
  const serious = below.filter((x) => x.c.severity === "serious").length;
  const flags: HealthFlag[] = [];
  if (below.length)
    flags.push({ kind: "below", serious, minor: below.length - serious });
  if (change)
    flags.push(
      s.retestLive
        ? { kind: "retestLive" }
        : s.keepLive
          ? { kind: "suggestFallback" }
          : { kind: "suggestLive" },
    );
  if (provisional) flags.push({ kind: "provisional", answers: provisional });
  if (confidence.level === "too-few") flags.push({ kind: "fewCases", cases });
  else if (cases < TARGET_CASES)
    flags.push({ kind: "addCases", cases, target: TARGET_CASES });
  if (confidence.level === "too-few")
    return {
      ...base,
      status: "few",
      flags,
      title: "Too few cases to trust",
      details: [
        `${fewer}: a score could be off by about ${confidence.margin} points.`,
        ...details,
      ],
    };
  // Checks under their bar need work; a better choice alone is only a
  // suggestion, even when the live model meets every bar.
  if (below.length || change)
    return {
      ...base,
      status: below.length ? "improve" : "change",
      flags,
      title: below.length ? "Room to improve" : "Change suggested",
      details: fewer
        ? [...details, `${fewer}: add more to firm it up.`]
        : details,
    };
  if (confidence.level === "rough")
    return {
      ...base,
      status: "fair",
      flags,
      title: "Good so far",
      details: [
        `Meets every bar, but with ${fewer} a score could be off by about ${confidence.margin} points.`,
        ...details,
      ],
    };
  return {
    ...base,
    status: "good",
    flags: flags.length ? flags : [{ kind: "good" }],
    title: "In good shape",
    details: details.length ? details : ["Meets every bar on enough cases."],
  };
}
