import type { BoardRow } from "./board.js";

/**
 * What needs attention across suites, for the evals hub: the suite with
 * the most room to improve, the slowest and costliest live models, and the
 * answers waiting for review. From the same boards the suite pages show;
 * only current, complete tests count. Pure.
 */

/** One suite's board, as attention reads it. */
export type SuiteBoard = {
  key: string;
  label: string;
  rows: BoardRow[];
  /** Cases waiting for a person: drafts, and provisional answers. */
  toReview: number;
};

/**
 * What needs a look across suites: the most room to improve, the slowest and costliest
 * live models, and the answers waiting for review.
 */
export type Attention = {
  improve: { key: string; label: string; best: number; model: string } | null;
  slowest: { key: string; label: string; model: string; ms: number } | null;
  costliest: { key: string; label: string; model: string; usd: number } | null;
  review: {
    total: number;
    key: string | null;
    label: string | null;
    most: number;
  };
};

const current = (r: BoardRow) =>
  r.test && !r.test.stale && !r.test.failedAnswers ? r.test : null;

/**
 * Finds what needs a look across suites, from their boards. Only current, complete tests count.
 */
export function attention(boards: SuiteBoard[]): Attention {
  let improve: Attention["improve"] = null;
  let slowest: Attention["slowest"] = null;
  let costliest: Attention["costliest"] = null;
  for (const b of boards) {
    // The best model's score: a baseline is code, not a model to switch to.
    const tested = b.rows.filter((r) => !r.baseline && current(r));
    if (tested.length) {
      const rateOf = (r: BoardRow) => {
        const t = current(r);
        return t ? t.right / t.total : -1;
      };
      const best = tested.reduce((a, r) => (rateOf(r) > rateOf(a) ? r : a));
      const rate = rateOf(best);
      if (!improve || rate < improve.best)
        improve = { key: b.key, label: b.label, best: rate, model: best.label };
    }
    const live = b.rows.find((r) => r.live && current(r));
    const t = live && current(live);
    if (live && t?.avgMs && (!slowest || t.avgMs > slowest.ms))
      slowest = { key: b.key, label: b.label, model: live.label, ms: t.avgMs };
    if (
      live &&
      t?.costPerAnswer &&
      (!costliest || t.costPerAnswer > costliest.usd)
    )
      costliest = {
        key: b.key,
        label: b.label,
        model: live.label,
        usd: t.costPerAnswer,
      };
  }
  const most = boards.reduce<SuiteBoard | null>(
    (a, b) => (b.toReview > (a?.toReview ?? 0) ? b : a),
    null,
  );
  return {
    improve,
    slowest,
    costliest,
    review: {
      total: boards.reduce((t, b) => t + b.toReview, 0),
      key: most?.key ?? null,
      label: most?.label ?? null,
      most: most?.toReview ?? 0,
    },
  };
}
