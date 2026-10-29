import { confirmedLabel, type LabelLike } from "./labels.js";
import { pickQuickSet } from "./quickSet.js";
import { stableJson } from "./stableJson.js";
import { at } from "./util.js";

/**
 * Keeping an answer key useful: cases every model gets right (easy), cases
 * models split on (worth a review), near-duplicates, drafts nobody
 * reviewed, and how the tags spread. Pure; the suite page shows these and
 * the person decides, except that stale drafts retire themselves weekly
 * (retiring is reversible).
 */

/** Easy needs at least this many current models, all fully right. */
export const EASY_MIN_MODELS = 3;
/** Split: this many models or more, with 40–60% fully right. */
export const SPLIT_MIN_MODELS = 4;
/** Easy cases kept as a regression floor, as a share of cases in use. */
export const EASY_FLOOR = 0.1;
/** Drafts unreviewed this long retire. */
export const STALE_DRAFT_DAYS = 30;
/** Inputs this similar (shared words) are near-duplicates. */
export const DUPLICATE_SIMILARITY = 0.9;

/** How one case did across the models tested on it. */
export type CaseResult = { passed: number; models: number };

/**
 * A case every tested model got right (with enough models): it no longer tells them apart.
 */
export function isEasy(r: CaseResult | undefined): boolean {
  return (
    r !== undefined && r.models >= EASY_MIN_MODELS && r.passed === r.models
  );
}

/** A case some models get right and others wrong: the most useful kind. */
export function isSplit(r: CaseResult | undefined): boolean {
  if (!r || r.models < SPLIT_MIN_MODELS) return false;
  const share = r.passed / r.models;
  return share >= 0.4 && share <= 0.6;
}

/**
 * Easy cases to retire, keeping a floor (smoke cases first, then the
 * oldest) so the suite still catches a regression on the basics.
 */
export function easyToRetire<
  C extends { id: string; smoke: boolean; createdAt: Date },
>(easy: C[], inUse: number): C[] {
  const keep = Math.max(1, Math.ceil(inUse * EASY_FLOOR));
  const ordered = [...easy].sort(
    (a, b) => Number(b.smoke) - Number(a.smoke) || +a.createdAt - +b.createdAt,
  );
  return ordered.slice(keep);
}

const words = (input: unknown) =>
  new Set(
    stableJson(input)
      .toLowerCase()
      .match(/[a-z0-9]{3,}/g) ?? [],
  );

/** Pairs of cases whose inputs share nearly all their words. */
export function nearDuplicates<C extends { id: string; input: unknown }>(
  cases: C[],
): [C, C][] {
  const sets = cases.map((c) => ({ c, w: words(c.input) }));
  const pairs: [C, C][] = [];
  for (let i = 0; i < sets.length; i++)
    for (let j = i + 1; j < sets.length; j++) {
      const x = at(sets, i);
      const y = at(sets, j);
      const a = x.w;
      const b = y.w;
      let shared = 0;
      for (const w of a) if (b.has(w)) shared++;
      const union = a.size + b.size - shared;
      if (union && shared / union >= DUPLICATE_SIMILARITY)
        pairs.push([x.c, y.c]);
    }
  return pairs;
}

/** A draft nobody has reviewed for long enough to retire. */
export function isStaleDraft(createdAt: Date, today: Date): boolean {
  return +today - +createdAt > STALE_DRAFT_DAYS * 86_400_000;
}

/** How many cases in use carry each tag, most first. */
export function tagCounts(cases: { tags: string[] }[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const c of cases)
    for (const t of c.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/** A case as answer-key health reads it. */
type HealthCase = {
  id: string;
  input: unknown;
  tags: string[];
  status: string;
  createdAt: Date;
  labels: readonly LabelLike[];
};

/**
 * A suite's answer key, sorted for upkeep: what the feature's page shows
 * under "Answer key health". Only what needs a look is non-empty.
 */
export type AnswerKeyHealth<C> = {
  /** Cases in use: not retired, with a confirmed or provisional answer. */
  inUse: number;
  /** Cases in use every current model gets fully right. */
  easy: C[];
  /** Of the easy ones, those to retire; the rest stay as a floor. */
  easyToRetire: C[];
  /** Cases in use that models divide about evenly on. */
  split: C[];
  /** Pairs of cases in use whose inputs share nearly all their words. */
  duplicates: [C, C][];
  /** Drafts nobody has reviewed in STALE_DRAFT_DAYS. */
  staleDrafts: C[];
  /** How many cases in use carry each tag, most first. */
  tags: [string, number][];
};

/**
 * A suite's answer-key health, from its cases (retired ones are ignored)
 * and how each case fared across the board's current tests. The floor of
 * easy cases keeps the quick set's first, so the weekly check still
 * catches a regression on the basics.
 *
 * @param cases - The suite's cases, with their answers.
 * @param caseResults - Per case, how many current models tested it and
 *   got it fully right (the board's `caseResults`).
 * @param today - Now, for old drafts.
 * @returns What needs a look: easy, split, and duplicate cases, old
 *   drafts, and how the tags spread.
 */
export function answerKeyHealth<C extends HealthCase>(
  cases: readonly C[],
  caseResults: Readonly<Record<string, CaseResult>>,
  today = new Date(),
): AnswerKeyHealth<C> {
  const live = cases.filter((c) => c.status !== "RETIRED");
  const inUse = live.filter((c) => confirmedLabel(c.labels));
  const drafts = live.filter((c) => !confirmedLabel(c.labels));
  const quick = new Set(
    pickQuickSet(inUse.map((c) => ({ ...c, confirmed: true }))).map(
      (c) => c.id,
    ),
  );
  const easy = inUse.filter((c) => isEasy(caseResults[c.id]));
  const retire = new Set(
    easyToRetire(
      easy.map((c) => ({ ...c, smoke: quick.has(c.id) })),
      inUse.length,
    ).map((c) => c.id),
  );
  return {
    inUse: inUse.length,
    easy,
    easyToRetire: easy.filter((c) => retire.has(c.id)),
    split: inUse.filter((c) => isSplit(caseResults[c.id])),
    duplicates: nearDuplicates(inUse),
    staleDrafts: drafts.filter((c) => isStaleDraft(c.createdAt, today)),
    tags: tagCounts(inUse),
  };
}
