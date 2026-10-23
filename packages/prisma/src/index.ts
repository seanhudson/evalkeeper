/**
 * Evalkeeper's tables for Prisma, and stores on your Prisma client.
 *
 * @module \@crowandraven/evalkeeper-prisma
 */
import {
  CHANGE_KINDS,
  SettingsConflict,
  cleanRating,
} from "@crowandraven/evalkeeper";
import type {
  CaseRecord,
  FeedbackRecord,
  NewRating,
  FeedbackStatus,
  FeedbackStore,
  CheckResult,
  EvalSet,
  EvalStore,
  LabelRecord,
  LabelStatus,
  OutputRecord,
  RunMetrics,
  RunRecord,
  RunStatus,
  ChangeKind,
  SettingsChange,
  SettingsStore,
  SettingsVersion,
} from "@crowandraven/evalkeeper";
import {
  Table,
  isRow,
  type ColumnMap,
  type RawDelegate,
  type Row,
} from "./mapping.js";

export type { ColumnMap } from "./mapping.js";
export * from "./contracts.js";

/**
 * An EvalStore on your Prisma client, using the models in
 * schema/evalkeeper.prisma. Pass the client you already have:
 *
 *   const store = prismaStore(prisma);
 *
 * The client is typed by the rows it returns, not by Prisma's generated
 * types, so this package works with any client generated from the schema.
 */

/** A stored JSON value, as Prisma returns it. */
type Json = unknown;

/** The rows of Evalkeeper's tables, as the schema defines them. */
export type EvalCaseRow = {
  id: string;
  suite: string;
  input: Json;
  tags: Json;
  split: string;
  status: string;
  source: string;
  sourceRef: string | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
};
/** An EvalCaseLabel row. */
export type EvalCaseLabelRow = {
  id: string;
  caseId: string;
  kind: string;
  status: string;
  value: Json;
  raterRole: string;
  raterId: string | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
};
/** An EvalRun row. */
export type EvalRunRow = {
  id: string;
  suite: string;
  model: string;
  promptVersion: string;
  reasoningEffort: string | null;
  temperature: number | null;
  maxOutputTokens: number | null;
  set: string;
  repeats: number;
  datasetVersion: string | null;
  graderVersion: string;
  status: string;
  metrics: Json;
  error: string | null;
  estimatedCostUsd: number | null;
  startedBy: string | null;
  startedAt: Date;
  finishedAt: Date | null;
};
/** An EvalOutput row. */
export type EvalOutputRow = {
  id: string;
  runId: string;
  caseId: string;
  repeat: number;
  requestHash: string;
  output: Json;
  error: string | null;
  scores: Json;
  costUsd: number;
  ms: number;
  reused: boolean;
  createdAt: Date;
};
/** An EvalJudgment row. */
export type EvalJudgmentRow = {
  key: string;
  value: Json;
  model: string;
  createdAt: Date;
};

/** The methods of a Prisma model delegate this package calls. */
type Delegate<Row> = {
  findMany(args: object): PromiseLike<Row[]>;
  findFirst(args: object): PromiseLike<Row | null>;
  findUnique(args: object): PromiseLike<Row | null>;
  create(args: object): PromiseLike<Row>;
  update(args: object): PromiseLike<Row>;
  updateMany(args: object): PromiseLike<{ count: number }>;
};

/** The part of a generated Prisma client Evalkeeper uses. */
export type PrismaEvalClient = {
  evalCase: Delegate<EvalCaseRow>;
  evalCaseLabel: Delegate<EvalCaseLabelRow>;
  evalRun: Delegate<EvalRunRow>;
  evalOutput: Delegate<EvalOutputRow>;
  evalJudgment: Delegate<EvalJudgmentRow>;
};

/** `value` when it's one of `allowed`, else `fallback`. */
function oneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof value === "string" &&
    (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

// Readers for a column's value. Rows come from the app's tables, which
// may be shaped differently (nullable where Evalkeeper's aren't), so each
// value is narrowed rather than trusted.
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const strOrNull = (v: unknown): string | null =>
  typeof v === "string" ? v : null;
const num = (v: unknown): number => (typeof v === "number" ? v : 0);
const numOrNull = (v: unknown): number | null =>
  typeof v === "number" ? v : null;
const date = (v: unknown): Date => (v instanceof Date ? v : new Date(0));
const dateOrNull = (v: unknown): Date | null => (v instanceof Date ? v : null);

const LABEL_STATUSES: readonly LabelStatus[] = [
  "PENDING",
  "CONFIRMED",
  "PROVISIONAL",
  "REJECTED",
  "SKIPPED",
];
const RUN_STATUSES: readonly RunStatus[] = ["RUNNING", "SUCCEEDED", "FAILED"];
const SETS: readonly EvalSet[] = ["ALL", "SMOKE", "DEV", "TEST"];

/**
 * A skip mark has no answer, but the value column can't be null (and
 * Prisma wants JSON null spelled with its own namespace), so a skip is
 * written as `{}` and read back as null.
 */
const SKIP_VALUE = {};

const label = (l: Row): LabelRecord => {
  const status = oneOf(l.status, LABEL_STATUSES, "PENDING");
  return {
    id: str(l.id),
    kind: "EXPECTED",
    status,
    value: status === "SKIPPED" ? null : l.value,
    raterRole: str(l.raterRole),
    raterId: strOrNull(l.raterId),
    note: strOrNull(l.note),
    createdAt: date(l.createdAt),
    updatedAt: date(l.updatedAt),
  };
};

const run = (r: Row): RunRecord => ({
  id: str(r.id),
  suite: str(r.suite),
  model: str(r.model),
  promptVersion: str(r.promptVersion),
  reasoningEffort: strOrNull(r.reasoningEffort),
  temperature: numOrNull(r.temperature),
  maxOutputTokens: numOrNull(r.maxOutputTokens),
  set: oneOf(r.set, SETS, "ALL"),
  repeats: num(r.repeats),
  datasetVersion: strOrNull(r.datasetVersion),
  graderVersion: str(r.graderVersion),
  status: oneOf(r.status, RUN_STATUSES, "FAILED"),
  // Written only by the runner, in this shape.
  metrics: (r.metrics ?? null) as RunMetrics | null,
  error: strOrNull(r.error),
  estimatedCostUsd: numOrNull(r.estimatedCostUsd),
  startedBy: strOrNull(r.startedBy),
  startedAt: date(r.startedAt),
  finishedAt: dateOrNull(r.finishedAt),
});

const output = (o: Row): OutputRecord => ({
  id: str(o.id),
  runId: str(o.runId),
  caseId: str(o.caseId),
  repeat: num(o.repeat),
  requestHash: str(o.requestHash),
  output: o.output ?? null,
  error: strOrNull(o.error),
  // Written only by the runner, in this shape.
  scores: (o.scores ?? null) as CheckResult[] | null,
  costUsd: num(o.costUsd),
  ms: num(o.ms),
  reused: o.reused === true,
  createdAt: date(o.createdAt),
});

/**
 * A value for a JSON column. Prisma reads `undefined` as "leave it alone"
 * and wants JSON null spelled out, so a missing value stays undefined.
 */
const json = (v: unknown): object | string | number | boolean | undefined =>
  v === undefined || v === null ? undefined : v;

/** A label's value for its JSON column; a skip's is `SKIP_VALUE`. */
const labelValue = (l: { status: LabelStatus; value: unknown }) =>
  l.status === "SKIPPED" ? SKIP_VALUE : json(l.value);

/** Evalkeeper's eval tables, by the names its schema gives them. */
export type EvalTable =
  "evalCase" | "evalCaseLabel" | "evalRun" | "evalOutput" | "evalJudgment";

/**
 * How Evalkeeper's eval tables map onto an app's own, for an app that had
 * eval tables before Evalkeeper. Pass it to `prismaStore` and
 * `prismaJudgmentCache`; leave out anything named the same.
 *
 * Types convert on their own: Decimal columns read as numbers, enum
 * columns as their names, and `tags` may be a `String[]` or a `Json`
 * column. Columns Evalkeeper doesn't know (a creator, a legacy results
 * column) are left alone, so they need a default or to be nullable.
 */
export type PrismaStoreMap = {
  /**
   * Each table's model on the Prisma client, as the client spells it
   * (`prisma.goldCase` is `"goldCase"`).
   */
  models?: Partial<Record<EvalTable, string>>;
  /**
   * Column names per table, keyed by Evalkeeper's field name. `null`
   * says the table has no such column (for nullable fields only): reads
   * give null, and writing a value fails rather than losing it.
   */
  fields?: {
    /** `labels` is the relation from a case to its answers. */
    evalCase?: ColumnMap<EvalCaseRow & { labels: unknown }>;
    evalCaseLabel?: ColumnMap<EvalCaseLabelRow>;
    evalRun?: ColumnMap<EvalRunRow>;
    evalOutput?: ColumnMap<EvalOutputRow>;
    evalJudgment?: ColumnMap<EvalJudgmentRow>;
  };
};

const tables = (map: PrismaStoreMap) => {
  const t = (name: EvalTable) =>
    new Table(name, map.models?.[name] ?? name, map.fields?.[name]);
  return {
    cases: t("evalCase"),
    labels: t("evalCaseLabel"),
    runs: t("evalRun"),
    outputs: t("evalOutput"),
    judgments: t("evalJudgment"),
  };
};

/**
 * An EvalStore on your Prisma client, using the models in
 * `schema/evalkeeper.prisma`.
 *
 * @param db - Your Prisma client.
 *
 * @example
 * ```ts
 * import { prismaStore } from "@crowandraven/evalkeeper-prisma";
 * const store = prismaStore(prisma);
 * const runner = createRunner({ store, suites, models, promptVersion });
 * ```
 */
export function prismaStore(db: PrismaEvalClient): EvalStore;
/**
 * An EvalStore on your own eval tables, through a mapping (see
 * `PrismaStoreMap`), for an app that had eval tables before Evalkeeper.
 *
 * @param db - Your Prisma client.
 * @param map - Where your tables differ from Evalkeeper's.
 *
 * @example
 * ```ts
 * const store = prismaStore(prisma, {
 *   fields: {
 *     evalCaseLabel: { note: "rationale" },
 *     evalRun: { set: "split", startedBy: "startedById" },
 *   },
 * });
 * ```
 */
export function prismaStore(db: object, map: PrismaStoreMap): EvalStore;
export function prismaStore(db: object, map: PrismaStoreMap = {}): EvalStore {
  const t = tables(map);
  const cases = t.cases.on(db);
  const labels = t.labels.on(db);
  const runs = t.runs.on(db);
  const outputs = t.outputs.on(db);
  const labelsOf = t.cases.col("labels") ?? "labels";
  const evalCase = (c: Row): CaseRecord => {
    return {
      id: str(c.id),
      suite: str(c.suite),
      input: c.input,
      tags: Array.isArray(c.tags)
        ? c.tags.filter((tag): tag is string => typeof tag === "string")
        : [],
      split: oneOf(c.split, ["DEV", "TEST"] as const, "DEV"),
      status: oneOf(c.status, ["DRAFT", "ACTIVE", "RETIRED"] as const, "DRAFT"),
      source: str(c.source),
      sourceRef: strOrNull(c.sourceRef),
      note: strOrNull(c.note),
      createdAt: date(c.createdAt),
      updatedAt: date(c.updatedAt),
      labels: Array.isArray(c.labels) ? t.labels.ins(c.labels).map(label) : [],
    };
  };
  const toRun = (raw: unknown) => run(t.runs.in(raw));
  const toOutput = (raw: unknown) => output(t.outputs.in(raw));
  return {
    async listCases(suite, opts) {
      const rows = await cases.findMany({
        where: t.cases.out(
          opts?.includeRetired
            ? { suite }
            : { suite, status: { not: "RETIRED" } },
        ),
        include: { [labelsOf]: true },
        orderBy: t.cases.out({ createdAt: "asc" }),
      });
      return t.cases.ins(rows).map(evalCase);
    },
    async createCase({ labels: first = [], ...data }) {
      return evalCase(
        t.cases.in(
          await cases.create({
            data: {
              ...t.cases.out({ ...data, input: json(data.input) }),
              [labelsOf]: {
                create: first.map((l) =>
                  t.labels.out({ ...l, value: labelValue(l) }),
                ),
              },
            },
            include: { [labelsOf]: true },
          }),
        ),
      );
    },
    async addLabel(caseId, data) {
      return label(
        t.labels.in(
          await labels.create({
            data: t.labels.out({ ...data, caseId, value: labelValue(data) }),
          }),
        ),
      );
    },
    async setLabelStatus(id, status) {
      await labels.update({
        where: t.labels.out({ id }),
        data: t.labels.out({ status }),
      });
    },
    async setCaseStatus(id, status) {
      await cases.updateMany({
        where: t.cases.out({ id }),
        data: t.cases.out({ status }),
      });
    },
    async getRun(id) {
      const r = await runs.findUnique({ where: t.runs.out({ id }) });
      return r ? toRun(r) : null;
    },
    async listRuns(suite, opts = {}) {
      const rows = await runs.findMany({
        where: t.runs.out({
          suite,
          ...(opts.status ? { status: opts.status } : {}),
        }),
        orderBy: t.runs.out({ startedAt: "desc" }),
        ...(opts.limit ? { take: opts.limit } : {}),
      });
      return t.runs.ins(rows).map(run);
    },
    async createRun(data) {
      return toRun(await runs.create({ data: t.runs.out(data) }));
    },
    async updateRun(id, patch, onlyIf) {
      const { metrics, ...rest } = patch;
      await runs.updateMany({
        where: t.runs.out({ id, ...(onlyIf ? { status: onlyIf.status } : {}) }),
        data: t.runs.out({
          ...rest,
          ...(metrics !== undefined ? { metrics: json(metrics) } : {}),
        }),
      });
    },
    async listOutputs(runId) {
      return t.outputs
        .ins(await outputs.findMany({ where: t.outputs.out({ runId }) }))
        .map(output);
    },
    async listOutputsFor(runIds) {
      if (!runIds.length) return [];
      return t.outputs
        .ins(
          await outputs.findMany({
            where: t.outputs.out({ runId: { in: runIds } }),
          }),
        )
        .map(output);
    },
    async findReusableHashes(requestHashes, since) {
      if (!requestHashes.length) return new Set<string>();
      const rows = await outputs.findMany({
        where: t.outputs.out({
          requestHash: { in: requestHashes },
          createdAt: { gte: since },
          error: null,
          reused: false,
        }),
        select: t.outputs.out({ requestHash: true }),
        distinct: t.outputs.names(["requestHash"]),
      });
      return new Set(t.outputs.ins(rows).map((r) => str(r.requestHash)));
    },
    async findReusableOutput(requestHash, since) {
      const o = await outputs.findFirst({
        where: t.outputs.out({
          requestHash,
          createdAt: { gte: since },
          error: null,
          reused: false,
        }),
        orderBy: t.outputs.out({ createdAt: "desc" }),
      });
      return o ? toOutput(o) : null;
    },
    async createOutput(data) {
      return toOutput(
        await outputs.create({
          data: t.outputs.out({
            ...data,
            output: json(data.output),
            scores: json(data.scores),
          }),
        }),
      );
    },
    async setOutputScores(id, scores) {
      await outputs.update({
        where: t.outputs.out({ id }),
        data: t.outputs.out({ scores }),
      });
    },
  };
}

/**
 * A judgment cache on the EvalJudgment table, for
 * `@crowandraven/evalkeeper-ai-sdk`.
 *
 * @param db - Your Prisma client.
 */
export function prismaJudgmentCache(db: PrismaEvalClient): PrismaJudgmentCache;
/**
 * A judgment cache on your own judgment table, through a mapping.
 *
 * @param db - Your Prisma client.
 * @param map - The mapping you pass `prismaStore`; only `evalJudgment` is
 *   used.
 */
export function prismaJudgmentCache(
  db: object,
  map: PrismaStoreMap,
): PrismaJudgmentCache;
export function prismaJudgmentCache(
  db: object,
  map: PrismaStoreMap = {},
): PrismaJudgmentCache {
  const { judgments: t } = tables(map);
  const judgments = t.on(db);
  return {
    async get(key) {
      const j = await judgments.findUnique({ where: t.out({ key }) });
      return j ? (t.in(j).value ?? null) : null;
    },
    async set(key, value, model) {
      try {
        await judgments.create({
          data: t.out({ key, value: json(value), model }),
        });
      } catch {
        // Already kept by a concurrent grade: the same answer either way.
      }
    },
  };
}

/** Where a judge model's answers are kept, so none is paid for twice. */
export type PrismaJudgmentCache = {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown, model: string): Promise<void>;
};

/** An EvalFeedback row. */
export type EvalFeedbackRow = {
  id: string;
  operation: string;
  targetId: string;
  raterId: string;
  rating: string;
  reason: string | null;
  excerpt: string | null;
  input: Json;
  output: Json;
  status: string;
  caseId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/** The part of a generated Prisma client the feedback store uses. */
export type PrismaFeedbackClient = {
  evalFeedback: Delegate<EvalFeedbackRow> & {
    upsert(args: object): PromiseLike<EvalFeedbackRow>;
    deleteMany(args: object): PromiseLike<{ count: number }>;
  };
};

const FEEDBACK_STATUSES: readonly FeedbackStatus[] = [
  "OPEN",
  "CASED",
  "DISMISSED",
];

/** What the rating column holds for a thumbs up and a thumbs down. */
export type RatingValues = { UP: string; DOWN: string };

const RATINGS: RatingValues = { UP: "UP", DOWN: "DOWN" };

/**
 * Column names for the feedback table, keyed by Evalkeeper's field. Like
 * `ColumnMap`, and `status` may be `null` too: a table without it reads
 * every rating as OPEN.
 */
export type FeedbackColumnMap = ColumnMap<
  Omit<EvalFeedbackRow, "status"> & { status: string | null }
>;

/**
 * How Evalkeeper's feedback table maps onto an app's own thumbs table, for
 * an app that recorded thumbs up and down before Evalkeeper. Pass it to
 * `prismaFeedbackStore` (and `deleteScopedRows`); leave out anything
 * named the same.
 *
 * A table without `input` (most thumbs tables never kept inputs) still
 * gives the weekly summary's thumbs-down alerts and the hub's counts,
 * which need only the rating, feature, and time; its ratings can't become
 * cases, and `whyNotACase` says so.
 */
export type PrismaFeedbackMap = {
  /**
   * The table's model on the Prisma client, as the client spells it
   * (`prisma.aiFeedback` is `"aiFeedback"`).
   */
  models?: { evalFeedback?: string };
  /**
   * Column names, keyed by Evalkeeper's field (`raterId: "userId"`).
   * `null` says the table has no such column (`reason`, `excerpt`,
   * `input`, `output`, `status`, or `caseId`): reads give null (a status,
   * OPEN), and writing a value fails rather than losing it.
   */
  fields?: { evalFeedback?: FeedbackColumnMap };
  /**
   * What your rating column holds for each, when it isn't UP and DOWN (an
   * enum with other names, say `{ UP: "up", DOWN: "down" }`). A value
   * that's neither reads as a thumbs up.
   */
  ratings?: RatingValues;
};

/** The feedback table, through a map. */
function feedbackTable(map: PrismaFeedbackMap = {}): Table {
  return new Table(
    "evalFeedback",
    map.models?.evalFeedback ?? "evalFeedback",
    map.fields?.evalFeedback,
  );
}

/** A model's delegate with the two methods only the feedback store calls. */
type FeedbackDelegate = RawDelegate & {
  upsert(args: object): PromiseLike<unknown>;
  deleteMany(args: object): PromiseLike<unknown>;
};

function feedbackDelegate(t: Table, db: object): FeedbackDelegate {
  const d = t.on(db);
  if (
    typeof Reflect.get(d, "upsert") !== "function" ||
    typeof Reflect.get(d, "deleteMany") !== "function"
  )
    throw new Error(
      `Your Prisma client's "${t.model}" model has no upsert or deleteMany, so it can't hold ratings.`,
    );
  // Trust boundary: a Prisma delegate, checked for both methods.
  return d as FeedbackDelegate;
}

/** Fields a rating writes that a table may have no column for. */
const RATING_TEXT = ["reason", "excerpt", "input", "output"] as const;

/**
 * A FeedbackStore on the EvalFeedback table.
 *
 * @param db - Your Prisma client.
 */
export function prismaFeedbackStore(db: PrismaFeedbackClient): FeedbackStore;
/**
 * A FeedbackStore on your own thumbs table, through a map (see
 * `PrismaFeedbackMap`), so the weekly summary's alerts and the hub's
 * counts read the ratings your app already keeps.
 *
 * @param db - Your Prisma client.
 * @param map - Where your table differs from Evalkeeper's.
 *
 * @example
 * An `aiFeedback` table with a `userId` column, a rating enum of UP and
 * DOWN, a reason, an excerpt, and times, that never kept inputs:
 * ```ts
 * const feedbackStore = prismaFeedbackStore(prisma, {
 *   models: { evalFeedback: "aiFeedback" },
 *   fields: {
 *     evalFeedback: {
 *       raterId: "userId",
 *       input: null,
 *       output: null,
 *       status: null,
 *       caseId: null,
 *     },
 *   },
 * });
 * ```
 */
export function prismaFeedbackStore(
  db: object,
  map: PrismaFeedbackMap,
): FeedbackStore;
export function prismaFeedbackStore(
  db: object,
  map?: PrismaFeedbackMap,
): FeedbackStore {
  const t = feedbackTable(map);
  const d = feedbackDelegate(t, db);
  const ratings = map?.ratings ?? RATINGS;
  const keepsInputs = t.col("input") !== null;
  const hasStatus = t.col("status") !== null;
  const toRecord = (f: Row): FeedbackRecord => {
    return {
      id: str(f.id),
      operation: str(f.operation),
      targetId: str(f.targetId),
      raterId: str(f.raterId),
      rating: f.rating === ratings.DOWN ? "DOWN" : "UP",
      reason: strOrNull(f.reason),
      excerpt: strOrNull(f.excerpt),
      input: f.input ?? null,
      output: f.output ?? null,
      status: oneOf(f.status, FEEDBACK_STATUSES, "OPEN"),
      caseId: strOrNull(f.caseId),
      createdAt: date(f.createdAt),
      updatedAt: date(f.updatedAt),
      ...(keepsInputs ? {} : { keepsInputs: false }),
    };
  };
  const record = (raw: unknown) => toRecord(t.in(raw));
  /**
   * Refuses what the table can't keep, before writing anything. Said
   * here rather than by the map, so the error never repeats a person's
   * words or input.
   */
  const refuse = (c: Required<NewRating>) => {
    for (const field of RATING_TEXT)
      if (c[field] !== null && t.col(field) === null)
        throw new Error(
          `Your feedback table has no column for a rating's ${field} (the map sets ${field} to null), so it can't keep one. Leave ${field} out of the rating, or add a nullable column and map ${field} to it.`,
        );
  };

  if (!map)
    return {
      async rate(r) {
        const c = cleanRating(r);
        const key = {
          raterId_operation_targetId: {
            raterId: c.raterId,
            operation: c.operation,
            targetId: c.targetId,
          },
        };
        const prior = await d.findUnique({ where: key });
        const data = {
          rating: c.rating,
          reason: c.reason,
          excerpt: c.excerpt,
          input: json(c.input),
          output: json(c.output),
          // A changed rating needs a fresh look.
          ...(isRow(prior) && prior.rating !== c.rating
            ? { status: "OPEN", caseId: null }
            : {}),
        };
        return record(
          await d.upsert({
            where: key,
            create: {
              ...data,
              operation: c.operation,
              targetId: c.targetId,
              raterId: c.raterId,
            },
            update: data,
          }),
        );
      },
      async clearRating(raterId, operation, targetId) {
        await d.deleteMany({ where: { raterId, operation, targetId } });
      },
      async listFeedback(opts = {}) {
        const rows = await d.findMany({
          where: {
            ...(opts.operation ? { operation: opts.operation } : {}),
            ...(opts.rating ? { rating: opts.rating } : {}),
            ...(opts.status ? { status: opts.status } : {}),
            ...(opts.since ? { updatedAt: { gte: opts.since } } : {}),
          },
          orderBy: { updatedAt: "desc" },
          ...(opts.limit ? { take: opts.limit } : {}),
        });
        return t.ins(rows).map(toRecord);
      },
      async setFeedbackStatus(id, status, caseId = null) {
        await d.updateMany({ where: { id }, data: { status, caseId } });
      },
    };

  // An app's own table may have no unique key on (rater, feature,
  // answer), or one Prisma names differently, so a rating is found first
  // and then updated or created, rather than upserted.
  const write = async (c: Required<NewRating>) => {
    const who = t.out({
      raterId: c.raterId,
      operation: c.operation,
      targetId: c.targetId,
    });
    const rating = ratings[c.rating];
    const data = (prior: Row | null) =>
      t.out({
        rating,
        reason: c.reason,
        excerpt: c.excerpt,
        input: json(c.input),
        output: json(c.output),
        // A changed rating needs a fresh look.
        ...(prior && prior.rating !== rating
          ? { ...(hasStatus ? { status: "OPEN" } : {}), caseId: null }
          : {}),
      });
    const update = (prior: Row) =>
      d.update({ where: t.out({ id: prior.id }), data: data(prior) });
    const found = await d.findFirst({ where: who });
    if (found) return update(t.in(found));
    try {
      return await d.create({ data: { ...data(null), ...who } });
    } catch (e) {
      // Another request by the same person got in first (a double click):
      // update the rating it made.
      const again = await d.findFirst({ where: who });
      if (again) return update(t.in(again));
      throw e;
    }
  };

  return {
    async rate(r) {
      const c = cleanRating(r);
      refuse(c);
      return record(await write(c));
    },
    async clearRating(raterId, operation, targetId) {
      await d.deleteMany({ where: t.out({ raterId, operation, targetId }) });
    },
    async listFeedback(opts = {}) {
      // Without a status column every rating is open, and none is
      // anything else.
      if (opts.status && opts.status !== "OPEN" && !hasStatus) return [];
      const rows = await d.findMany({
        where: t.out({
          ...(opts.operation ? { operation: opts.operation } : {}),
          ...(opts.rating ? { rating: ratings[opts.rating] } : {}),
          ...(opts.status && hasStatus ? { status: opts.status } : {}),
          ...(opts.since ? { updatedAt: { gte: opts.since } } : {}),
        }),
        orderBy: t.out({ updatedAt: "desc" }),
        ...(opts.limit ? { take: opts.limit } : {}),
      });
      return t.ins(rows).map(toRecord);
    },
    async setFeedbackStatus(id, status, caseId = null) {
      if (!hasStatus)
        throw new Error(
          `Your feedback table has no status column (the map sets status to null), so a rating can't be marked ${status}. Add a text column (default "OPEN") and map status to it.`,
        );
      await d.updateMany({
        where: t.out({ id }),
        data: t.out({ status, caseId }),
      });
    },
  };
}

/** An EvalSettingsVersion row. */
export type EvalSettingsVersionRow = {
  id: string;
  operation: string;
  number: number;
  model: string;
  fallbackModel: string | null;
  reasoningEffort: string | null;
  maxOutputTokens: number | null;
  temperature: number | null;
  promptVersion: string | null;
  createdAt: Date;
};
/** An EvalSettingsLive row. */
export type EvalSettingsLiveRow = {
  operation: string;
  versionId: string;
  updatedAt: Date;
};
/** An EvalSettingsChange row. */
export type EvalSettingsChangeRow = {
  id: string;
  operation: string;
  kind: string;
  fromVersionId: string | null;
  toVersionId: string;
  reason: string | null;
  by: string | null;
  evidence: Json;
  createdAt: Date;
};

/** The settings tables, inside or outside a transaction. */
export type PrismaSettingsTables = {
  evalSettingsVersion: Delegate<EvalSettingsVersionRow>;
  evalSettingsLive: Delegate<EvalSettingsLiveRow>;
  evalSettingsChange: Delegate<EvalSettingsChangeRow>;
};

/** The part of a generated Prisma client the settings store uses. */
export type PrismaSettingsClient = PrismaSettingsTables & {
  $transaction<T>(fn: (tx: PrismaSettingsTables) => Promise<T>): Promise<T>;
};

const KINDS = CHANGE_KINDS;

/**
 * A change read from a kind column that can't hold every kind: the real
 * kind and evidence, when `kinds` stored them in the evidence column.
 */
function unwrapKind(c: Row): Row {
  const ev = c.evidence;
  if (!isRow(ev) || !("evidence" in ev)) return c;
  const kind = ev.evalkeeperKind;
  if (typeof kind !== "string" || !KINDS.some((k) => k === kind)) return c;
  return { ...c, kind, evidence: ev.evidence };
}

const version = (v: Row): SettingsVersion => ({
  id: str(v.id),
  operation: str(v.operation),
  number: num(v.number),
  model: str(v.model),
  fallbackModel: strOrNull(v.fallbackModel),
  // Any name a provider uses; the catalog says which a model takes.
  reasoningEffort: strOrNull(v.reasoningEffort),
  maxOutputTokens: numOrNull(v.maxOutputTokens),
  temperature: numOrNull(v.temperature),
  promptVersion: strOrNull(v.promptVersion),
  createdAt: date(v.createdAt),
});

const settingsChange = (c: Row, by: string | null): SettingsChange => ({
  id: str(c.id),
  operation: str(c.operation),
  kind: oneOf(c.kind, KINDS, "CHANGE"),
  fromVersionId: strOrNull(c.fromVersionId),
  toVersionId: str(c.toVersionId),
  reason: strOrNull(c.reason),
  by,
  evidence: c.evidence ?? null,
  createdAt: date(c.createdAt),
});

/** Evalkeeper's settings tables, by the names its schema gives them. */
export type SettingsTable =
  "evalSettingsVersion" | "evalSettingsLive" | "evalSettingsChange";

/**
 * How Evalkeeper's settings tables map onto an app's own versions tables,
 * so Evalkeeper's rollback and history pages read the same history as the
 * app's own model admin page. Leave out anything named the same.
 */
export type PrismaSettingsMap = {
  /** Each table's model on the Prisma client, as the client spells it. */
  models?: Partial<Record<SettingsTable, string>>;
  /**
   * Column names per table, keyed by Evalkeeper's field name. `null`
   * says the table has no such column (for nullable fields only): reads
   * give null, and saving a version that sets it fails rather than losing
   * the setting.
   */
  fields?: {
    evalSettingsVersion?: ColumnMap<EvalSettingsVersionRow>;
    evalSettingsLive?: ColumnMap<EvalSettingsLiveRow>;
    evalSettingsChange?: ColumnMap<EvalSettingsChangeRow>;
  };
  /**
   * The kinds your change log's kind column can hold, when it's an enum
   * made before some kinds existed (OUTSIDE and INSTRUCTIONS came later).
   * A kind not listed is stored as CHANGE, with the real kind and the
   * evidence kept in the evidence column (as `{ evalkeeperKind, evidence }`),
   * and read back as itself. Leave it out for a text column or an enum
   * with every kind.
   */
  kinds?: readonly ChangeKind[];
  /**
   * For a table that keeps who made a change as something other than
   * the `by` your pages pass (a user id with a foreign key, say). Each is
   * called only for a value that isn't null.
   */
  by?: {
    /** What to store for `by` (e.g. the user id for a name). */
    toColumn(by: string): string | null | Promise<string | null>;
    /** What to show for a stored value (e.g. the name for a user id). */
    fromColumn(stored: string): string | null | Promise<string | null>;
  };
};

/** A Prisma client that runs a function in a transaction, as every one does. */
export type PrismaTransactionClient = {
  $transaction<T>(fn: (tx: object) => Promise<T>): Promise<T>;
};

/**
 * A SettingsStore on the EvalSettings tables. Each switch runs in one
 * transaction, and moves the live pointer only if it still points at the
 * version the switch was decided against, so concurrent saves can't
 * silently overwrite each other.
 *
 * @param db - Your Prisma client.
 */
export function prismaSettingsStore(db: PrismaSettingsClient): SettingsStore;
/**
 * A SettingsStore on your own versions tables, through a mapping (see
 * `PrismaSettingsMap`), so Evalkeeper's pages and your own read the same
 * history.
 *
 * @param db - Your Prisma client.
 * @param map - Where your tables differ from Evalkeeper's.
 *
 * @example
 * Your own versions tables, with a user id for who changed what:
 * ```ts
 * const settingsStore = prismaSettingsStore(prisma, {
 *   models: {
 *     evalSettingsVersion: "operationVersion",
 *     evalSettingsLive: "operationLive",
 *     evalSettingsChange: "operationChange",
 *   },
 *   fields: {
 *     evalSettingsVersion: { temperature: null },
 *     evalSettingsChange: { by: "userId" },
 *   },
 *   by: {
 *     toColumn: (by) => by, // your pages pass the admin's id
 *     fromColumn: async (id) =>
 *       (await prisma.user.findUnique({ where: { id } }))?.name ?? null,
 *   },
 * });
 * ```
 */
export function prismaSettingsStore(
  db: PrismaTransactionClient,
  map: PrismaSettingsMap,
): SettingsStore;
export function prismaSettingsStore(
  db: PrismaTransactionClient,
  map: PrismaSettingsMap = {},
): SettingsStore {
  const t = (name: SettingsTable) =>
    new Table(name, map.models?.[name] ?? name, map.fields?.[name]);
  const versions = t("evalSettingsVersion");
  const lives = t("evalSettingsLive");
  const changes = t("evalSettingsChange");
  const byOut = async (by: string | null) =>
    by === null || !map.by ? by : map.by.toColumn(by);
  const byIn = async (stored: unknown) => {
    const s = strOrNull(stored);
    return s === null || !map.by ? s : map.by.fromColumn(s);
  };
  return {
    async liveVersion(operation) {
      const live = await lives
        .on(db)
        .findUnique({ where: lives.out({ operation }) });
      if (!live) return null;
      const v = await versions
        .on(db)
        .findUnique({ where: versions.out({ id: lives.in(live).versionId }) });
      return v ? version(versions.in(v)) : null;
    },
    async listVersions(operation) {
      return versions
        .ins(
          await versions.on(db).findMany({
            where: versions.out({ operation }),
            orderBy: versions.out({ number: "desc" }),
          }),
        )
        .map(version);
    },
    async listChanges(operation, opts = {}) {
      const rows = changes.ins(
        await changes.on(db).findMany({
          where: changes.out({ operation }),
          orderBy: [
            changes.out({ createdAt: "desc" }),
            changes.out({ id: "desc" }),
          ],
          ...(opts.limit ? { take: opts.limit } : {}),
        }),
      );
      // One lookup per person, not per change.
      const names = new Map<unknown, Promise<string | null>>();
      for (const r of rows) if (!names.has(r.by)) names.set(r.by, byIn(r.by));
      return Promise.all(
        rows.map(async (r) =>
          settingsChange(
            map.kinds ? unwrapKind(r) : r,
            (await names.get(r.by)) ?? null,
          ),
        ),
      );
    },
    async switchTo(operation, sw) {
      const by = await byOut(sw.by);
      try {
        return await db.$transaction(async (tx) => {
          let to: Row | null;
          if (sw.create) {
            const last = await versions.on(tx).findFirst({
              where: versions.out({ operation }),
              orderBy: versions.out({ number: "desc" }),
            });
            to = versions.in(
              await versions.on(tx).create({
                data: versions.out({
                  ...sw.create.settings,
                  operation,
                  number: (last ? num(versions.in(last).number) : 0) + 1,
                  promptVersion: sw.create.promptVersion,
                }),
              }),
            );
          } else {
            const found = await versions.on(tx).findFirst({
              where: versions.out({ id: sw.versionId, operation }),
            });
            if (!found) throw new Error("No such version for this feature");
            to = versions.in(found);
          }
          if (sw.expectLive === null) {
            // Fails on the primary key if another switch got in first.
            await lives.on(tx).create({
              data: lives.out({ operation, versionId: to.id }),
            });
          } else {
            const moved = await lives.on(tx).updateMany({
              where: lives.out({ operation, versionId: sw.expectLive }),
              data: lives.out({ versionId: to.id }),
            });
            if (!isRow(moved) || moved.count !== 1)
              throw new SettingsConflict(operation);
          }
          const holds = !map.kinds || map.kinds.includes(sw.kind);
          await changes.on(tx).create({
            data: changes.out({
              operation,
              kind: holds ? sw.kind : "CHANGE",
              fromVersionId: sw.expectLive,
              toVersionId: to.id,
              reason: sw.reason,
              by,
              evidence: holds
                ? json(sw.evidence)
                : { evalkeeperKind: sw.kind, evidence: sw.evidence ?? null },
            }),
          });
          return version(to);
        });
      } catch (e) {
        if (e instanceof SettingsConflict) throw e;
        if (e instanceof Error && e.message.startsWith("No such version"))
          throw e;
        // A unique-key clash: another switch numbered or went live first.
        if (e instanceof Error && /Unique constraint|P2002/.test(e.message))
          throw new SettingsConflict(operation);
        // An enum column made before this kind existed.
        const col = String(changes.col("kind"));
        if (
          e instanceof Error &&
          e.message.includes(`Invalid value for argument \`${col}\``)
        )
          throw new Error(
            `Your settings change log's ${col} column can't hold ${sw.kind}. Add ${sw.kind} to its enum, or list the kinds it holds in the map's \`kinds\` (see PrismaSettingsMap).`,
            { cause: e },
          );
        throw e;
      }
    },
  };
}
