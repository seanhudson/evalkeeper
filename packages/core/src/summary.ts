import type { SuiteMetrics } from "./stats.js";
import type { CheckDef } from "./types.js";

/**
 * A test result in plain words, for people who don't want the statistics:
 * how many answers were fully right, how far to trust that, and the most
 * common problems. Pure.
 */

const n = (count: number, word: string) =>
  `${count} ${count === 1 ? word : `${word}s`}`;

/** Where a rate likely is, from its 95% range in points. */
function likely(low: number, high: number): string {
  if (high >= 100) return `${low}% or better`;
  if (low <= 0) return `${high}% or worse`;
  return `between ${low}% and ${high}%`;
}

/** A check that failed, and how often. */
export type Problem = {
  key: string;
  label: string;
  failed: number;
  of: number;
};

/**
 * A test in plain words: answers right, how far to trust that, and the common problems.
 */
export type Summary = {
  right: number;
  total: number;
  /** One sentence on how much the number can be trusted. */
  trust: string;
  /** Checks that failed at least once, most failures first. */
  problems: Problem[];
};

/**
 * Below this many answers the number is mostly noise.
 *
 * @deprecated A test's page now counts cases against `tooFewBelow(target)`,
 *   as the suite's page does. Kept for apps that read it.
 */
export const TRUST_MIN = 10;

/** How many points either side a score may be off and still read as solid. */
export const SOLID_MARGIN = 10;

/**
 * A test's result in plain words, for people who don't want the statistics.
 * Too few to tell below `tooFewBelow(target)` cases, as the suite's page
 * says; otherwise solid when the score's 95% range reaches no more than
 * SOLID_MARGIN points from it on either side. Near 100% the range is
 * lopsided (the real rate can only be lower), so the larger side counts:
 * 16 of 16 right is likely 81% or better, not "about 10 points either way".
 *
 * @param m - The test's metrics.
 * @param checks - The suite's checks, for the problems.
 * @param target - The suite's target number of cases (`targetCasesOf`); a
 *   lower target lowers the fewest cases that can be judged.
 */
export function summarize(
  m: SuiteMetrics,
  checks: CheckDef[],
  target: number = TARGET_CASES,
): Summary {
  const right = m.allPass.passed;
  const total = m.allPass.n;
  // Older stored metrics may lack the case count: answers stand in.
  const cases = typeof m.cases === "number" ? m.cases : total;
  const rate = total ? right / total : 0;
  const { low, high } = m.allPass;
  const pts = (x: number) => Math.round(x * 100);
  const off =
    low !== null && high !== null
      ? Math.max(pts(rate) - pts(low), pts(high) - pts(rate))
      : null;
  const floor = tooFewBelow(target);
  const trust =
    cases < floor
      ? `Only ${n(cases, "case")}: too few to tell yet. A suite needs ${floor} to judge; add cases, then test again.`
      : off !== null && off > SOLID_MARGIN && low !== null && high !== null
        ? `A rough number: with ${n(total, "answer")}, the real rate is likely ${likely(pts(low), pts(high))}.`
        : `A solid number: ${n(total, "answer")}.`;
  const problems = checks
    .map((c) => {
      const r = m.byCheck[c.key];
      return r && r.n
        ? { key: c.key, label: c.label, failed: r.n - r.passed, of: r.n }
        : null;
    })
    .filter((p): p is Problem => p !== null && p.failed > 0)
    .sort((a, b) => b.failed - a.failed);
  return { right, total, trust, problems };
}

/**
 * How far a score on this many cases can be trusted, and how far off it could be.
 */
export type Confidence = {
  level: "too-few" | "rough" | "good" | "strong";
  label: string;
  /** About how many points a score could be off, either way (95%). */
  margin: number;
  /** What the count means for choosing a model, in one sentence. */
  sentence: string;
};

/**
 * Fewer cases than this can't be judged at all: a score could be off by
 * more than 20 points. A suite whose own target is smaller (cases that cost
 * real money) uses its target instead, so a suite at its target is never
 * "too few".
 */
export const TOO_FEW_CASES = 20;

/** How many cases are too few to judge, for a suite aiming at `target`. */
export function tooFewBelow(target: number = TARGET_CASES): number {
  return Math.min(TOO_FEW_CASES, target);
}

/**
 * How far to trust scores on this many cases. The margin is the 95% range
 * of a pass rate (at the given rate, or 50%, the widest), in points.
 *
 * @param cases - Cases in use.
 * @param rate - The score to judge the margin at; 50% (the widest) by default.
 * @param target - The suite's target number of cases (`targetCasesOf`):
 *   "too few" is below it or 20, whichever is smaller, and the sentence
 *   asks for more only while the suite is under it.
 */
export function confidenceFor(
  cases: number,
  rate = 0.5,
  target: number = TARGET_CASES,
): Confidence {
  const p = Math.min(Math.max(rate, 0.05), 0.95);
  const margin = cases
    ? Math.round(1.96 * Math.sqrt((p * (1 - p)) / cases) * 100)
    : 100;
  const level =
    cases < tooFewBelow(target)
      ? "too-few"
      : cases < 50
        ? "rough"
        : cases < 100
          ? "good"
          : "strong";
  const label = {
    "too-few": "too few",
    rough: "rough",
    good: "good",
    strong: "strong",
  }[level];
  const aim = cases < target ? ` Aim for ${target}.` : "";
  const sentence =
    level === "too-few"
      ? `With ${cases} cases a score could be off by about ${margin} points: only big problems show.${aim}`
      : `With ${cases} cases a score could be off by about ${margin} points either way, so models closer than that can't be told apart.${aim}`;
  return { level, label, margin, sentence };
}

/**
 * The answer key size to aim for when a suite sets none (see
 * confidenceFor). A suite sets its own with `targetCases`, and a person can
 * change it in the suite's settings.
 */
export const TARGET_CASES = 50;

/**
 * A suite's target number of cases: what a person saved in its settings,
 * else the suite's `targetCases`, else TARGET_CASES.
 *
 * @param suite - The suite, for its `targetCases`.
 * @param saved - The suite's saved settings, when there are any.
 */
export function targetCasesOf(
  suite: { targetCases?: number | undefined },
  saved?: { targetCases?: number | null | undefined } | null,
): number {
  return saved?.targetCases ?? suite.targetCases ?? TARGET_CASES;
}

/**
 * How many drafts get the key to its target: at least 10 a batch (or the
 * whole target, when that's smaller), at most 30.
 *
 * @param casesNotRetired - Cases in the answer key, drafts included.
 * @param target - The suite's target number of cases.
 */
export function draftsToTarget(
  casesNotRetired: number,
  target: number = TARGET_CASES,
): number {
  return Math.min(30, Math.max(Math.min(10, target), target - casesNotRetired));
}
