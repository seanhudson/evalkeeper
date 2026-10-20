import { SettingsConflict, cleanRating } from "evalkeeper";
import type {
  CaseRecord,
  FeedbackRecord,
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
  ReasoningEffort,
  SettingsChange,
  SettingsStore,
  SettingsVersion,
} from "evalkeeper";

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
export type EvalRunRow = {
  id: string;
  suite: string;
  model: string;
  promptVersion: string;
  reasoningEffort: string | null;
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
  value: string,
  allowed: readonly T[],
  fallback: T,
): T {
  return (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

const LABEL_STATUSES: readonly LabelStatus[] = [
  "PENDING",
  "CONFIRMED",
  "PROVISIONAL",
  "REJECTED",
];
const RUN_STATUSES: readonly RunStatus[] = ["RUNNING", "SUCCEEDED", "FAILED"];
const SETS: readonly EvalSet[] = ["ALL", "SMOKE", "DEV", "TEST"];

const label = (l: EvalCaseLabelRow): LabelRecord => ({
  id: l.id,
  kind: "EXPECTED",
  status: oneOf(l.status, LABEL_STATUSES, "PENDING"),
  value: l.value,
  raterRole: l.raterRole,
  raterId: l.raterId,
  note: l.note,
  createdAt: l.createdAt,
  updatedAt: l.updatedAt,
});

const evalCase = (
  c: EvalCaseRow & { labels?: EvalCaseLabelRow[] },
): CaseRecord => ({
  id: c.id,
  suite: c.suite,
  input: c.input,
  tags: Array.isArray(c.tags)
    ? c.tags.filter((t): t is string => typeof t === "string")
    : [],
  split: oneOf(c.split, ["DEV", "TEST"] as const, "DEV"),
  status: oneOf(c.status, ["DRAFT", "ACTIVE", "RETIRED"] as const, "DRAFT"),
  source: c.source,
  sourceRef: c.sourceRef,
  note: c.note,
  createdAt: c.createdAt,
  updatedAt: c.updatedAt,
  labels: (c.labels ?? []).map(label),
});

const run = (r: EvalRunRow): RunRecord => ({
  id: r.id,
  suite: r.suite,
  model: r.model,
  promptVersion: r.promptVersion,
  reasoningEffort: r.reasoningEffort,
  set: oneOf(r.set, SETS, "ALL"),
  repeats: r.repeats,
  datasetVersion: r.datasetVersion,
  graderVersion: r.graderVersion,
  status: oneOf(r.status, RUN_STATUSES, "FAILED"),
  // Written only by the runner, in this shape.
  metrics: (r.metrics ?? null) as RunMetrics | null,
  error: r.error,
  estimatedCostUsd: r.estimatedCostUsd,
  startedBy: r.startedBy,
  startedAt: r.startedAt,
  finishedAt: r.finishedAt,
});

const output = (o: EvalOutputRow): OutputRecord => ({
  id: o.id,
  runId: o.runId,
  caseId: o.caseId,
  repeat: o.repeat,
  requestHash: o.requestHash,
  output: o.output,
  error: o.error,
  // Written only by the runner, in this shape.
  scores: (o.scores ?? null) as CheckResult[] | null,
  costUsd: o.costUsd,
  ms: o.ms,
  reused: o.reused,
  createdAt: o.createdAt,
});

/**
 * A value for a JSON column. Prisma reads `undefined` as "leave it alone"
 * and wants JSON null spelled out, so a missing value stays undefined.
 */
const json = (v: unknown): object | string | number | boolean | undefined =>
  v === undefined || v === null ? undefined : v;

export function prismaStore(db: PrismaEvalClient): EvalStore {
  return {
    async listCases(suite) {
      const rows = (await db.evalCase.findMany({
        where: { suite, status: { not: "RETIRED" } },
        include: { labels: true },
        orderBy: { createdAt: "asc" },
      })) as (EvalCaseRow & { labels: EvalCaseLabelRow[] })[];
      return rows.map(evalCase);
    },
    async createCase({ labels = [], ...data }) {
      const c = (await db.evalCase.create({
        data: {
          ...data,
          input: json(data.input),
          labels: {
            create: labels.map((l) => ({ ...l, value: json(l.value) })),
          },
        },
        include: { labels: true },
      })) as EvalCaseRow & { labels: EvalCaseLabelRow[] };
      return evalCase(c);
    },
    async addLabel(caseId, data) {
      return label(
        await db.evalCaseLabel.create({
          data: { ...data, caseId, value: json(data.value) },
        }),
      );
    },
    async setLabelStatus(id, status) {
      await db.evalCaseLabel.update({ where: { id }, data: { status } });
    },
    async setCaseStatus(id, status) {
      await db.evalCase.updateMany({ where: { id }, data: { status } });
    },
    async getRun(id) {
      const r = await db.evalRun.findUnique({ where: { id } });
      return r ? run(r) : null;
    },
    async listRuns(suite, opts = {}) {
      const rows = await db.evalRun.findMany({
        where: { suite, ...(opts.status ? { status: opts.status } : {}) },
        orderBy: { startedAt: "desc" },
        ...(opts.limit ? { take: opts.limit } : {}),
      });
      return rows.map(run);
    },
    async createRun(data) {
      return run(await db.evalRun.create({ data }));
    },
    async updateRun(id, patch, onlyIf) {
      const { metrics, ...rest } = patch;
      await db.evalRun.updateMany({
        where: { id, ...(onlyIf ? { status: onlyIf.status } : {}) },
        data: {
          ...rest,
          ...(metrics !== undefined ? { metrics: json(metrics) } : {}),
        },
      });
    },
    async listOutputs(runId) {
      return (await db.evalOutput.findMany({ where: { runId } })).map(output);
    },
    async findReusableOutput(requestHash, since) {
      const o = await db.evalOutput.findFirst({
        where: {
          requestHash,
          createdAt: { gte: since },
          error: null,
          reused: false,
        },
        orderBy: { createdAt: "desc" },
      });
      return o ? output(o) : null;
    },
    async createOutput(data) {
      return output(
        await db.evalOutput.create({
          data: {
            ...data,
            output: json(data.output),
            scores: json(data.scores),
          },
        }),
      );
    },
    async setOutputScores(id, scores) {
      await db.evalOutput.update({ where: { id }, data: { scores } });
    },
  };
}

/** A judgment cache on the EvalJudgment table, for @evalkeeper/ai-sdk. */
export function prismaJudgmentCache(db: PrismaEvalClient) {
  return {
    async get(key: string): Promise<unknown> {
      const j = await db.evalJudgment.findUnique({ where: { key } });
      return j?.value ?? null;
    },
    async set(key: string, value: unknown, model: string): Promise<void> {
      try {
        await db.evalJudgment.create({
          data: { key, value: json(value), model },
        });
      } catch {
        // Already kept by a concurrent grade: the same answer either way.
      }
    },
  };
}

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

const feedback = (f: EvalFeedbackRow): FeedbackRecord => ({
  id: f.id,
  operation: f.operation,
  targetId: f.targetId,
  raterId: f.raterId,
  rating: f.rating === "DOWN" ? "DOWN" : "UP",
  reason: f.reason,
  excerpt: f.excerpt,
  input: f.input ?? null,
  output: f.output ?? null,
  status: oneOf(f.status, FEEDBACK_STATUSES, "OPEN"),
  caseId: f.caseId,
  createdAt: f.createdAt,
  updatedAt: f.updatedAt,
});

/** A FeedbackStore on the EvalFeedback table. */
export function prismaFeedbackStore(db: PrismaFeedbackClient): FeedbackStore {
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
      const prior = await db.evalFeedback.findUnique({ where: key });
      const data = {
        rating: c.rating,
        reason: c.reason,
        excerpt: c.excerpt,
        input: json(c.input),
        output: json(c.output),
        // A changed rating needs a fresh look.
        ...(prior && prior.rating !== c.rating
          ? { status: "OPEN", caseId: null }
          : {}),
      };
      return feedback(
        await db.evalFeedback.upsert({
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
      await db.evalFeedback.deleteMany({
        where: { raterId, operation, targetId },
      });
    },
    async listFeedback(opts = {}) {
      const rows = await db.evalFeedback.findMany({
        where: {
          ...(opts.operation ? { operation: opts.operation } : {}),
          ...(opts.rating ? { rating: opts.rating } : {}),
          ...(opts.status ? { status: opts.status } : {}),
          ...(opts.since ? { updatedAt: { gte: opts.since } } : {}),
        },
        orderBy: { updatedAt: "desc" },
        ...(opts.limit ? { take: opts.limit } : {}),
      });
      return rows.map(feedback);
    },
    async setFeedbackStatus(id, status, caseId = null) {
      await db.evalFeedback.updateMany({
        where: { id },
        data: { status, caseId },
      });
    },
  };
}

export type EvalSettingsVersionRow = {
  id: string;
  operation: string;
  number: number;
  model: string;
  fallbackModel: string | null;
  reasoningEffort: string | null;
  maxOutputTokens: number | null;
  promptVersion: string | null;
  createdAt: Date;
};
export type EvalSettingsLiveRow = {
  operation: string;
  versionId: string;
  updatedAt: Date;
};
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

const EFFORTS: readonly ReasoningEffort[] = ["none", "low", "medium", "high"];
const KINDS: readonly ChangeKind[] = [
  "CHANGE",
  "PROMOTE",
  "ROLLBACK",
  "DEPLOY",
];

const version = (v: EvalSettingsVersionRow): SettingsVersion => ({
  id: v.id,
  operation: v.operation,
  number: v.number,
  model: v.model,
  fallbackModel: v.fallbackModel,
  reasoningEffort:
    v.reasoningEffort === null
      ? null
      : oneOf(v.reasoningEffort, EFFORTS, "low"),
  maxOutputTokens: v.maxOutputTokens,
  promptVersion: v.promptVersion,
  createdAt: v.createdAt,
});

const settingsChange = (c: EvalSettingsChangeRow): SettingsChange => ({
  id: c.id,
  operation: c.operation,
  kind: oneOf(c.kind, KINDS, "CHANGE"),
  fromVersionId: c.fromVersionId,
  toVersionId: c.toVersionId,
  reason: c.reason,
  by: c.by,
  evidence: c.evidence ?? null,
  createdAt: c.createdAt,
});

/**
 * A SettingsStore on the EvalSettings tables. Each switch runs in one
 * transaction, and moves the live pointer only if it still points at the
 * version the switch was decided against, so concurrent saves can't
 * silently overwrite each other.
 */
export function prismaSettingsStore(db: PrismaSettingsClient): SettingsStore {
  return {
    async liveVersion(operation) {
      const live = await db.evalSettingsLive.findUnique({
        where: { operation },
      });
      if (!live) return null;
      const v = await db.evalSettingsVersion.findUnique({
        where: { id: live.versionId },
      });
      return v ? version(v) : null;
    },
    async listVersions(operation) {
      return (
        await db.evalSettingsVersion.findMany({
          where: { operation },
          orderBy: { number: "desc" },
        })
      ).map(version);
    },
    async listChanges(operation, opts = {}) {
      return (
        await db.evalSettingsChange.findMany({
          where: { operation },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          ...(opts.limit ? { take: opts.limit } : {}),
        })
      ).map(settingsChange);
    },
    async switchTo(operation, sw) {
      try {
        return await db.$transaction(async (tx) => {
          let to: EvalSettingsVersionRow | null;
          if (sw.create) {
            const last = await tx.evalSettingsVersion.findFirst({
              where: { operation },
              orderBy: { number: "desc" },
            });
            to = await tx.evalSettingsVersion.create({
              data: {
                ...sw.create.settings,
                operation,
                number: (last?.number ?? 0) + 1,
                promptVersion: sw.create.promptVersion,
              },
            });
          } else {
            to = await tx.evalSettingsVersion.findFirst({
              where: { id: sw.versionId, operation },
            });
            if (!to) throw new Error("No such version for this feature");
          }
          if (sw.expectLive === null) {
            // Fails on the primary key if another switch got in first.
            await tx.evalSettingsLive.create({
              data: { operation, versionId: to.id },
            });
          } else {
            const moved = await tx.evalSettingsLive.updateMany({
              where: { operation, versionId: sw.expectLive },
              data: { versionId: to.id },
            });
            if (moved.count !== 1) throw new SettingsConflict(operation);
          }
          await tx.evalSettingsChange.create({
            data: {
              operation,
              kind: sw.kind,
              fromVersionId: sw.expectLive,
              toVersionId: to.id,
              reason: sw.reason,
              by: sw.by,
              evidence: json(sw.evidence),
            },
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
        throw e;
      }
    },
  };
}
