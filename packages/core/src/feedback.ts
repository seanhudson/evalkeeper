import type { NewCase } from "./store.js";
import type { AnySuite } from "./types.js";
import { thumbsAlert } from "./upkeepRules.js";

/**
 * Thumbs up and down on AI answers in your product, and turning them into
 * draft cases. A rating says how a real answer landed; a case made from it
 * tests the next model on the same input. Pure, except the store.
 */

/** A thumbs up or a thumbs down. */
export type Rating = "UP" | "DOWN";

/** OPEN: waiting for a look. CASED: made into a case. DISMISSED: not useful. */
export type FeedbackStatus = "OPEN" | "CASED" | "DISMISSED";

/** A person's rating of one AI answer in your product, as stored. */
export type FeedbackRecord = {
  id: string;
  /** The AI feature that wrote the answer. */
  operation: string;
  /** What was rated, in your app: a message id, a summary id, … */
  targetId: string;
  /** Who rated it, in your app; one rating per person per answer. */
  raterId: string;
  rating: Rating;
  /** What was wrong, in their words (a thumbs down). */
  reason: string | null;
  /** The text they rated, when your app doesn't keep it elsewhere. */
  excerpt: string | null;
  /**
   * The suite input that produced the answer, de-identified, kept only
   * with the person's consent. Without it a rating can't become a case.
   */
  input: unknown;
  /** The answer as the operation returned it. */
  output: unknown;
  status: FeedbackStatus;
  /** The case made from it. */
  caseId: string | null;
  createdAt: Date;
  updatedAt: Date;
  /**
   * False when the store has no column for inputs (an app's own thumbs
   * table that never kept them), so no rating from it can become a case.
   * Stores that keep inputs leave it out.
   */
  keepsInputs?: boolean;
};

/** A rating to save; `cleanRating` trims and bounds it. */
export type NewRating = {
  operation: string;
  targetId: string;
  raterId: string;
  rating: Rating;
  reason?: string | null;
  excerpt?: string | null;
  input?: unknown;
  output?: unknown;
};

/** Where ratings live. `@crowandraven/evalkeeper/prisma` and `memoryStore` implement it. */
export interface FeedbackStore {
  /**
   * Saves a person's rating of an answer, replacing their earlier one. A
   * changed rating reopens it.
   */
  rate(rating: NewRating): Promise<FeedbackRecord>;
  /** Takes a person's rating back. */
  clearRating(
    raterId: string,
    operation: string,
    targetId: string,
  ): Promise<void>;
  /** Newest first. */
  listFeedback(opts?: {
    operation?: string;
    rating?: Rating;
    status?: FeedbackStatus;
    since?: Date;
    limit?: number;
  }): Promise<FeedbackRecord[]>;
  setFeedbackStatus(
    id: string,
    status: FeedbackStatus,
    caseId?: string | null,
  ): Promise<void>;
}

/** Longest reason and excerpt kept, so one rating can't fill a table. */
export const REASON_MAX = 1_000;
/** The longest rated excerpt kept. */
export const EXCERPT_MAX = 2_000;

/** A rating as it should be stored: trimmed, bounded, a reason only on a thumbs down. */
export function cleanRating(r: NewRating): Required<NewRating> {
  const trim = (s: string | null | undefined, max: number) => {
    const t = s?.trim().slice(0, max);
    return t ? t : null;
  };
  return {
    operation: r.operation,
    targetId: r.targetId.slice(0, 200),
    raterId: r.raterId,
    rating: r.rating,
    reason: r.rating === "DOWN" ? trim(r.reason, REASON_MAX) : null,
    excerpt: trim(r.excerpt, EXCERPT_MAX),
    input: r.input ?? null,
    output: r.output ?? null,
  };
}

/** Why no rating can become a case when the store keeps no inputs. */
export const NO_INPUTS_KEPT =
  "This app doesn't keep inputs with ratings, so a rating can't become a case.";

/**
 * Why a rating can't become a case for this suite, or null when it can. A
 * case needs the input that produced the answer, in the suite's shape, so
 * a rating from a store that keeps no inputs (`keepsInputs: false`) never
 * can.
 *
 * @param f - The rating.
 * @param suite - The suite that tests its feature, if any.
 */
export function whyNotACase(
  f: FeedbackRecord,
  suite: AnySuite | undefined,
): string | null {
  if (f.keepsInputs === false) return NO_INPUTS_KEPT;
  if (!suite) return "No suite tests this feature yet.";
  if (f.input === null || f.input === undefined)
    return "The input behind this answer wasn't kept, so there's nothing to test.";
  if (!suite.input.safeParse(f.input).success)
    return "The kept input doesn't match the suite's input any more.";
  return null;
}

/**
 * A draft case from a rating, for a person to finish. A thumbs down has no
 * answer yet: the person writes what a good one is. A thumbs up proposes
 * the model's own answer, pending until a person confirms it. Never
 * confirmed on anyone's behalf. Null when it can't become a case
 * (`whyNotACase` says why in plain words, including when the store keeps
 * no inputs at all).
 *
 * @example
 * ```ts
 * const suite = SUITES.find(
 *   (s) => s.operation === rating.operation && !isInjectionSuite(s),
 * );
 * const draft = suite ? caseFromFeedback(rating, suite) : null;
 * if (draft) await store.createCase(draft);
 * ```
 */
export function caseFromFeedback(
  f: FeedbackRecord,
  suite: AnySuite,
): NewCase | null {
  if (whyNotACase(f, suite)) return null;
  const proposed =
    f.rating === "UP" && suite.labelFromOutput && f.output !== null
      ? suite.labelFromOutput(f.output)
      : null;
  const note =
    f.rating === "DOWN"
      ? `From a thumbs down${f.reason ? `: "${f.reason}"` : "."} Write what a good answer is.`
      : "From a thumbs up: the model's answer is proposed. Confirm it if it's right.";
  return {
    suite: suite.key,
    input: suite.input.parse(f.input),
    tags: ["feedback", f.rating === "DOWN" ? "thumbs down" : "thumbs up"],
    split: "DEV",
    status: "DRAFT",
    source: "FEEDBACK",
    sourceRef: f.id,
    note,
    labels:
      proposed === null
        ? []
        : [
            {
              kind: "EXPECTED",
              status: "PENDING",
              value: proposed,
              raterRole: "FEEDBACK",
              raterId: null,
              note: "The model's answer, rated thumbs up.",
            },
          ],
  };
}

/**
 * One feature's ratings over a period: up, down, the share down, whether it needs a look,
 * and how many thumbs down nobody has looked at.
 */
export type ThumbsSummary = {
  operation: string;
  up: number;
  down: number;
  /** Share of ratings that were thumbs down; null with none. */
  downShare: number | null;
  /** Enough ratings, and enough of them down, to look at. */
  alert: boolean;
  /** Thumbs down nobody has looked at yet. */
  open: number;
};

/**
 * Ratings per feature since a date, most thumbs down first. A feature is
 * flagged when it has at least THUMBS_MIN ratings and at least
 * THUMBS_DOWN_SHARE of them are down.
 */
export function thumbsSummary(
  feedback: FeedbackRecord[],
  since: Date,
): ThumbsSummary[] {
  const by = new Map<string, ThumbsSummary>();
  for (const f of feedback) {
    if (f.updatedAt < since) continue;
    const s = by.get(f.operation) ?? {
      operation: f.operation,
      up: 0,
      down: 0,
      downShare: null,
      alert: false,
      open: 0,
    };
    if (f.rating === "UP") s.up++;
    else {
      s.down++;
      if (f.status === "OPEN") s.open++;
    }
    by.set(f.operation, s);
  }
  return [...by.values()]
    .map((s) => ({
      ...s,
      downShare: s.up + s.down ? s.down / (s.up + s.down) : null,
      alert: thumbsAlert(s.up, s.down),
    }))
    .sort((a, b) => b.down - a.down || a.operation.localeCompare(b.operation));
}
