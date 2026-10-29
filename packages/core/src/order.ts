import type { BoardRow } from "./board.js";
import type { CheckDef, SuitePriority } from "./types.js";
import { seriousMistakes } from "./suggest.js";

/**
 * A board's rows in the order the suggestion weighs them: the suggested
 * live model first, then the live one, then models with a current test by
 * fewest serious mistakes, highest accuracy, and the suite's priority
 * (lower cost or time), then the rest. Accuracy is never traded away by
 * this order: cost and speed only break ties. Pure.
 */
export function orderRows<R extends BoardRow>(
  rows: readonly R[],
  checks: CheckDef[],
  priority: SuitePriority,
  suggested: { live: string | null } = { live: null },
): R[] {
  const current = (r: R) => !!r.test && !r.test.stale;
  const accuracy = (r: R) => (r.test?.total ? r.test.right / r.test.total : 0);
  const favored = (r: R) =>
    priority.favor === "cost"
      ? (r.test?.costPerAnswer ?? Infinity)
      : priority.favor === "speed"
        ? (r.test?.avgMs ?? Infinity)
        : 0;
  const rank = (r: R): number[] => [
    r.key === suggested.live ? 0 : 1,
    r.live ? 0 : 1,
    current(r) ? 0 : 1,
    current(r) ? seriousMistakes(r, checks) : 0,
    -accuracy(r),
    favored(r),
  ];
  return [...rows].sort((a, b) => {
    const x = rank(a);
    const y = rank(b);
    for (let i = 0; i < x.length; i++)
      if (x[i] !== y[i]) return (x[i] ?? 0) - (y[i] ?? 0);
    return 0;
  });
}

/**
 * What a model gains on the suite's priority over the live one, when
 * it's about as accurate: "4× cheaper", "2.5× faster". Null under 1.5×,
 * or when the suite favors accuracy. Pure.
 */
export function priorityGain(
  row: BoardRow,
  live: BoardRow | undefined,
  priority: SuitePriority,
): string | null {
  if (!row.test || !live?.test || priority.favor === "quality") return null;
  const [mine, theirs, word] =
    priority.favor === "cost"
      ? [row.test.costPerAnswer, live.test.costPerAnswer, "cheaper"]
      : [row.test.avgMs, live.test.avgMs, "faster"];
  if (mine === null || theirs === null || !(mine > 0) || !(theirs > 0))
    return null;
  const ratio = theirs / mine;
  if (ratio < 1.5) return null;
  const shown = ratio >= 10 ? Math.round(ratio) : Math.round(ratio * 10) / 10;
  return `${shown}× ${word}`;
}
