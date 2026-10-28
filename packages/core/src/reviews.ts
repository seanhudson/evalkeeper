import { stableJson } from "./stableJson.js";
import type { CaseRecord, EvalStore, NewLabel } from "./store.js";
import type { AnySuite } from "./types.js";

/**
 * Reviews that ship with a suite: a person checked a starter case's answer
 * once, for every app that uses the suite, so it arrives confirmed instead
 * of pending. It's still a person's confirmation, never one made on their
 * behalf: each review names who, when, and what qualifies them, and only
 * counts for the exact input and answer they saw.
 */

/**
 * Who reviewed a shipped case: the suite's author ("AUTHOR"), or someone
 * with experience in what the suite judges ("EXPERT"), such as a crisis
 * line counselor for the crisis risk suite.
 */
export type ReviewLevel = "AUTHOR" | "EXPERT";

/** The `raterRole` on an answer the suite's author reviewed. */
export const AUTHOR_REVIEWED = "SUITE_AUTHOR";
/** The `raterRole` on an answer an expert reviewed for the suite. */
export const EXPERT_REVIEWED = "SUITE_EXPERT";

const ROLE: Record<ReviewLevel, string> = {
  AUTHOR: AUTHOR_REVIEWED,
  EXPERT: EXPERT_REVIEWED,
};

/**
 * One person's review of one starter case, shipped with the suite. It
 * counts only while the case's input and answer are what the reviewer
 * saw: edit either and the case arrives pending again, and the suite
 * contract fails until the review is redone or removed.
 */
export type ShippedReview = {
  /** The case reviewed: `starterKey` of its input. */
  case: string;
  /** The answer they confirmed, in the suite's answer shape. */
  label: unknown;
  level: ReviewLevel;
  /** Who reviewed it, shown with the answer. */
  by: string;
  /** What qualifies them ("suite author", "crisis line counselor"). */
  credential: string;
  /** The day they reviewed it, as YYYY-MM-DD. */
  at: string;
};

/**
 * A short, stable key for a starter case: a hash of its input. Reviews
 * name cases by it, and `importStarters` uses it as the case's id, so a
 * rerun skips cases already added.
 *
 * @param input - The starter case's input.
 */
export function starterKey(input: unknown): string {
  // FNV-1a: the core stays free of node:crypto; this only names rows.
  let h = 0x811c9dc5;
  for (const ch of stableJson(input)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/**
 * Whether an answer's confirmation shipped with the suite (author or
 * expert reviewed) rather than coming from someone in the app.
 *
 * @param label - The answer, or just its rater role.
 */
export function isShippedReview(label: { raterRole: string }): boolean {
  return (
    label.raterRole === AUTHOR_REVIEWED || label.raterRole === EXPERT_REVIEWED
  );
}

/** A review's day, or null when it isn't a real YYYY-MM-DD date. */
function dayOf(at: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(at)) return null;
  const d = new Date(`${at}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== at
    ? null
    : d;
}

/** The suite's answer, parsed, as stable text to compare; null if it doesn't fit. */
function answerText(suite: AnySuite, label: unknown): string | null {
  const parsed = suite.labelValue.safeParse(label);
  return parsed.success ? stableJson(parsed.data) : null;
}

/**
 * What's wrong with one review against the suite's starters, in plain
 * sentences; empty when it counts.
 */
function problemsOf(
  suite: AnySuite,
  r: ShippedReview,
  answers: Map<string, string | null>,
  now: Date,
): string[] {
  const out: string[] = [];
  const name = `${suite.key}: the review of case ${r.case}`;
  if (!answers.has(r.case))
    out.push(
      `${name} matches no starter case; its input changed or it was removed.`,
    );
  else {
    const mine = answerText(suite, r.label);
    if (mine === null)
      out.push(`${name} has an answer that doesn't fit the schema.`);
    else if (mine !== answers.get(r.case))
      out.push(`${name} confirms a different answer than the case has now.`);
  }
  if (!r.by.trim()) out.push(`${name} doesn't say who reviewed it.`);
  if (!r.credential.trim())
    out.push(`${name} doesn't say what qualifies the reviewer.`);
  const day = dayOf(r.at);
  if (!day) out.push(`${name} has no date as YYYY-MM-DD.`);
  else if (day > now) out.push(`${name} is dated in the future.`);
  return out;
}

/** Each starter's key and its answer as stable text. */
function starterAnswers(suite: AnySuite): Map<string, string | null> {
  return new Map(
    (suite.starter ?? []).map((s) => [
      starterKey(s.input),
      answerText(suite, s.label),
    ]),
  );
}

/**
 * What's wrong with a suite's shipped reviews, in plain sentences; empty
 * when every one counts. A review that matches no starter, confirms a
 * different answer than the case has now, or is missing who, what
 * qualifies them, or when, is a problem: `suiteContractProblems` reports
 * these so a stale review is fixed, not silently ignored.
 *
 * @param suite - The suite whose `reviews` to check.
 * @param now - Today; reviews dated after it are a problem.
 */
export function reviewProblems(
  suite: AnySuite,
  now: Date = new Date(),
): string[] {
  const answers = starterAnswers(suite);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const r of suite.reviews ?? []) {
    out.push(...problemsOf(suite, r, answers, now));
    const id = `${r.case}|${r.level}|${r.by.trim()}`;
    if (seen.has(id))
      out.push(
        `${suite.key}: case ${r.case} has the same ${r.level.toLowerCase()} review twice.`,
      );
    seen.add(id);
  }
  return out;
}

/**
 * The confirmed answer a review adds to a case.
 *
 * @param suite - The suite the review shipped with.
 * @param r - A review that counts (see `reviewProblems`).
 */
export function reviewedLabel(suite: AnySuite, r: ShippedReview): NewLabel {
  const who = r.level === "EXPERT" ? "an expert" : "the suite's author";
  return {
    kind: "EXPECTED",
    status: "CONFIRMED",
    value: suite.labelValue.parse(r.label),
    raterRole: ROLE[r.level],
    raterId: r.by.trim(),
    note: `Reviewed by ${who} for the ${suite.label} suite: ${r.by.trim()} (${r.credential.trim()}) confirmed it on ${r.at}.`,
  };
}

/** What adding a suite's shipped reviews did. */
export type ReviewResult = {
  /** Confirmed answers added from the suite's reviews. */
  reviewed: number;
  /**
   * Cases whose own confirmed or provisional answer, from someone in the
   * app, differs from a shipped review. The app's answer stays; these are
   * listed for a person to look at.
   */
  disagree: { caseId: string; review: ShippedReview }[];
};

/** The newest answer someone in the app put to use, if any. */
function appAnswer(c: CaseRecord) {
  return [...c.labels]
    .filter(
      (l) =>
        (l.status === "CONFIRMED" || l.status === "PROVISIONAL") &&
        !isShippedReview(l),
    )
    .sort((a, b) => +b.updatedAt - +a.updatedAt)[0];
}

/**
 * Adds a suite's shipped reviews to its starter cases already in the
 * store, as confirmed answers. Safe to run again: a review already added
 * is skipped. A case whose own confirmed or provisional answer came from
 * someone in the app keeps it: the review is never added over it, and a
 * different answer is reported in `disagree`. Reviews that don't count
 * (see `reviewProblems`) are left out. `importStarters` runs it.
 *
 * @param store - Where the suite's cases are.
 * @param suite - The suite whose `reviews` to add.
 * @param source - The `sourceRef` prefix starter cases were added under.
 * @param now - Today; reviews dated after it are left out.
 */
export async function addShippedReviews(
  store: EvalStore,
  suite: AnySuite,
  source: string,
  now: Date = new Date(),
): Promise<ReviewResult> {
  const result: ReviewResult = { reviewed: 0, disagree: [] };
  const reviews = suite.reviews ?? [];
  if (!reviews.length) return result;
  const answers = starterAnswers(suite);
  const counting = reviews.filter(
    (r) => problemsOf(suite, r, answers, now).length === 0,
  );
  const byRef = new Map(
    (await store.listCases(suite.key)).map((c) => [c.sourceRef, c]),
  );
  // Reviews added in this pass, by case: a store may or may not hand back
  // the same case objects, so don't rely on them updating.
  const added = new Set<string>();
  for (const r of counting) {
    const c = byRef.get(`${source}#${r.case}`);
    if (!c) continue;
    const label = reviewedLabel(suite, r);
    const id = `${c.id}|${label.raterRole}|${label.raterId ?? ""}`;
    if (
      added.has(id) ||
      c.labels.some(
        (l) => l.raterRole === label.raterRole && l.raterId === label.raterId,
      )
    )
      continue;
    const theirs = appAnswer(c);
    if (theirs) {
      if (stableJson(theirs.value) !== stableJson(label.value))
        result.disagree.push({ caseId: c.id, review: r });
      continue;
    }
    await store.addLabel(c.id, label);
    added.add(id);
    if (c.status === "DRAFT" && !added.has(c.id)) {
      await store.setCaseStatus(c.id, "ACTIVE");
      added.add(c.id);
    }
    result.reviewed += 1;
  }
  return result;
}
