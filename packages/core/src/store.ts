import type { CheckResult } from "./types.js";
import type { SuiteMetrics } from "./stats.js";

/**
 * Where Evalkeeper keeps cases, answers, tests, and outputs. The runner
 * talks only to this interface: `@crowandraven/evalkeeper-prisma` implements it on your
 * database, and `memoryStore()` keeps everything in memory for tests and
 * demos. Every method is a plain read or write; the rules live in the
 * runner.
 */

/** ALL: every case in use. SMOKE: the quick set. DEV and TEST: by split. */
export type EvalSet = "ALL" | "SMOKE" | "DEV" | "TEST";
/** Every set of cases a test can run on. */
export const EVAL_SETS: EvalSet[] = ["ALL", "SMOKE", "DEV", "TEST"];

/**
 * Where an answer stands: pending review, confirmed, provisional, or
 * rejected. SKIPPED isn't an answer: it marks a case one rater passed on
 * when rating blind (see `skipMark`), with no value, so it's never graded
 * against and doesn't change what tests use.
 */
export type LabelStatus =
  "PENDING" | "CONFIRMED" | "PROVISIONAL" | "REJECTED" | "SKIPPED";

/**
 * An answer to a case. EXPECTED is what a good answer looks like; a case's
 * newest CONFIRMED one is what tests grade against. PENDING answers (from a
 * model, or not yet reviewed) are never graded against; PROVISIONAL ones are
 * put to use before review and say so.
 */
export type LabelRecord = {
  id: string;
  kind: "EXPECTED";
  status: LabelStatus;
  value: unknown;
  /** Who gave it: "OWNER", "MODEL", a reviewer's role. */
  raterRole: string;
  raterId: string | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/** A stored case: a frozen input, its tags and set, and its answers. */
export type CaseRecord = {
  id: string;
  suite: string;
  /** The suite's input, frozen. */
  input: unknown;
  tags: string[];
  split: "DEV" | "TEST";
  status: "DRAFT" | "ACTIVE" | "RETIRED";
  /** Where it came from: "OWNER", "MODEL_DRAFT", "FEEDBACK", … */
  source: string;
  /** What it was made from (an id in your app), to avoid adding it twice. */
  sourceRef: string | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
  labels: LabelRecord[];
};

/** Where a test stands. */
export type RunStatus = "RUNNING" | "SUCCEEDED" | "FAILED";

/** What the runner stores on a finished test. */
export type RunMetrics = SuiteMetrics & {
  judgeCostUsd: number;
  failureReason: string | null;
};

/**
 * A stored test: one suite on one model, with what it ran with and its metrics.
 */
export type RunRecord = {
  id: string;
  suite: string;
  model: string;
  /** Hash of the instructions it ran with (see `instructionsHash`). */
  promptVersion: string;
  /** The reasoning setting tested; null: the model's own default. */
  reasoningEffort: string | null;
  /**
   * The temperature tested; null or unset: none sent. Stores keep it, so a
   * test at another temperature than the live one shows as out of date.
   */
  temperature?: number | null;
  /**
   * The output-token cap tested; null or unset: the call's own default.
   * Kept like temperature: a test at another cap is out of date.
   */
  maxOutputTokens?: number | null;
  set: EvalSet;
  repeats: number;
  /** Changes when the cases or their answers do, so tests compare. */
  datasetVersion: string | null;
  /** The suite's grader version when last graded. */
  graderVersion: string;
  status: RunStatus;
  metrics: RunMetrics | null;
  error: string | null;
  estimatedCostUsd: number | null;
  /** Who started it; null for a scheduled check. */
  startedBy: string | null;
  startedAt: Date;
  finishedAt: Date | null;
};

/** One stored answer in a test, with its grades, cost, and time. */
export type OutputRecord = {
  id: string;
  runId: string;
  caseId: string;
  repeat: number;
  /** The request's hash, so an identical one is reused, not paid twice. */
  requestHash: string;
  output: unknown;
  /** Why the answer failed; null when it came back. */
  error: string | null;
  scores: CheckResult[] | null;
  costUsd: number;
  ms: number;
  /** Copied from an identical earlier request: cost nothing this time. */
  reused: boolean;
  createdAt: Date;
};

/** A test to record; the store fills in the id, times, and status. */
export type NewRun = Omit<
  RunRecord,
  "id" | "startedAt" | "finishedAt" | "status" | "metrics" | "error"
>;
/** An answer to record. */
export type NewOutput = Omit<OutputRecord, "id" | "createdAt">;
/** An answer to add to a case. */
export type NewLabel = Omit<LabelRecord, "id" | "createdAt" | "updatedAt">;
/** A case to create, with its first answers. */
export type NewCase = Omit<
  CaseRecord,
  "id" | "createdAt" | "updatedAt" | "labels"
> & {
  labels?: NewLabel[];
};

/**
 * Where Evalkeeper keeps cases, answers, tests, and outputs. Implement it for another
 * database, and run describeStoreContract against it.
 */
export interface EvalStore {
  /**
   * A suite's cases that aren't retired, with their answers, oldest first.
   * With `includeRetired`, retired ones too (an import checks them, so a
   * case someone retired isn't added again).
   */
  listCases(
    suite: string,
    opts?: { includeRetired?: boolean },
  ): Promise<CaseRecord[]>;
  createCase(data: NewCase): Promise<CaseRecord>;
  /**
   * Adds an answer to a case (answers are never overwritten). A SKIPPED
   * mark (value null) is kept the same way, and leaves the case's
   * `updatedAt` alone, so a skip doesn't make tests out of date.
   */
  addLabel(caseId: string, label: NewLabel): Promise<LabelRecord>;
  /** Changes an answer's status, e.g. a person confirming a draft. */
  setLabelStatus(labelId: string, status: LabelStatus): Promise<void>;
  /** Changes a case's status, e.g. retiring it. */
  setCaseStatus(caseId: string, status: CaseRecord["status"]): Promise<void>;
  getRun(id: string): Promise<RunRecord | null>;
  /** Newest first. */
  listRuns(
    suite: string,
    opts?: { status?: RunStatus; limit?: number },
  ): Promise<RunRecord[]>;
  createRun(data: NewRun): Promise<RunRecord>;
  updateRun(
    id: string,
    patch: Partial<Omit<RunRecord, "id">>,
    /** Only if the run still has this status (a guard against races). */
    onlyIf?: { status: RunStatus },
  ): Promise<void>;
  listOutputs(runId: string): Promise<OutputRecord[]>;
  /** The newest original (not reused, no error) output with this hash. */
  findReusableOutput(
    requestHash: string,
    since: Date,
  ): Promise<OutputRecord | null>;
  /**
   * The outputs of several tests in one call, for the board on a remote
   * database. Optional: without it the runner calls listOutputs per test.
   */
  listOutputsFor?(runIds: string[]): Promise<OutputRecord[]>;
  /**
   * Which of these request hashes have an output findReusableOutput would
   * return, in one call, for estimating a test's cost. Optional: without it
   * the runner looks each hash up.
   */
  findReusableHashes?(
    requestHashes: string[],
    since: Date,
  ): Promise<Set<string>>;
  createOutput(data: NewOutput): Promise<OutputRecord>;
  setOutputScores(id: string, scores: CheckResult[]): Promise<void>;
}
