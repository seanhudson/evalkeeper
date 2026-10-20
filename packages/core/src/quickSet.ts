import { at } from "./util.js";
/**
 * The quick-check set (internally SMOKE): a few cases for a cheap first
 * look, picked by the app rather than by hand. Greedy: confirmed cases
 * first, each pick covering the most tags not yet covered, oldest first
 * on ties, so the set is stable and spans what the dataset tests. Pure.
 */

export const QUICK_SET_SIZE = 8;

export function pickQuickSet<
  T extends { id: string; tags: string[]; createdAt: Date; confirmed: boolean },
>(cases: T[], size = QUICK_SET_SIZE): T[] {
  const pool = [...cases].sort(
    (a, b) =>
      Number(b.confirmed) - Number(a.confirmed) ||
      +a.createdAt - +b.createdAt ||
      a.id.localeCompare(b.id),
  );
  const covered = new Set<string>();
  const picked: T[] = [];
  while (picked.length < size && pool.length) {
    let best = 0;
    let bestGain = -1;
    pool.forEach((c, i) => {
      const gain =
        (c.confirmed ? 100 : 0) + c.tags.filter((t) => !covered.has(t)).length;
      if (gain > bestGain) {
        bestGain = gain;
        best = i;
      }
    });
    const c = at(pool.splice(best, 1), 0);
    c.tags.forEach((t) => covered.add(t));
    picked.push(c);
  }
  return picked;
}

/**
 * DEV or TEST for a new case: keeps about 40% of a suite's cases in TEST,
 * the set decisions are made on and instructions are never tuned against.
 */
export function nextSplit(counts: {
  DEV: number;
  TEST: number;
}): "DEV" | "TEST" {
  const total = counts.DEV + counts.TEST;
  return counts.TEST < Math.round((total + 1) * 0.4) ? "TEST" : "DEV";
}
