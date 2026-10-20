import { answerScore, wilson, type Rate } from "./stats";
import type { CheckResult } from "./types";
import { at } from "./util";
import { mustGet } from "./util";

/**
 * Comparing two runs of a suite, case by case: the champion (usually the
 * live version) and a challenger (another model, effort, or instructions).
 * Each case scores the share of its repeats where every check passed; the
 * challenger's average difference gets a 95% range from a paired
 * bootstrap, and the verdict is read off that range. Pure; no database.
 */

export type RunOutput = {
  caseId: string;
  checks: CheckResult[] | null;
  costUsd: number;
  ms: number;
  reused: boolean;
};

export type Verdict = "BETTER" | "SAME" | "WORSE" | "TOO_FEW";

export type Comparison = {
  /** Cases both runs have. */
  n: number;
  /** Challenger minus champion, in pass share (−1 to 1). */
  mean: number;
  low: number;
  high: number;
  verdict: Verdict;
  /** Passed every time on the challenger, not on the champion. */
  fixed: string[];
  /** Passed every time on the champion, not on the challenger. */
  broke: string[];
  byCheck: Record<string, { champion: Rate; challenger: Rate }>;
  /** Per output, called (not reused). */
  cost: { champion: number | null; challenger: number | null };
  avgMs: { champion: number | null; challenger: number | null };
};

/** Fewer shared cases than this: no verdict. */
export const MIN_CASES = 5;

/** A small seeded generator, so the same runs always give the same range. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 95% range of the mean of paired differences, by resampling cases. */
export function bootstrapMean(
  diffs: number[],
  iterations = 4000,
  seed = 1,
): { mean: number; low: number; high: number } {
  const n = diffs.length;
  const mean = n ? diffs.reduce((t, d) => t + d, 0) / n : 0;
  if (n < 2) return { mean, low: mean, high: mean };
  const rand = mulberry32(seed);
  const means: number[] = [];
  for (let i = 0; i < iterations; i++) {
    let sum = 0;
    for (let j = 0; j < n; j++) sum += at(diffs, Math.floor(rand() * n));
    means.push(sum / n);
  }
  means.sort((a, b) => a - b);
  return {
    mean,
    low: at(means, Math.floor(iterations * 0.025)),
    high: at(means, Math.ceil(iterations * 0.975) - 1),
  };
}

export function verdictFor(n: number, low: number, high: number): Verdict {
  if (n < MIN_CASES) return "TOO_FEW";
  if (low > 0) return "BETTER";
  if (high < 0) return "WORSE";
  return "SAME";
}

/** Each case's average score over its repeats (partial credit if any). */
function passShareByCase(outputs: RunOutput[]): Map<string, number> {
  const by = new Map<string, number[]>();
  for (const o of outputs)
    by.set(o.caseId, [...(by.get(o.caseId) ?? []), answerScore(o.checks)]);
  return new Map(
    [...by].map(([id, r]) => [id, r.reduce((t, x) => t + x, 0) / r.length]),
  );
}

/**
 * Each case's parts right and parts in all, averaged over its repeats, or
 * null when the suite gives no partial credit.
 */
function unitsByCase(
  outputs: RunOutput[],
): Map<string, { right: number; total: number }> | null {
  const by = new Map<string, { right: number; total: number; n: number }>();
  for (const o of outputs) {
    const u = o.checks?.find((c) => c.units)?.units;
    if (o.checks && !u) return null;
    const cur = by.get(o.caseId) ?? { right: 0, total: 0, n: 0 };
    // A failed call: nothing right, as many parts as the case has (known
    // from another repeat or run; 0 here, set below).
    by.set(o.caseId, {
      right: cur.right + (u?.right ?? 0),
      total: cur.total + (u?.total ?? 0),
      n: cur.n + 1,
    });
  }
  return new Map(
    [...by].map(([id, v]) => [
      id,
      { right: v.right / v.n, total: v.total / v.n },
    ]),
  );
}

/**
 * 95% range of the difference in parts-right rate (b minus a), resampling
 * whole cases: the same measure as the headline (parts right).
 */
export function bootstrapRate(
  cases: { a: number; b: number; total: number }[],
  iterations = 4000,
  seed = 1,
): { mean: number; low: number; high: number } {
  const rate = (cs: typeof cases) => {
    const total = cs.reduce((t, c) => t + c.total, 0);
    return total ? cs.reduce((t, c) => t + c.b - c.a, 0) / total : 0;
  };
  const mean = rate(cases);
  if (cases.length < 2) return { mean, low: mean, high: mean };
  const rand = mulberry32(seed);
  const rates: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const sample = Array.from({ length: cases.length }, () =>
      at(cases, Math.floor(rand() * cases.length)),
    );
    rates.push(rate(sample));
  }
  rates.sort((x, y) => x - y);
  return {
    mean,
    low: at(rates, Math.floor(iterations * 0.025)),
    high: at(rates, Math.ceil(iterations * 0.975) - 1),
  };
}

function rates(outputs: RunOutput[], key: string): Rate {
  const applied = outputs
    .map((o) => o.checks?.find((c) => c.key === key))
    .filter((c): c is CheckResult => c !== undefined && c.pass !== null);
  return wilson(applied.filter((c) => c.pass).length, applied.length);
}

function perCall(outputs: RunOutput[], pick: (o: RunOutput) => number) {
  const called = outputs.filter((o) => !o.reused);
  return called.length
    ? called.reduce((t, o) => t + pick(o), 0) / called.length
    : null;
}

export function compareRuns(
  champion: RunOutput[],
  challenger: RunOutput[],
  checkKeys: string[],
): Comparison {
  const a = passShareByCase(champion);
  const b = passShareByCase(challenger);
  const shared = [...a.keys()].filter((id) => b.has(id)).sort();
  // Parts right where the suite gives partial credit (the headline
  // measure), else each case's share of passing answers.
  const ua = unitsByCase(champion);
  const ub = unitsByCase(challenger);
  const { mean, low, high } =
    ua && ub
      ? bootstrapRate(
          shared.map((id) => ({
            a: mustGet(ua, id).right,
            b: mustGet(ub, id).right,
            total: Math.max(mustGet(ua, id).total, mustGet(ub, id).total),
          })),
        )
      : bootstrapMean(shared.map((id) => mustGet(b, id) - mustGet(a, id)));
  const inShared = (os: RunOutput[]) =>
    os.filter((o) => shared.includes(o.caseId));
  return {
    n: shared.length,
    mean,
    low,
    high,
    verdict: verdictFor(shared.length, low, high),
    fixed: shared.filter((id) => b.get(id) === 1 && mustGet(a, id) < 1),
    broke: shared.filter((id) => a.get(id) === 1 && mustGet(b, id) < 1),
    byCheck: Object.fromEntries(
      checkKeys.map((k) => [
        k,
        {
          champion: rates(inShared(champion), k),
          challenger: rates(inShared(challenger), k),
        },
      ]),
    ),
    cost: {
      champion: perCall(champion, (o) => o.costUsd),
      challenger: perCall(challenger, (o) => o.costUsd),
    },
    avgMs: {
      champion: perCall(champion, (o) => o.ms),
      challenger: perCall(challenger, (o) => o.ms),
    },
  };
}

/** The verdict in plain words, with what it costs. */
export function verdictSentence(c: Comparison, challengerName: string): string {
  const pts = (x: number) => `${Math.round(Math.abs(x) * 100)} points`;
  const cost =
    c.cost.champion && c.cost.challenger
      ? c.cost.challenger < c.cost.champion * 0.9
        ? `, and costs ${Math.round((1 - c.cost.challenger / c.cost.champion) * 100)}% less per call`
        : c.cost.challenger > c.cost.champion * 1.1
          ? `, and costs ${Math.round((c.cost.challenger / c.cost.champion - 1) * 100)}% more per call`
          : ", at about the same cost"
      : "";
  switch (c.verdict) {
    case "TOO_FEW":
      return `Only ${c.n} cases in common: too few to say. Run both on the same set of at least ${MIN_CASES} cases.`;
    case "BETTER":
      return `${challengerName} is better: it passes ${pts(c.mean)} more often (likely ${pts(c.low)} to ${pts(c.high)})${cost}.`;
    case "WORSE":
      return `${challengerName} is worse: it passes ${pts(c.mean)} less often (likely ${pts(c.high)} to ${pts(c.low)})${cost}.`;
    default:
      return `No clear difference: ${challengerName} is somewhere between ${Math.round(c.low * 100)} and ${c.high > 0 ? "+" : ""}${Math.round(c.high * 100)} points${cost}.`;
  }
}
