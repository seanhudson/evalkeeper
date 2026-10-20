/**
 * Rules for the weekly eval check, pure so they're tested: when a quick-set
 * score has drifted, when a model is about to retire, and when people's
 * thumbs-down rate needs a look.
 */

/** A drop this big on the quick set is worth a look. */
export const DRIFT_DROP = 0.15;
/** Warn about a live or fallback model this long before it retires. */
export const RETIRE_WARN_DAYS = 60;
/** Thumbs: at least this many ratings, at least this share down. */
export const THUMBS_MIN = 5;
export const THUMBS_DOWN_SHARE = 0.2;

/** This week's quick-set score against last week's: a drop worth a look. */
export function drifted(previous: number, latest: number): boolean {
  return previous - latest >= DRIFT_DROP;
}

/**
 * Days until a "YYYY-MM" or "YYYY-MM-DD" retirement; a month counts from
 * its first day. Negative once it's passed.
 */
export function daysUntil(retiring: string, today: Date): number {
  const [y = 1970, m = 1, d = 1] = retiring.split("-").map(Number);
  const when = Date.UTC(y, (m || 1) - 1, d || 1);
  return Math.floor((when - today.getTime()) / 86_400_000);
}

export function retiresSoon(retiring: string | undefined, today: Date) {
  return (
    retiring !== undefined && daysUntil(retiring, today) <= RETIRE_WARN_DAYS
  );
}

export function thumbsAlert(up: number, down: number): boolean {
  const n = up + down;
  return n >= THUMBS_MIN && down / n >= THUMBS_DOWN_SHARE;
}
