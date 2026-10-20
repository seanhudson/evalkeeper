import type {
  CaseRecord,
  CheckResult,
  EvalSet,
  EvalStore,
  LabelRecord,
  OutputRecord,
  RunMetrics,
  RunRecord,
  RunStatus,
} from "evalkeeper";

/**
 * An EvalStore on your Prisma client, using the models in
 * schema/evalkeeper.prisma. Pass the client you already have:
 *
 *   const store = prismaStore(prisma);
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Delegate = {
  findMany(args?: any): Promise<any[]>;
  findFirst(args?: any): Promise<any | null>;
  findUnique(args: any): Promise<any | null>;
  create(args: any): Promise<any>;
  update(args: any): Promise<any>;
  updateMany(args: any): Promise<{ count: number }>;
};

/** The part of a generated Prisma client Evalkeeper uses. */
export type PrismaEvalClient = {
  evalCase: Delegate;
  evalCaseLabel: Delegate;
  evalRun: Delegate;
  evalOutput: Delegate;
  evalJudgment: Delegate;
};

const label = (l: any): LabelRecord => ({
  id: l.id,
  kind: l.kind,
  status: l.status,
  value: l.value,
  raterRole: l.raterRole,
  raterId: l.raterId,
  note: l.note,
  createdAt: l.createdAt,
  updatedAt: l.updatedAt,
});

const evalCase = (c: any): CaseRecord => ({
  id: c.id,
  suite: c.suite,
  input: c.input,
  tags: Array.isArray(c.tags) ? c.tags : [],
  split: c.split,
  status: c.status,
  source: c.source,
  sourceRef: c.sourceRef,
  note: c.note,
  createdAt: c.createdAt,
  updatedAt: c.updatedAt,
  labels: (c.labels ?? []).map(label),
});

const run = (r: any): RunRecord => ({
  id: r.id,
  suite: r.suite,
  model: r.model,
  promptVersion: r.promptVersion,
  reasoningEffort: r.reasoningEffort,
  set: r.set as EvalSet,
  repeats: r.repeats,
  datasetVersion: r.datasetVersion,
  graderVersion: r.graderVersion,
  status: r.status as RunStatus,
  metrics: (r.metrics as RunMetrics | null) ?? null,
  error: r.error,
  estimatedCostUsd: r.estimatedCostUsd,
  startedBy: r.startedBy,
  startedAt: r.startedAt,
  finishedAt: r.finishedAt,
});

const output = (o: any): OutputRecord => ({
  id: o.id,
  runId: o.runId,
  caseId: o.caseId,
  repeat: o.repeat,
  requestHash: o.requestHash,
  output: o.output,
  error: o.error,
  scores: (o.scores as CheckResult[] | null) ?? null,
  costUsd: o.costUsd,
  ms: o.ms,
  reused: o.reused,
  createdAt: o.createdAt,
});

/** Prisma wants JSON null spelled out; undefined leaves a field alone. */
const json = (v: unknown) => (v === undefined ? undefined : (v as any));

export function prismaStore(db: PrismaEvalClient): EvalStore {
  return {
    async listCases(suite) {
      const rows = await db.evalCase.findMany({
        where: { suite, status: { not: "RETIRED" } },
        include: { labels: true },
        orderBy: { createdAt: "asc" },
      });
      return rows.map(evalCase);
    },
    async createCase({ labels = [], ...data }) {
      const c = await db.evalCase.create({
        data: {
          ...data,
          input: json(data.input),
          tags: data.tags,
          labels: {
            create: labels.map((l) => ({ ...l, value: json(l.value) })),
          },
        },
        include: { labels: true },
      });
      return evalCase(c);
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
      await db.evalRun.updateMany({
        where: { id, ...(onlyIf ? { status: onlyIf.status } : {}) },
        data: { ...patch, metrics: json(patch.metrics) },
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
            output: json(data.output ?? undefined),
            scores: json(data.scores ?? undefined),
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
    async get(key: string): Promise<unknown | null> {
      const j = await db.evalJudgment.findUnique({ where: { key } });
      return j?.value ?? null;
    },
    async set(key: string, value: unknown, model: string): Promise<void> {
      await db.evalJudgment
        .create({ data: { key, value: json(value), model } })
        .catch(() => undefined);
    },
  };
}
