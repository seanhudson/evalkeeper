import type { CheckMeasures } from "./stats.js";
import type { CheckResult } from "./types.js";

/**
 * Scoring for decision models: models that answer typed questions about a
 * state (pick one option, say true or false, rate on a scale) with
 * probabilities, like the AI SDK's `experimental_decide`. A decision is
 * graded twice: did it pick right, and how good were its probabilities?
 * Two models that pick right equally often can differ a lot in the second:
 * one says 90% and is right 90% of the time, the other says 99% and is
 * right 80%. Pure.
 */

/** A decision model's answer to one question, as the AI SDK returns it. */
export type DecisionAnswerLike =
  | {
      type: "choice";
      choice: string;
      probabilities?: Record<string, number> | undefined;
    }
  | { type: "boolean"; probability: number }
  | {
      type: "score";
      score: number;
      probabilities?: Record<string, number> | undefined;
    }
  | { type: "refusal" };

/** The right answer to one question: an option, true or false, or a level. */
export type DecisionExpected = string | boolean | number;

/** How one decision did. Probability measures are null when the model gave none. */
export type DecisionScore = {
  /** Picked the right option, side, or level. */
  correct: boolean;
  /** The model declined to answer. */
  refused: boolean;
  /** The probability the model gave the right answer. */
  probabilityOfTruth: number | null;
  /** The probability the model gave its own pick: how sure it was. */
  confidence: number | null;
  /**
   * Brier score, from 0 (all probability on the right answer) to 1 (all on
   * a wrong one): squared error, scaled to 0–1 for any number of options.
   */
  brier: number | null;
  /** Log loss of the right answer, capped so one sure miss can't dominate. */
  logLoss: number | null;
};

/** Probabilities below this count as this, so log loss stays finite. */
export const MIN_PROBABILITY = 1e-4;

const logLossOf = (p: number) => -Math.log(Math.max(p, MIN_PROBABILITY));

/** The option with the most probability. */
function topOf(probabilities: Record<string, number>): string | null {
  let best: string | null = null;
  let max = -Infinity;
  for (const [k, p] of Object.entries(probabilities))
    if (p > max) {
      max = p;
      best = k;
    }
  return best;
}

/** Scores one decision against its right answer. */
export function scoreDecision(
  answer: DecisionAnswerLike,
  expected: DecisionExpected,
  opts: {
    /** A score question's number of levels, for the answer's level scale. */
    levels?: number;
    /** A boolean answer counts as true at or above this. Default 0.5. */
    threshold?: number;
  } = {},
): DecisionScore {
  const none = {
    probabilityOfTruth: null,
    confidence: null,
    brier: null,
    logLoss: null,
  };
  if (answer.type === "refusal")
    return { correct: false, refused: true, ...none };

  if (answer.type === "boolean") {
    const p = answer.probability;
    const truth = expected === true;
    const pTruth = truth ? p : 1 - p;
    return {
      correct: p >= (opts.threshold ?? 0.5) === truth,
      refused: false,
      probabilityOfTruth: pTruth,
      confidence: Math.max(p, 1 - p),
      brier: (p - (truth ? 1 : 0)) ** 2,
      logLoss: logLossOf(pTruth),
    };
  }

  const right = String(expected);
  const picked =
    answer.type === "choice" ? answer.choice : String(Math.round(answer.score));
  const correct = picked === right;
  const probs = answer.probabilities;
  if (!probs || !Object.keys(probs).length)
    return { correct, refused: false, ...none };

  // Brier over every option, scaled to 0–1 (its most is 2).
  const keys = new Set([...Object.keys(probs), right]);
  let squared = 0;
  for (const k of keys)
    squared += ((probs[k] ?? 0) - (k === right ? 1 : 0)) ** 2;
  const pTruth = probs[right] ?? 0;
  const top = topOf(probs);
  return {
    correct,
    refused: false,
    probabilityOfTruth: pTruth,
    confidence: top === null ? null : (probs[top] ?? null),
    brier: squared / 2,
    logLoss: logLossOf(pTruth),
  };
}

/**
 * One question's check: passes when the model picked right, and carries
 * its probability measures (brier, logLoss, confidence, correct), which a
 * test averages and turns into a calibration error. Doesn't apply (null)
 * when there's no right answer to compare with.
 */
export function decisionCheck(
  key: string,
  answer: DecisionAnswerLike | undefined,
  expected: DecisionExpected | undefined,
  opts: {
    levels?: number;
    threshold?: number;
    describe?: (v: DecisionExpected) => string;
  } = {},
): CheckResult {
  if (expected === undefined) return { key, pass: null };
  const say = opts.describe ?? ((v: DecisionExpected) => String(v));
  if (!answer)
    return {
      key,
      pass: false,
      note: "No answer to this question",
      measures: { correct: 0 },
    };
  const s = scoreDecision(answer, expected, opts);
  const measures: Record<string, number> = { correct: s.correct ? 1 : 0 };
  if (s.brier !== null) measures.brier = s.brier;
  if (s.logLoss !== null) measures.logLoss = s.logLoss;
  if (s.confidence !== null) measures.confidence = s.confidence;
  const given =
    answer.type === "refusal"
      ? "refused"
      : answer.type === "boolean"
        ? `${Math.round(answer.probability * 100)}% true`
        : answer.type === "choice"
          ? say(answer.choice)
          : `level ${answer.score.toFixed(1)}`;
  const pct = (p: number) => `${Math.round(p * 100)}%`;
  const sure =
    answer.type === "choice" &&
    answer.probabilities?.[answer.choice] !== undefined
      ? ` (${pct(answer.probabilities[answer.choice] ?? 0)})`
      : "";
  return {
    key,
    pass: s.correct,
    ...(s.correct ? {} : { note: `Expected ${say(expected)}, got ${given}` }),
    given:
      answer.type === "boolean"
        ? `${given}, bar ${pct(opts.threshold ?? 0.5)}`
        : `${given}${sure}`,
    measures,
  };
}

/**
 * Expected calibration error: answers grouped by how sure the model was
 * (10 equal bins), and the average gap between how sure it was and how
 * often it was right, weighted by bin size. 0 is perfectly calibrated.
 * Null with no answers that carry a confidence.
 */
export function calibrationError(
  answers: { confidence: number; correct: boolean }[],
  bins = 10,
): number | null {
  if (!answers.length) return null;
  const groups = Array.from({ length: bins }, () => ({
    n: 0,
    sure: 0,
    right: 0,
  }));
  for (const a of answers) {
    const i = Math.min(bins - 1, Math.max(0, Math.floor(a.confidence * bins)));
    const g = groups[i];
    if (!g) continue;
    g.n++;
    g.sure += a.confidence;
    g.right += a.correct ? 1 : 0;
  }
  let gap = 0;
  for (const g of groups)
    if (g.n)
      gap += (g.n / answers.length) * Math.abs(g.sure / g.n - g.right / g.n);
  return gap;
}

/**
 * A test's probability quality: 1 minus the mean Brier score over its
 * checks that measured one. 1 is perfect; null when no check had
 * probabilities (a prompted model's choices, for instance).
 */
export function probabilityQuality(
  measures: Record<string, CheckMeasures>,
): number | null {
  const briers = Object.values(measures).flatMap((m) =>
    m.mean.brier === undefined ? [] : [m.mean.brier],
  );
  return briers.length
    ? 1 - briers.reduce((t, b) => t + b, 0) / briers.length
    : null;
}

/** A test's calibration error: the mean over its checks that had one. */
export function meanCalibrationError(
  measures: Record<string, CheckMeasures>,
): number | null {
  const errors = Object.values(measures).flatMap((m) =>
    m.calibrationError === null ? [] : [m.calibrationError],
  );
  return errors.length
    ? errors.reduce((t, e) => t + e, 0) / errors.length
    : null;
}
