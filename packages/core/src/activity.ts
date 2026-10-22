import { nextSplit } from "./quickSet.js";
import type { EvalStore, NewCase, NewLabel } from "./store.js";
import type { AnySuite } from "./types.js";

/**
 * Drafting cases from your app's activity: once a week, a suite with
 * `draftFromActivity` proposes cases from what its feature saw (inputs
 * people rated, inputs admins flagged), so the answer key keeps up with
 * real use. Drafts wait for a person: their answers are PENDING or
 * missing, never confirmed, and tests leave them out until then.
 */

/** `source` on cases drafted from activity. */
export const ACTIVITY_SOURCE = "ACTIVITY";
/** Added to every case drafted from activity, so they're easy to find. */
export const ACTIVITY_TAG = "activity";
/** Drafts per suite per week, unless the weekly job passes its own limit. */
export const ACTIVITY_DRAFTS_PER_WEEK = 5;

const WEEK = 7 * 86_400_000;

/** A draft the suite returned that couldn't become a case, and why. */
export type ActivityProblem = { sourceRef: string; problem: string };

/** What one suite's drafting did. */
export type ActivityDraftResult = {
  /** Cases created, as drafts. */
  drafted: number;
  /** Drafts made from something drafted before (by `sourceRef`), left alone. */
  skipped: number;
  /** Drafts past this week's allowance, left for a later week. */
  overLimit: number;
  /** Drafts whose input or answer doesn't fit the suite, or with no `sourceRef`. */
  rejected: ActivityProblem[];
};

/**
 * Asks one suite for drafts from its feature's recent activity and adds
 * them as draft cases. Each arrives with a PENDING answer (or none), so a
 * person reviews it before any test grades against it. A draft whose
 * `sourceRef` was drafted before, retired cases included, is skipped, so
 * running it again (or weeks later) never adds the same case twice. At
 * most `limit` are drafted per suite in any 7 days, counting drafts made
 * earlier that week, so upkeep stays cheap and doesn't nag. Suites
 * without `draftFromActivity` draft nothing.
 *
 * @example
 * ```ts
 * for (const suite of SUITES) {
 *   const { drafted } = await draftFromActivity({ store, suite });
 *   if (drafted) console.log(`${suite.label}: ${drafted} to review`);
 * }
 * ```
 */
export async function draftFromActivity(opts: {
  store: EvalStore;
  suite: AnySuite;
  /** Most drafts per suite per week; default ACTIVITY_DRAFTS_PER_WEEK. */
  limit?: number;
  /** Activity from this date on; default 7 days before `today`. */
  since?: Date;
  today?: Date;
}): Promise<ActivityDraftResult> {
  const { store, suite } = opts;
  const result: ActivityDraftResult = {
    drafted: 0,
    skipped: 0,
    overLimit: 0,
    rejected: [],
  };
  if (!suite.draftFromActivity) return result;
  const today = opts.today ?? new Date();
  const weekAgo = new Date(+today - WEEK);
  const limit = Math.max(0, Math.floor(opts.limit ?? ACTIVITY_DRAFTS_PER_WEEK));

  const all = await store.listCases(suite.key, { includeRetired: true });
  const mine = all.filter((c) => c.source === ACTIVITY_SOURCE);
  const known = new Set(
    mine.flatMap((c) => (c.sourceRef === null ? [] : [c.sourceRef])),
  );
  const left = limit - mine.filter((c) => c.createdAt > weekAgo).length;
  // Nothing left this week: don't even ask, so a busy week costs nothing.
  if (left <= 0) return result;

  const drafts = await suite.draftFromActivity({
    since: opts.since ?? weekAgo,
    existing: all.map((c) => ({ input: c.input, tags: c.tags })),
    limit: left,
    known,
  });

  const counts = { DEV: 0, TEST: 0 };
  for (const c of all) if (c.status !== "RETIRED") counts[c.split] += 1;
  for (const d of drafts) {
    const sourceRef = d.sourceRef.trim();
    if (!sourceRef) {
      result.rejected.push({ sourceRef: "", problem: "no sourceRef" });
      continue;
    }
    if (known.has(sourceRef)) {
      result.skipped += 1;
      continue;
    }
    const input = suite.input.safeParse(d.input);
    if (!input.success) {
      result.rejected.push({
        sourceRef,
        problem: `input: ${input.error.issues[0]?.message ?? "invalid"}`,
      });
      continue;
    }
    const labels: NewLabel[] = [];
    if (d.label !== null) {
      const label = suite.labelValue.safeParse(d.label);
      if (!label.success) {
        result.rejected.push({
          sourceRef,
          problem: `answer: ${label.error.issues[0]?.message ?? "invalid"}`,
        });
        continue;
      }
      labels.push({
        kind: "EXPECTED",
        status: "PENDING",
        value: label.data,
        raterRole: ACTIVITY_SOURCE,
        raterId: null,
        note: "Proposed from the app's activity. Confirm it if it's right.",
      });
    }
    if (result.drafted >= left) {
      result.overLimit += 1;
      continue;
    }
    const split = nextSplit(counts);
    counts[split] += 1;
    const tags = [...new Set([...d.tags, ACTIVITY_TAG])];
    const data: NewCase = {
      suite: suite.key,
      input: input.data,
      tags,
      split,
      status: "DRAFT",
      source: ACTIVITY_SOURCE,
      sourceRef,
      note: d.note || null,
      labels,
    };
    await store.createCase(data);
    known.add(sourceRef);
    result.drafted += 1;
  }
  return result;
}
