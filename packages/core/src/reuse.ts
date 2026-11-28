/**
 * For a suite with `reuseAnswers: false`: how long a stopped or failed
 * test's answers stay usable, so testing again picks up where it left
 * off (`Suite.resumeWithinMs`).
 */
export const RESUME_WITHIN_MS = 24 * 3_600_000;

/**
 * How long a suite that doesn't reuse answers keeps a stopped test's
 * answers, in ms: its `resumeWithinMs`, or `RESUME_WITHIN_MS`. Use it for
 * the runner's lookups and the page's wording alike.
 *
 * @param suite - The suite's reuse settings.
 */
export function resumeWithin(suite: { resumeWithinMs?: number }): number {
  return suite.resumeWithinMs ?? RESUME_WITHIN_MS;
}

/**
 * A span in plain words, for saying how long answers are kept: "an
 * hour", "6 hours", "a day", "2 days".
 *
 * @param ms - The span; under an hour reads as "an hour".
 */
export function spanText(ms: number): string {
  const hours = Math.max(1, Math.round(ms / 3_600_000));
  if (hours % 24 === 0) return hours === 24 ? "a day" : `${hours / 24} days`;
  return hours === 1 ? "an hour" : `${hours} hours`;
}
