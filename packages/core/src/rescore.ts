/**
 * What a rescore says when it's done, in plain words: how many tests it
 * rescored, whether it cost anything, and what's left if it stopped part
 * way. Pure, for the Rescore tests button and its tests.
 */

/**
 * A small amount in cents, as a person reads it: "under a cent",
 * "3 cents", "$1.20". Use it where a cost is usually a few cents.
 *
 * @param usd - The amount, in USD.
 */
export function centsText(usd: number): string {
  if (usd < 0.005) return "under a cent";
  if (usd < 1) {
    const c = Math.round(usd * 100);
    return `${c} ${c === 1 ? "cent" : "cents"}`;
  }
  return `$${usd.toFixed(2)}`;
}

const tests = (n: number) => `${n} ${n === 1 ? "test" : "tests"}`;

/**
 * The message after pressing Rescore tests: what it did and what it cost,
 * or, when it stopped before the end, how far it got and that pressing
 * again picks up where it left off.
 *
 * @param r - What the presses did together: tests rescored, the total, how
 *   many are left, what the judge spent, whether the suite's checks ask the
 *   judge, and whether a request failed (ran out of time) part way.
 */
export function rescoreMessage(r: {
  rescored: number;
  total: number;
  left: number;
  judgeCostUsd: number;
  judged: boolean;
  failed?: boolean;
}): { type: "success" | "error"; text: string } {
  const cost =
    r.judgeCostUsd > 0
      ? `The judge compared new wording for ${centsText(r.judgeCostUsd)}.`
      : r.judged
        ? "Free: the judge had already compared all the wording."
        : "Free: no model calls.";
  if (r.failed && r.rescored === 0 && r.total === 0)
    return {
      type: "error",
      text: "Rescoring ran out of time. What's done is kept: press Rescore tests again to pick up where it left off.",
    };
  if (r.failed || r.left > 0)
    return {
      type: "error",
      text: `Rescored ${r.rescored} of ${tests(Math.max(r.total, r.rescored + r.left))} before running out of time. What's done is kept: press Rescore tests again to pick up where it left off.${r.judgeCostUsd > 0 ? ` ${cost}` : ""}`,
    };
  if (r.total === 0)
    return { type: "success", text: "No finished tests to rescore yet." };
  return { type: "success", text: `Rescored ${tests(r.rescored)}. ${cost}` };
}
