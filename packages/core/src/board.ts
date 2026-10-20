import type { Verdict } from "./compare.js";
import type { SuiteMetrics } from "./stats.js";

/**
 * One row of a suite's model board: a model (and reasoning setting) with
 * its latest test on every case in use, and how it compares with the live
 * model. Storage adapters build these; health, attention, and suggest read
 * them.
 */
export type BoardRow = {
  /** Model and reasoning setting together. */
  key: string;
  model: string;
  /** The reasoning setting; null: the model's own default. */
  effort: string | null;
  /** At a setting other than the operation's (a "Test a setting" row). */
  variant: boolean;
  label: string;
  live: boolean;
  fallback: boolean;
  /** Code, not a model (`ModelInfo.baseline`): compared, never made live or the fallback. */
  baseline: boolean;
  testing: boolean;
  /** The newest test failed: why, in a line. Older results still show. */
  failed: string | null;
  /** Estimated from real usage, for models not tested yet. */
  estCostPerAnswer: number | null;
  test: {
    runId: string;
    at: Date;
    /** Parts right of parts expected (or answers, where a suite has no parts). */
    right: number;
    total: number;
    /** Answers with every check passed. */
    answersRight: number;
    answers: number;
    /** Pass rate of each check, for the breakdown table. */
    byCheck: SuiteMetrics["byCheck"];
    /** Per check, probability measures (decision suites); empty otherwise. */
    measures: NonNullable<SuiteMetrics["measures"]>;
    avgMs: number | null;
    costPerAnswer: number | null;
    /** Cases, answers, or instructions changed since: test again. */
    stale: boolean;
    /** Answers that failed (no score), and the usual reason. */
    failedAnswers: number;
    failureReason: string | null;
  } | null;
  /** Against the live model's test, when both are current. */
  vsLive: Verdict | null;
  canMakeLive: boolean;
  /** Tested, current, and from another provider than the live model. */
  canMakeFallback: boolean;
  /** Can be live but not the fallback (a model that only answers typed questions). */
  liveOnly: boolean;
  /** Can be the fallback but not live. */
  fallbackOnly: boolean;
};
