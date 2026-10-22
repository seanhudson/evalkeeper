import type { CaseRecord, NewLabel } from "./store.js";

/**
 * Rating imported cases blind: one person at a time, shown only a case's
 * input, gives the answer and a reason, or skips it. What someone did with
 * an item isn't the answer (docs/lessons.md, "History isn't a verdict"),
 * and seeing what the app decided anchors the rating, so the page hides it.
 */

/**
 * The `raterRole` on answers given by rating blind, so they can be told
 * apart from answers written while looking at the app's output.
 */
export const BLIND_RATER = "BLIND_RATER";

/**
 * Where a case stands for one rater: they gave it an answer ("rated"),
 * passed on it ("skipped"), or neither yet (null). Any answer of theirs
 * counts as rated, whatever its status, so nobody is asked twice.
 *
 * @param c - The case, with its answers.
 * @param raterId - The person rating, as your app identifies them.
 */
export function raterStatus(
  c: Pick<CaseRecord, "labels">,
  raterId: string,
): "rated" | "skipped" | null {
  const theirs = c.labels.filter((l) => l.raterId === raterId);
  if (theirs.some((l) => l.status !== "SKIPPED")) return "rated";
  return theirs.length ? "skipped" : null;
}

/** One rater's place in a suite's blind rating. */
export type RateQueue = {
  /** The oldest case they haven't rated or skipped; null when none is left. */
  next: CaseRecord | null;
  /** Cases they've given an answer. */
  rated: number;
  /** Cases they passed on. */
  skipped: number;
  /** Cases still waiting for them, the next one included. */
  left: number;
};

/**
 * One rater's queue over a suite's cases: the next case to rate (the
 * oldest one they haven't rated or skipped) and how far along they are.
 * Answers other people gave don't take a case out of the queue: each
 * rater gives their own. Retired cases are left out.
 *
 * @param cases - The suite's cases, as `store.listCases` returns them.
 * @param raterId - The person rating, as your app identifies them.
 *
 * @example
 * ```ts
 * const queue = rateQueue(await store.listCases("ticket_routing"), admin.id);
 * if (queue.next) showInputOnly(queue.next.input);
 * ```
 */
export function rateQueue(
  cases: readonly CaseRecord[],
  raterId: string,
): RateQueue {
  const inUse = cases
    .filter((c) => c.status !== "RETIRED")
    .sort((a, b) => +a.createdAt - +b.createdAt);
  let rated = 0;
  let skipped = 0;
  const waiting: CaseRecord[] = [];
  for (const c of inUse) {
    const s = raterStatus(c, raterId);
    if (s === "rated") rated += 1;
    else if (s === "skipped") skipped += 1;
    else waiting.push(c);
  }
  return { next: waiting[0] ?? null, rated, skipped, left: waiting.length };
}

/**
 * The oldest case this person hasn't rated or skipped, or null when none
 * is left. See `rateQueue` for their progress too.
 *
 * @param cases - The suite's cases, as `store.listCases` returns them.
 * @param raterId - The person rating, as your app identifies them.
 */
export function nextToRate(
  cases: readonly CaseRecord[],
  raterId: string,
): CaseRecord | null {
  return rateQueue(cases, raterId).next;
}

/**
 * A blind rating as an answer to add with `store.addLabel`: confirmed,
 * since the person gave it themselves, recorded as theirs with their
 * reason. It's added beside other people's answers, never over them.
 * Throws when the reason is blank: a rating without one can't be checked
 * later.
 *
 * @param r - Who rated, the answer (already read with the suite's
 *   `labelFromForm`), and why.
 */
export function blindRating(r: {
  raterId: string;
  value: unknown;
  reason: string;
}): NewLabel {
  const reason = r.reason.trim();
  if (!reason) throw new Error("Say why: a rating needs a reason");
  if (!r.raterId) throw new Error("A rating needs a rater");
  return {
    kind: "EXPECTED",
    status: "CONFIRMED",
    value: r.value,
    raterRole: BLIND_RATER,
    raterId: r.raterId,
    note: reason,
  };
}

/**
 * A mark that this person passed on a case, to add with `store.addLabel`.
 * It has no value and is never graded against; it only keeps the case
 * out of their queue.
 *
 * @param raterId - The person who skipped it.
 */
export function skipMark(raterId: string): NewLabel {
  if (!raterId) throw new Error("A skip needs a rater");
  return {
    kind: "EXPECTED",
    status: "SKIPPED",
    value: null,
    raterRole: BLIND_RATER,
    raterId,
    note: null,
  };
}
