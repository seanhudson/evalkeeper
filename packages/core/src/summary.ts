import type { SuiteMetrics } from "./stats.js";
import type { CheckDef } from "./types.js";

/**
 * A test result in plain words, for people who don't want the statistics:
 * how many answers were fully right, how far to trust that, and the most
 * common problems. Pure.
 */

export type Problem = {
  key: string;
  label: string;
  failed: number;
  of: number;
};

export type Summary = {
  right: number;
  total: number;
  /** One sentence on how much the number can be trusted. */
  trust: string;
  /** Checks that failed at least once, most failures first. */
  problems: Problem[];
};

/** Below this many answers the number is mostly noise. */
export const TRUST_MIN = 10;

export function summarize(m: SuiteMetrics, checks: CheckDef[]): Summary {
  const right = m.allPass.passed;
  const total = m.allPass.n;
  const spread =
    m.allPass.low !== null && m.allPass.high !== null
      ? Math.round(((m.allPass.high - m.allPass.low) / 2) * 100)
      : null;
  const trust =
    total < TRUST_MIN
      ? `Only ${total} ${total === 1 ? "answer" : "answers"}: too few to trust yet. Confirm more cases, then test again.`
      : spread !== null && spread > 10
        ? `A rough number: with ${total} answers it could be about ${spread} points either way.`
        : `A solid number: ${total} answers.`;
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

export type Confidence = {
  level: "too-few" | "rough" | "good" | "strong";
  label: string;
  /** About how many points a score could be off, either way (95%). */
  margin: number;
  /** What the count means for choosing a model, in one sentence. */
  sentence: string;
};

/**
 * How far to trust scores on this many cases. The margin is the 95% range
 * of a pass rate (at the given rate, or 50%, the widest), in points.
 */
export function confidenceFor(cases: number, rate = 0.5): Confidence {
  const p = Math.min(Math.max(rate, 0.05), 0.95);
  const margin = cases
    ? Math.round(1.96 * Math.sqrt((p * (1 - p)) / cases) * 100)
    : 100;
  const level =
    cases < 20
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
  const sentence =
    level === "too-few"
      ? `With ${cases} cases a score could be off by about ${margin} points: only big problems show. Aim for 50.`
      : `With ${cases} cases a score could be off by about ${margin} points either way, so models closer than that can't be told apart.${level === "rough" ? " Aim for 50." : ""}`;
  return { level, label, margin, sentence };
}

/** The answer key size to aim for (see confidenceFor). */
export const TARGET_CASES = 50;

/** How many drafts get the key to the target: at least 10, at most 30 a batch. */
export function draftsToTarget(casesNotRetired: number): number {
  return Math.min(30, Math.max(10, TARGET_CASES - casesNotRetired));
}
