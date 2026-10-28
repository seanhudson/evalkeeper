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

/** One row of a review sheet: a starter case for a reviewer to mark. */
export type ReviewSheetRow = {
  /** The case: `starterKey` of its input. */
  case: string;
  /** The case's title, as the pages show it. */
  title: string;
  /** The whole input, so the reviewer sees what the model sees. */
  input: string;
  /** The answer to confirm, as stable JSON. */
  answer: string;
};

/**
 * A suite's starter cases as rows for a reviewer to mark, in the order
 * the suite lists them. `reviewsFromSheet` turns the rows they confirm
 * into shipped reviews.
 *
 * @param suite - The suite whose `starter` cases to list.
 */
export function reviewSheet(suite: AnySuite): ReviewSheetRow[] {
  return (suite.starter ?? []).map((s) => {
    const input = suite.input.parse(s.input);
    return {
      case: starterKey(s.input),
      title: suite.title(input),
      input: suite.describe?.(input) ?? stableJson(s.input),
      answer: stableJson(s.label),
    };
  });
}

/** Who reviewed a sheet, for every review it makes. */
export type Reviewer = Pick<
  ShippedReview,
  "level" | "by" | "credential" | "at"
>;

/** Marks that confirm a row of a review sheet. */
const CONFIRMS = new Set(["y", "yes", "ok", "confirm", "confirmed"]);

/**
 * Turns a marked review sheet into shipped reviews: one for each row the
 * reviewer confirmed ("yes", "y", "ok"), of the case's answer as it is
 * now. Rows left blank are left out. A row naming a case the suite
 * doesn't have, or marked anything else, stops it: a case whose answer
 * should change is edited in the suite first, then reviewed again.
 *
 * @param suite - The suite the sheet was made from.
 * @param rows - Each row's case and the reviewer's mark.
 * @param reviewer - Who reviewed it, what qualifies them, and when.
 * @returns The reviews, in the suite's order.
 * @throws When a row names an unknown case or has an unknown mark, or
 *   the reviewer is missing who, what qualifies them, or a date.
 */
export function reviewsFromSheet(
  suite: AnySuite,
  rows: readonly { case: string; confirm: string }[],
  reviewer: Reviewer,
): ShippedReview[] {
  const problems: string[] = [];
  if (!reviewer.by.trim()) problems.push("no reviewer (--by)");
  if (!reviewer.credential.trim())
    problems.push("no credential (--credential)");
  if (!dayOf(reviewer.at)) problems.push("no date as YYYY-MM-DD (--at)");
  const starters = new Map(
    (suite.starter ?? []).map((s) => [starterKey(s.input), s.label]),
  );
  const confirmed = new Set<string>();
  for (const r of rows) {
    const mark = r.confirm.trim().toLowerCase();
    if (!starters.has(r.case))
      problems.push(`case ${r.case} isn't one of ${suite.key}'s starters`);
    else if (CONFIRMS.has(mark)) confirmed.add(r.case);
    else if (mark)
      problems.push(
        `case ${r.case} is marked "${r.confirm.trim()}"; mark "yes" or leave it blank`,
      );
  }
  if (problems.length)
    throw new Error(`The sheet can't be signed: ${problems.join("; ")}.`);
  return [...starters].flatMap(([key, label]) =>
    confirmed.has(key)
      ? [
          {
            case: key,
            label,
            level: reviewer.level,
            by: reviewer.by.trim(),
            credential: reviewer.credential.trim(),
            at: reviewer.at,
          },
        ]
      : [],
  );
}

/**
 * A suite's reviews with one reviewer's replaced by a new set: everyone
 * else's stay as they were, and theirs (same name and level) are swapped
 * for `next`, so signing a sheet again never duplicates a review.
 *
 * @param existing - The reviews the suite ships now.
 * @param next - The reviews from the newly signed sheet.
 * @param reviewer - Whose reviews `next` replaces.
 */
export function mergeReviews(
  existing: readonly ShippedReview[],
  next: readonly ShippedReview[],
  reviewer: Pick<Reviewer, "level" | "by">,
): ShippedReview[] {
  const theirs = (r: ShippedReview) =>
    r.level === reviewer.level && r.by.trim() === reviewer.by.trim();
  return [...existing.filter((r) => !theirs(r)), ...next];
}
