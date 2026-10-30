/**
 * What to do about answers that failed, by why they failed. Timeouts and
 * answers cut short usually fail the same way when tested again, so the
 * page says what to change instead. Pure.
 */

/** A provider's out-of-credits error, as the main providers word it. */
export const OUT_OF_CREDITS =
  /no credits remaining|credit balance is too low|insufficient_quota|exceeded your current quota|billing/i;

/** The kinds of failure with something to do about them. */
export type FailureKind = "timeout" | "cutShort" | "credits";

/** A failed answer's error as one of the kinds above; null for others. */
export function failureKind(error: string | null): FailureKind | null {
  if (!error) return null;
  if (OUT_OF_CREDITS.test(error)) return "credits";
  if (/^No answer within \d/.test(error)) return "timeout";
  // The AI SDK's words when a response ends before a whole answer: most
  // often the output limit (which reasoning shares) ran out.
  if (
    /No output generated|could not parse the response|finish reason:? length|max(imum)?[ _-]?(output[ _-]?)?tokens/i.test(
      error,
    )
  )
    return "cutShort";
  return null;
}

const HINTS: Record<FailureKind, string> = {
  timeout:
    "An answer that times out usually times out again. A lower reasoning setting answers sooner, or the suite can allow more time (answerTimeoutMs).",
  cutShort:
    "An answer that fails this way has usually run out of room before it ended: the output limit, which reasoning uses too. Testing again usually fails the same way. Raise the output limit or lower the reasoning setting, then test again.",
  credits:
    "The provider's account is out of credits. Add credits, then test again: answers already given are reused at no cost.",
};

/**
 * What to do about a set of failed answers, one hint per kind, most
 * common kind first. Empty when none has a hint.
 */
export function failureHints(errors: (string | null)[]): string[] {
  const counts = new Map<FailureKind, number>();
  for (const e of errors) {
    const k = failureKind(e);
    if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1]).map(([k]) => HINTS[k]);
}
