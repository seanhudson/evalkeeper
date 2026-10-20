import { retiresLabel, type ModelCatalog } from "./models.js";
import type { Rate } from "./stats.js";
import type { CheckDef, SuitePriority } from "./types.js";
import type { Verdict } from "./compare.js";
import { at } from "./util.js";

/**
 * Which model to make live and which the fallback, from a suite's current
 * tests, by fixed rules so the reason is always the real one. Switching
 * live is conservative: the candidate must score at least as high as live
 * and make no more serious mistakes, and then needs a real reason: clearly
 * more accurate, at least two fewer serious mistakes, or, by the suite's
 * priority, at least 30% faster (speed) or cheaper (cost). One exception,
 * for suites that favor cost or speed: a model that scores a little lower
 * (within 10 points, and no clear difference) with no more serious
 * mistakes qualifies when it costs or takes at most half as much. A suite's
 * time limit rules out slower models, live included. Otherwise live stays, and the best-scoring other
 * model is named as one to watch. The fallback is the most accurate model
 * from another provider; it needn't beat live, it only runs in an outage.
 * Models the provider is retiring are never suggested, and a retiring live
 * model is replaced by the best-scoring one that isn't. Pure.
 */

/** One model's row, as the suggestion reads it. */
export type SuggestRow = {
  key: string;
  model: string;
  label: string;
  variant: boolean;
  live: boolean;
  fallback: boolean;
  vsLive: Verdict | null;
  /** May only be live (e.g. a model that can't stand in for a text model). */
  liveOnly?: boolean;
  /** May only be the fallback. */
  fallbackOnly?: boolean;
  test: {
    right: number;
    total: number;
    byCheck: Record<string, Rate>;
    avgMs: number | null;
    costPerAnswer: number | null;
    stale: boolean;
    /** Answers that failed; a test with any is incomplete. */
    failedAnswers?: number;
  } | null;
};

/**
 * Which model to make live and which the fallback, with the reasons in plain sentences.
 */
export type Suggestion<R extends SuggestRow = SuggestRow> = {
  live: R;
  fallback: R | null;
  /** Live stays as it is. */
  keepLive: boolean;
  /** Nothing to change at all: live stays and the fallback is already set. */
  same: boolean;
  /** Why, in plain sentences. */
  reasons: string[];
};

/**
 * How many serious checks a model's test failed; Infinity without a test.
 */
export function seriousMistakes(row: SuggestRow, checks: CheckDef[]): number {
  const test = row.test;
  if (!test) return Infinity;
  return checks
    .filter((c) => c.severity === "serious")
    .reduce((t, c) => {
      const r = test.byCheck[c.key];
      return t + (r ? r.n - r.passed : 0);
    }, 0);
}

const mistakes = (n: number) => `${n} serious mistake${n === 1 ? "" : "s"}`;
const rate = (r: SuggestRow) => (r.test ? r.test.right / r.test.total : 0);
const pct = (x: number) => `${Math.round(x * 100)}%`;
const cost = (r: SuggestRow) => r.test?.costPerAnswer ?? Infinity;
const ms = (r: SuggestRow) => r.test?.avgMs ?? Infinity;
/** A cost or speed trade-off may give up at most this much accuracy. */
const MAX_TRADE_DROP = 0.1;
/** ...and must cost or take at most this share of live's. */
const HALF = 0.5;
/** At least 30% lower. */
const clearlyLess = (a: number, b: number) =>
  Number.isFinite(a) && Number.isFinite(b) && a <= b * 0.7;

/**
 * Suggests the live and fallback models from a suite's board, by fixed rules, so the
 * reason given is always the real one. Null with nothing current to go on.
 *
 * @example
 * ```ts
 * const board = await runner.board("ticket_triage");
 * const s = suggest(board.rows, suite.checks, suite.priority, MODELS);
 * if (s && !s.same) console.log(s.live.label, s.fallback?.label, s.reasons);
 * ```
 */
export function suggest<R extends SuggestRow>(
  rows: R[],
  checks: CheckDef[],
  priority: SuitePriority = { favor: "quality" },
  /** Your model catalog: providers (for the fallback) and retirements. */
  models: ModelCatalog = {},
): Suggestion<R> | null {
  const provider = (model: string) => models[model]?.provider ?? model;
  const retiring = (r: SuggestRow) => retiresLabel(models, r.model);
  const limitMs = priority.maxSeconds ? priority.maxSeconds * 1000 : Infinity;
  const tooSlow = (r: SuggestRow) => ms(r) !== Infinity && ms(r) > limitMs;
  const tested = rows.filter(
    (r) =>
      r.test &&
      !r.test.stale &&
      !r.test.failedAnswers &&
      !retiring(r) &&
      !tooSlow(r),
  );
  if (!tested.length) return null;
  const serious = (r: R) => seriousMistakes(r, checks);
  const live = tested.find((r) => r.live) ?? null;
  const reasons: string[] = [];
  const liveRow = rows.find((r) => r.live);
  const liveRetires = liveRow ? retiring(liveRow) : null;
  const liveSlow =
    liveRow?.test && !liveRow.test.stale && tooSlow(liveRow)
      ? `${liveRow.label} takes ${(ms(liveRow) / 1000).toFixed(1)}s, over this suite's ${priority.maxSeconds}s limit.`
      : null;

  // Live: switch only for a real, safe improvement.
  let next: R;
  const liveable = tested.filter((r) => !r.fallbackOnly);
  if (!live) {
    if (!liveable.length) return null;
    next = at(
      [...liveable].sort(
        (a, b) =>
          rate(b) - rate(a) || serious(a) - serious(b) || cost(a) - cost(b),
      ),
      0,
    );
    reasons.push(
      liveRetires || liveSlow
        ? `${liveRetires && liveRow ? `${liveRow.label} retires in ${liveRetires}.` : liveSlow} ${next.label} scores highest of the rest (${pct(rate(next))}) with ${mistakes(serious(next))}.`
        : `${next.label} scores highest (${pct(rate(next))}) with ${mistakes(serious(next))}. The live model has no up-to-date test to compare with.`,
    );
  } else {
    const why = (r: R): string | null => {
      if (rate(r) < rate(live)) return trade(r);
      if (r.vsLive === "BETTER")
        return `${r.label} is clearly more accurate than ${live.label}: ${pct(rate(r))} against ${pct(rate(live))}.`;
      if (serious(r) <= serious(live) - 2)
        return `${r.label} makes fewer serious mistakes than ${live.label} (${serious(r)} against ${serious(live)}), and scores at least as well (${pct(rate(r))} against ${pct(rate(live))}).`;
      if (priority.favor === "cost" && clearlyLess(cost(r), cost(live)))
        return `${r.label} scores at least as well as ${live.label} (${pct(rate(r))} against ${pct(rate(live))}) at ${Math.round((1 - cost(r) / cost(live)) * 100)}% less per answer.`;
      if (priority.favor === "speed" && clearlyLess(ms(r), ms(live)))
        return `${r.label} scores at least as well as ${live.label} (${pct(rate(r))} against ${pct(rate(live))}) and answers faster (${(ms(r) / 1000).toFixed(1)}s against ${(ms(live) / 1000).toFixed(1)}s).`;
      return null;
    };
    // Cost and speed suites: a little less accurate, no clear difference,
    // and at most half the cost (or time).
    const trade = (r: R): string | null => {
      if (
        priority.favor === "quality" ||
        r.vsLive !== "SAME" ||
        rate(live) - rate(r) > MAX_TRADE_DROP ||
        serious(r) > serious(live)
      )
        return null;
      const close = `${r.label} is about as accurate as ${live.label} (${pct(rate(r))} against ${pct(rate(live))}: closer than these cases can tell apart), with no more serious mistakes`;
      if (priority.favor === "cost" && cost(r) <= cost(live) * HALF)
        return `${close}, at ${Math.round((1 - cost(r) / cost(live)) * 100)}% less per answer. This suite favors cost.`;
      if (priority.favor === "speed" && ms(r) <= ms(live) * HALF)
        return `${close}, and answers in ${(ms(r) / 1000).toFixed(1)}s against ${(ms(live) / 1000).toFixed(1)}s. This suite favors speed.`;
      return null;
    };
    const candidates = liveable
      .filter(
        (r) =>
          !r.live &&
          r.vsLive !== "WORSE" &&
          serious(r) <= serious(live) &&
          why(r),
      )
      .sort(
        (a, b) =>
          Number(b.vsLive === "BETTER") - Number(a.vsLive === "BETTER") ||
          // A trade-off only when nothing scores as well.
          Number(rate(b) >= rate(live)) - Number(rate(a) >= rate(live)) ||
          rate(b) - rate(a) ||
          serious(a) - serious(b) ||
          (priority.favor === "speed"
            ? ms(a) - ms(b) || cost(a) - cost(b)
            : cost(a) - cost(b) || ms(a) - ms(b)),
      );
    if (candidates.length) {
      next = at(candidates, 0);
      const reason = why(next);
      if (reason) reasons.push(reason);
    } else {
      next = live;
      reasons.push(
        `Keep ${live.label}: no other model is safely better on these cases.`,
      );
      // The one to watch: scored higher, but not by enough to tell.
      const watch = tested
        .filter((r) => !r.live && rate(r) > rate(live))
        .sort((a, b) => rate(b) - rate(a))[0];
      if (watch)
        reasons.push(
          `${watch.label} scored highest (${pct(rate(watch))} against ${pct(rate(live))}), but with this many cases the gap can't be told from noise${serious(watch) > serious(live) ? `, and it makes more serious mistakes (${serious(watch)} against ${serious(live)})` : ""}. Add cases, then test again.`,
        );
    }
  }

  // Fallback: the most accurate from another provider, at the operation's
  // setting (the setting is shared, so setting rows don't qualify).
  const fallback =
    tested
      .filter(
        (r) =>
          !r.variant &&
          !r.liveOnly &&
          r.key !== next.key &&
          provider(r.model) !== provider(next.model),
      )
      .sort(
        (a, b) =>
          rate(b) - rate(a) || serious(a) - serious(b) || cost(a) - cost(b),
      )[0] ?? null;
  if (fallback)
    reasons.push(
      `Fallback: ${fallback.label} is the most accurate from another provider (${pct(rate(fallback))}, ${mistakes(serious(fallback))}).`,
    );

  const keepLive = next.live;
  return {
    live: next,
    fallback,
    keepLive,
    same: keepLive && (!fallback || fallback.fallback),
    reasons,
  };
}
