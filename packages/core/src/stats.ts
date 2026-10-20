import type { CheckResult } from "./types";

/**
 * Summary numbers for a run: pass rates per check with a 95% range, so a
 * small dataset doesn't look more certain than it is. Pure; no database.
 */

export type Rate = {
  passed: number;
  /** Outputs the check applied to. */
  n: number;
  rate: number | null;
  /** 95% Wilson interval. */
  low: number | null;
  high: number | null;
};

/** Wilson score interval: honest for small n and rates near 0 or 1. */
export function wilson(passed: number, n: number, z = 1.96): Rate {
  if (n === 0) return { passed, n, rate: null, low: null, high: null };
  const p = passed / n;
  const denom = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denom;
  const half =
    (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return {
    passed,
    n,
    rate: p,
    low: Math.max(0, center - half),
    high: Math.min(1, center + half),
  };
}

export type ScoredOutput = {
  caseId: string;
  repeat: number;
  /** null when the call failed. */
  checks: CheckResult[] | null;
  costUsd: number;
  ms: number;
  reused: boolean;
};

export type SuiteMetrics = {
  cases: number;
  outputs: number;
  failed: number;
  /** Every applicable check passed. Failed calls count as not passing. */
  allPass: Rate;
  /**
   * Partial credit summed over answers (e.g. items right of items
   * expected), where the suite gives it; the headline when present.
   */
  units: { right: number; total: number } | null;
  byCheck: Record<string, Rate>;
  /**
   * Of cases run more than once, the share whose all-pass result was the
   * same every time. Low: the model is inconsistent on these cases.
   */
  consistency: Rate | null;
  /** What grading's judge spent, apart from the model under test (runner). */
  judgeCostUsd?: number;
  /** The error most failed answers share (runner). */
  failureReason?: string | null;
  /** What this run spent: reused outputs cost nothing. */
  costUsd: number;
  /** What one answer costs on this model, reused or not. */
  costPerAnswer: number | null;
  /** How long one answer takes on this model. */
  avgMs: number;
  reused: number;
};

export function allPassed(checks: CheckResult[] | null): boolean {
  return checks !== null && checks.every((c) => c.pass !== false);
}

/** Sums each answer's partial credit; null when the suite gives none. */
export function sumUnits(
  outputs: { checks: CheckResult[] | null }[],
): { right: number; total: number } | null {
  let right = 0;
  let total = 0;
  let any = false;
  for (const o of outputs)
    for (const c of o.checks ?? [])
      if (c.units) {
        any = true;
        right += c.units.right;
        total += c.units.total;
      }
  return any ? { right, total } : null;
}

/** One answer's score from 0 to 1: its partial credit, else all-or-nothing. */
export function answerScore(checks: CheckResult[] | null): number {
  if (!checks) return 0;
  const u = checks.find((c) => c.units)?.units;
  if (u) return u.total ? u.right / u.total : 1;
  return allPassed(checks) ? 1 : 0;
}

export function suiteMetrics(
  outputs: ScoredOutput[],
  checkKeys: string[],
): SuiteMetrics {
  const byCheck: Record<string, Rate> = {};
  for (const key of checkKeys) {
    const applied = outputs
      .map((o) => o.checks?.find((c) => c.key === key))
      .filter((c): c is CheckResult => c !== undefined && c.pass !== null);
    byCheck[key] = wilson(applied.filter((c) => c.pass).length, applied.length);
  }
  const byCase = new Map<string, boolean[]>();
  for (const o of outputs)
    byCase.set(o.caseId, [
      ...(byCase.get(o.caseId) ?? []),
      allPassed(o.checks),
    ]);
  const repeated = [...byCase.values()].filter((r) => r.length > 1);
  const called = outputs.filter((o) => !o.reused);
  // Answers with a recorded time (older reused rows have none).
  const timed = outputs.filter((o) => o.checks && o.ms > 0);
  return {
    cases: byCase.size,
    outputs: outputs.length,
    failed: outputs.filter((o) => !o.checks).length,
    allPass: wilson(
      outputs.filter((o) => allPassed(o.checks)).length,
      outputs.length,
    ),
    units: sumUnits(outputs),
    byCheck,
    consistency: repeated.length
      ? wilson(
          repeated.filter((r) => r.every((x) => x === r[0])).length,
          repeated.length,
        )
      : null,
    costUsd: called.reduce((t, o) => t + o.costUsd, 0),
    costPerAnswer: timed.length
      ? timed.reduce((t, o) => t + o.costUsd, 0) / timed.length
      : null,
    avgMs: timed.length
      ? Math.round(timed.reduce((t, o) => t + o.ms, 0) / timed.length)
      : 0,
    reused: outputs.length - called.length,
  };
}
