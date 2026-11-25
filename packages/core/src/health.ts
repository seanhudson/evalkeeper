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
 * Where a suite stands, in one of four words a card can be colored by:
 * `risk` (a serious check is under its bar), `improve` (something would
 * help: a minor check under its bar, a better model, a retest), `healthy`
 * (meets every bar), or `unknown` (not tested, or too few cases to trust a
 * score). The hub groups suites by it, at-risk first.
 */
export type HealthStanding = "risk" | "improve" | "healthy" | "unknown";

/** The order the hub shows standings in: what needs you first. */
export const STANDING_ORDER: readonly HealthStanding[] = [
  "risk",
  "improve",
  "healthy",
  "unknown",
];

/** What each standing is called on the hub. */
export const STANDING_LABEL: Readonly<Record<HealthStanding, string>> = {
  risk: "At risk",
  improve: "Can improve",
  healthy: "Healthy",
  unknown: "Can't tell yet",
};

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
  /** Which of the four groups the suite belongs in, for its color. */
  standing: HealthStanding;
  /**
   * The live model's check furthest under its bar (serious first), to
   * show how far off it is; null when every check meets its bar.
   */
  worst: { label: string; rate: number; bar: number; serious: boolean } | null;
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
 * The standing for a status: a serious check under its bar is a risk even
 * on few cases (a fuzzy score that low still deserves a look); otherwise
 * too few cases means no one can tell yet.
 */
function standingOf(status: HealthStatus, serious: number): HealthStanding {
  if (serious > 0) return "risk";
  switch (status) {
    case "untested":
    case "few":
      return "unknown";
    case "stale":
    case "improve":
    case "change":
      return "improve";
    case "fair":
    case "good":
      return "healthy";
  }
}

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
  const base = { live, testedModels, worst: null };
  const fewer = cases < TARGET_CASES ? `${cases} of ${TARGET_CASES} cases` : "";

  if (!t)
    return {
      ...base,
      status: "untested",
      standing: "unknown",
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
      standing: "improve",
      flags: [{ kind: "stale" }],
      title: "Test again",
      details: ["Cases, answers, or instructions changed since the last test."],
    };

  const details: string[] = [];
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
      `${c.label}: ${pctBeside(rate, checkBar(c))}, under its ${pct(checkBar(c))} aim${c.severity === "serious" ? " (must pass)" : ""}.`,
    );
  if (below.length > 3)
    details.push(`${below.length - 3} more under their aim.`);

  const s = suggest(rows, checks, priority, models, opts);
  // Not while a test runs: the suggestion would weigh half a board.
  const change = s && !s.same && !rows.some((r) => r.testing);
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
  // Last: a standing choice, not a problem, so it never leads.
  if (provisional)
    details.push(
      `${provisional} of ${cases} answers are provisional: review them before trusting these scores.`,
    );

  const confidence = confidenceFor(cases, live?.rate ?? 0.5);
  const serious = below.filter((x) => x.c.severity === "serious").length;
  const w = below[0];
  const scored = {
    ...base,
    worst: w
      ? {
          label: w.c.label,
          rate: w.rate,
          bar: checkBar(w.c),
          serious: w.c.severity === "serious",
        }
      : null,
  };
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
      ...scored,
      status: "few",
      standing: standingOf("few", serious),
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
      ...scored,
      status: below.length ? "improve" : "change",
      standing: standingOf(below.length ? "improve" : "change", serious),
      flags,
      title: below.length ? "Room to improve" : "Change suggested",
      details: fewer
        ? [...details, `${fewer}: add more to firm it up.`]
        : details,
    };
  if (confidence.level === "rough")
    return {
      ...scored,
      status: "fair",
      standing: "healthy",
      flags,
      title: "Good so far",
      details: [
        `Meets every bar, but with ${fewer} a score could be off by about ${confidence.margin} points.`,
        ...details,
      ],
    };
  return {
    ...scored,
    status: "good",
    standing: "healthy",
    flags: flags.length ? flags : [{ kind: "good" }],
    title: "In good shape",
    details: details.length ? details : ["Meets every bar on enough cases."],
  };
}
