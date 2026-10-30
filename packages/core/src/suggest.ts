import { isBaseline, retiresLabel, type ModelCatalog } from "./models.js";
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
 * model is replaced by the best-scoring one that isn't. A live model whose
 * current test has failed answers is tested again, not replaced: it can't
 * be compared yet, and a timeout or two isn't a reason to switch. With a
 * feature's injection suites (`attacks`), a model is suggested as live only
 * with a current test against the attacks, and never with more serious
 * mistakes under attack than live; making at least two fewer is a reason
 * to switch on its own. Pure.
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
    /** The error most failed answers share, for the reason. */
    failureReason?: string | null;
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
  /**
   * Live's current test has failed answers: test it again before comparing.
   * Live stays; the reasons say why.
   */
  retestLive: boolean;
  /** Why, in plain sentences. */
  reasons: string[];
};

/**
 * One injection suite's board, as the suggestion reads it: the same
 * feature attacked, so a model's row there has the same key as on the
 * base suite's board. Build it with `attacksFrom`.
 */
export type AttackResults = {
  /** The injection suite's label, for the reasons. */
  label: string;
  rows: SuggestRow[];
  checks: CheckDef[];
};

/** What else the suggestion weighs, besides the suite's own board. */
export type SuggestOptions = {
  /**
   * The feature's injection suites, from `runner.attackBoards(suiteKey)`
   * through `attacksFrom`. Without them, attacks aren't weighed.
   */
  attacks?: AttackResults[];
};

/**
 * Injection suites' boards in the shape `suggest` reads, for its
 * `attacks` option.
 *
 * @param boards - The boards of a feature's injection suites
 *   (`runner.attackBoards`).
 * @returns One entry per injection suite.
 */
export function attacksFrom(
  boards: readonly {
    suite: { label: string; checks: CheckDef[] };
    rows: SuggestRow[];
  }[],
): AttackResults[] {
  return boards.map((b) => ({
    label: b.suite.label,
    rows: b.rows,
    checks: b.suite.checks,
  }));
}

/**
 * A model's serious mistakes on the attacks: its serious mistakes on every
 * injection suite, added up. Null when any of them has no current,
 * complete test of it, so it can't be compared yet; also null with no
 * injection suites.
 *
 * @param key - The model's row key (model and reasoning setting).
 * @param attacks - The feature's injection suites.
 */
export function attackMistakes(
  key: string,
  attacks: readonly AttackResults[],
): number | null {
  if (!attacks.length) return null;
  let total = 0;
  for (const a of attacks) {
    const r = a.rows.find((x) => x.key === key);
    if (!r?.test || r.test.stale || r.test.failedAnswers) return null;
    total += seriousMistakes(r, a.checks);
  }
  return total;
}

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

/**
 * Two scores side by side, "92% against 88%", with as many decimals as it
 * takes (up to two) when they differ but would round alike ("98.14%
 * against 98.06%"), so a reason never compares a number with itself.
 */
function against(a: number, b: number): string {
  const at = (x: number, d: number) => (x * 100).toFixed(d);
  const d = [0, 1, 2].find((n) => at(a, n) !== at(b, n)) ?? 0;
  return d === 0
    ? `${pct(a)} against ${pct(b)}`
    : `${at(a, d)}% against ${at(b, d)}%`;
}
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
  /** The feature's injection suites, to weigh attacks too. */
  opts: SuggestOptions = {},
): Suggestion<R> | null {
  const attacks = opts.attacks ?? [];
  const weighAttacks = attacks.length > 0;
  /** Serious mistakes under attack; null when not tested against them. */
  const underAttack = (r: SuggestRow) => attackMistakes(r.key, attacks);
  const attackTested = (r: SuggestRow) =>
    !weighAttacks || underAttack(r) !== null;
  const provider = (model: string) => models[model]?.provider ?? model;
  const retiring = (r: SuggestRow) => retiresLabel(models, r.model);
  const limitMs = priority.maxSeconds ? priority.maxSeconds * 1000 : Infinity;
  const tooSlow = (r: SuggestRow) => ms(r) !== Infinity && ms(r) > limitMs;
  // Baselines are code, compared on the board but never suggested.
  const tested = rows.filter(
    (r) =>
      !isBaseline(models, r.model) &&
      r.test &&
      !r.test.stale &&
      !r.test.failedAnswers &&
      !retiring(r) &&
      !tooSlow(r),
  );
  const serious = (r: R) => seriousMistakes(r, checks);
  const live = tested.find((r) => r.live) ?? null;
  const reasons: string[] = [];
  const liveRow = rows.find((r) => r.live);
  const liveRetires = liveRow ? retiring(liveRow) : null;
  const liveSlow =
    liveRow?.test && !liveRow.test.stale && tooSlow(liveRow)
      ? `${liveRow.label} takes ${(ms(liveRow) / 1000).toFixed(1)}s, over this suite's ${priority.maxSeconds}s limit.`
      : null;
  // Live was tested, but some answers failed (a timeout, say): it can't be
  // compared yet, which isn't a reason to switch (#34).
  const liveFailed =
    liveRow?.test &&
    !liveRow.test.stale &&
    liveRow.test.failedAnswers &&
    !isBaseline(models, liveRow.model) &&
    !liveRetires &&
    !liveSlow
      ? liveRow
      : null;
  if (!tested.length && !liveFailed) return null;

  // Live: switch only for a real, safe improvement.
  let next: R;
  const liveable = tested.filter((r) => !r.fallbackOnly);
  if (liveFailed?.test) {
    next = liveFailed;
    const n = liveFailed.test.failedAnswers ?? 0;
    const why = liveFailed.test.failureReason;
    reasons.push(
      `Test ${liveFailed.label} again: ${n} of its answers failed on its last test${why ? ` (${why})` : ""}, so it can't be compared yet.`,
    );
  } else if (!live) {
    if (!liveable.length) return null;
    // Only models tested against the attacks, unless none are.
    const known = liveable.filter(attackTested);
    next = at(
      [...(known.length ? known : liveable)].sort(
        (a, b) =>
          rate(b) - rate(a) ||
          serious(a) - serious(b) ||
          (underAttack(a) ?? 0) - (underAttack(b) ?? 0) ||
          cost(a) - cost(b),
      ),
      0,
    );
    reasons.push(
      liveRetires || liveSlow
        ? `${liveRetires && liveRow ? `${liveRow.label} retires in ${liveRetires}.` : liveSlow} ${next.label} scores highest of the rest (${pct(rate(next))}) with ${mistakes(serious(next))}.`
        : `${next.label} scores highest (${pct(rate(next))}) with ${mistakes(serious(next))}. The live model has no up-to-date test to compare with.`,
    );
    if (!attackTested(next))
      reasons.push(
        `No model has an up-to-date test against the attacks: test ${next.label} on them before relying on it.`,
      );
  } else {
    // At least two fewer serious mistakes on the attacks, as accurate or more.
    const attackReason = (r: R): string | null => {
      const ra = underAttack(r);
      const la = underAttack(live);
      return ra !== null && la !== null && ra <= la - 2 && rate(r) >= rate(live)
        ? `${r.label} makes fewer serious mistakes on the attacks than ${live.label} (${ra} against ${la}), and scores at least as well (${against(rate(r), rate(live))}).`
        : null;
    };
    const why = (r: R): string | null => {
      if (rate(r) < rate(live)) return trade(r);
      if (r.vsLive === "BETTER")
        return `${r.label} is clearly more accurate than ${live.label} on the cases both answered (overall ${against(rate(r), rate(live))}).`;
      if (serious(r) <= serious(live) - 2)
        return `${r.label} makes fewer serious mistakes than ${live.label} (${serious(r)} against ${serious(live)}), and scores at least as well (${against(rate(r), rate(live))}).`;
      const byAttacks = attackReason(r);
      if (byAttacks) return byAttacks;
      if (priority.favor === "cost" && clearlyLess(cost(r), cost(live)))
        return `${r.label} scores at least as well as ${live.label} (${against(rate(r), rate(live))}) at ${Math.round((1 - cost(r) / cost(live)) * 100)}% less per answer.`;
      if (priority.favor === "speed" && clearlyLess(ms(r), ms(live)))
        return `${r.label} scores at least as well as ${live.label} (${against(rate(r), rate(live))}) and answers faster (${(ms(r) / 1000).toFixed(1)}s against ${(ms(live) / 1000).toFixed(1)}s).`;
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
      const close = `${r.label} is about as accurate as ${live.label} (${against(rate(r), rate(live))}: closer than these cases can tell apart), with no more serious mistakes`;
      if (priority.favor === "cost" && cost(r) <= cost(live) * HALF)
        return `${close}, at ${Math.round((1 - cost(r) / cost(live)) * 100)}% less per answer. This suite favors cost.`;
      if (priority.favor === "speed" && ms(r) <= ms(live) * HALF)
        return `${close}, and answers in ${(ms(r) / 1000).toFixed(1)}s against ${(ms(live) / 1000).toFixed(1)}s. This suite favors speed.`;
      return null;
    };
    // Under attack: tested, and no more serious mistakes than live (when
    // live has a test to compare with).
    const liveAttack = underAttack(live);
    const safeUnderAttack = (r: R) => {
      const a = underAttack(r);
      return (
        !weighAttacks ||
        (a !== null && (liveAttack === null || a <= liveAttack))
      );
    };
    const qualifies = (r: R) =>
      !r.live &&
      r.vsLive !== "WORSE" &&
      serious(r) <= serious(live) &&
      why(r) !== null;
    const candidates = liveable
      .filter((r) => qualifies(r) && safeUnderAttack(r))
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
      const a = underAttack(next);
      if (a !== null && reason !== attackReason(next))
        reasons.push(
          liveAttack === null
            ? `On the attacks, ${next.label} makes ${mistakes(a)}. ${live.label} has no up-to-date test against the attacks to compare with.`
            : `On the attacks, ${next.label} makes ${mistakes(a)}, against ${liveAttack} for ${live.label}.`,
        );
    } else {
      next = live;
      reasons.push(
        `Keep ${live.label}: no other model is safely better on these cases.`,
      );
      // Would have been suggested, but for the attacks.
      const held = liveable.find((r) => qualifies(r) && !safeUnderAttack(r));
      if (held) {
        const a = underAttack(held);
        reasons.push(
          a === null
            ? `${held.label} would otherwise qualify, but it has no up-to-date test against the attacks. Test it on ${at(attacks, 0).label}.`
            : `${held.label} would otherwise qualify, but it makes more serious mistakes on the attacks (${a} against ${liveAttack ?? 0}).`,
        );
      }
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
          rate(b) - rate(a) ||
          serious(a) - serious(b) ||
          (underAttack(a) ?? Infinity) - (underAttack(b) ?? Infinity) ||
          cost(a) - cost(b),
      )[0] ?? null;
  if (fallback) {
    const a = underAttack(fallback);
    const attacked = !weighAttacks
      ? ""
      : a === null
        ? "; not tested against the attacks"
        : `; ${mistakes(a)} on the attacks`;
    reasons.push(
      `Fallback: ${fallback.label} is the most accurate from another provider (${pct(rate(fallback))}, ${mistakes(serious(fallback))}${attacked}).`,
    );
  }

  const keepLive = next.live;
  const retestLive = Boolean(liveFailed);
  return {
    live: next,
    fallback,
    keepLive,
    same: keepLive && !retestLive && (!fallback || fallback.fallback),
    retestLive,
    reasons,
  };
}
