/**
 * A test longer than one request's time limit runs in legs: each leg
 * answers what it can, then hands the rest to a fresh request. Pure.
 */

/** At most this many legs (about half an hour) before a test gives up. */
export const MAX_LEGS = 6;

/**
 * Whether a leg that ran out of time should hand off: only when it made
 * progress (so a stuck case can't loop), or began after its time was up
 * (a test queued behind others), and legs remain.
 */
export function shouldContinue(opts: {
  /** Answers left for a later leg. */
  left: number;
  /** Answers this leg gave. */
  done: number;
  leg: number;
  outOfCredits: boolean;
  /** The leg began with no time left, so it tried nothing. */
  late?: boolean;
}): boolean {
  return (
    opts.left > 0 &&
    (opts.done > 0 || !!opts.late) &&
    !opts.outOfCredits &&
    opts.leg < MAX_LEGS
  );
}

/**
 * Whether a test still marked running was stopped by the server: nothing
 * started or answered within `stuckMs`. Legs keep it alive.
 */
export function isStuck(
  startedAt: Date,
  lastAnswerAt: Date | null,
  now: number,
  stuckMs: number,
): boolean {
  const last = Math.max(+startedAt, lastAnswerAt ? +lastAnswerAt : 0);
  return now - last > stuckMs;
}
