/**
 * Helpers for checking a Prisma store on a database that holds real rows:
 * a read check that sees each value before the store fills in defaults,
 * and a cleanup for scoped store contracts that deletes only the rows
 * the scope names.
 */
import {
  checkReads,
  type ReadCheckOptions,
  type ReadCheckReport,
  type ReadRow,
} from "@crowandraven/evalkeeper";
import type {
  PrismaFeedbackMap,
  PrismaSettingsMap,
  PrismaStoreMap,
} from "./index.js";
import { Table, isRow, type Row } from "./mapping.js";

/** A model's delete, as any Prisma client has it. */
type Deleter = {
  findMany(args: object): PromiseLike<unknown>;
  deleteMany(args: object): PromiseLike<unknown>;
};

function deleter(db: object, model: string): Deleter | null {
  const d: unknown = Reflect.get(db, model);
  if (typeof d !== "object" || d === null) return null;
  return typeof Reflect.get(d, "findMany") === "function" &&
    typeof Reflect.get(d, "deleteMany") === "function"
    ? // Trust boundary: a Prisma delegate, checked for both methods.
      (d as Deleter)
    : null;
}

function counted(result: unknown): number {
  if (!isRow(result)) return 0;
  return typeof result.count === "number" ? result.count : 0;
}

/** How many rows `deleteScopedRows` deleted, by table. */
export type ScopedRowsDeleted = {
  cases: number;
  answers: number;
  tests: number;
  outputs: number;
  feedback: number;
  versions: number;
  live: number;
  changes: number;
};

/** The maps for `deleteScopedRows`: the ones you pass the stores. */
export type ScopedRowsMaps = {
  /** The map you pass `prismaStore`, if any. */
  map?: PrismaStoreMap;
  /** The map you pass `prismaSettingsStore`, if any. */
  settingsMap?: PrismaSettingsMap;
  /** The map you pass `prismaFeedbackStore`, if any. */
  feedbackMap?: PrismaFeedbackMap;
};

/**
 * Deletes the rows a scoped store contract wrote, and nothing else: cases
 * and tests whose suite starts with `scope` (with their answers and
 * outputs), and ratings, versions, live pointers, and changes whose
 * feature starts with it. Each row's name is compared exactly in code,
 * not by the database's pattern matching (which may ignore case), so a
 * row whose name only looks like the scope stays. Tables your client
 * doesn't have (feedback, settings) are skipped.
 *
 * @param db - Your Prisma client.
 * @param scope - The prefix the contracts used, such as "contract-".
 * @param maps - The maps you pass the stores, if your tables are your own.
 *
 * @example
 * ```ts
 * describeStoreContract("our tables", () => prismaStore(prisma, map), {
 *   scope: "contract-",
 *   cleanup: (scope) => deleteScopedRows(prisma, scope, { map }),
 * });
 * ```
 */
export async function deleteScopedRows(
  db: object,
  scope: string,
  maps: ScopedRowsMaps = {},
): Promise<ScopedRowsDeleted> {
  if (!scope.trim())
    throw new Error(
      "deleteScopedRows needs a scope with some text in it: an empty one would match every row.",
    );
  const deleted: ScopedRowsDeleted = {
    cases: 0,
    answers: 0,
    tests: 0,
    outputs: 0,
    feedback: 0,
    versions: 0,
    live: 0,
    changes: 0,
  };

  /**
   * The ids (by `key`) of a table's rows whose `field` starts with the
   * scope, or null when the client has no such table.
   */
  const scoped = async (
    t: Table,
    field: string,
    key = "id",
  ): Promise<{ d: Deleter; ids: unknown[] } | null> => {
    const d = deleter(db, t.model);
    if (!d) return null;
    const rows = t.ins(
      await d.findMany({
        where: t.out({ [field]: { startsWith: scope } }),
        select: t.out({ [key]: true, [field]: true }),
      }),
    );
    const ids = rows
      .filter((r: Row) => {
        const name = r[field];
        return typeof name === "string" && name.startsWith(scope);
      })
      .map((r) => r[key]);
    return { d, ids };
  };
  const remove = async (t: Table, d: Deleter, field: string, ids: unknown[]) =>
    ids.length
      ? counted(await d.deleteMany({ where: t.out({ [field]: { in: ids } }) }))
      : 0;

  const m = maps.map ?? {};
  const table = (
    name: "evalCase" | "evalCaseLabel" | "evalRun" | "evalOutput",
  ) => new Table(name, m.models?.[name] ?? name, m.fields?.[name]);
  const cases = table("evalCase");
  const labels = table("evalCaseLabel");
  const runs = table("evalRun");
  const outputs = table("evalOutput");
  const c = await scoped(cases, "suite");
  const r = await scoped(runs, "suite");
  const o = deleter(db, outputs.model);
  const l = deleter(db, labels.model);
  if (o && r) deleted.outputs += await remove(outputs, o, "runId", r.ids);
  if (o && c) deleted.outputs += await remove(outputs, o, "caseId", c.ids);
  if (l && c) deleted.answers = await remove(labels, l, "caseId", c.ids);
  if (r) deleted.tests = await remove(runs, r.d, "id", r.ids);
  if (c) deleted.cases = await remove(cases, c.d, "id", c.ids);

  const fm = maps.feedbackMap ?? {};
  const fb = new Table(
    "evalFeedback",
    fm.models?.evalFeedback ?? "evalFeedback",
    fm.fields?.evalFeedback,
  );
  const f = await scoped(fb, "operation");
  if (f) deleted.feedback = await remove(fb, f.d, "id", f.ids);

  const s = maps.settingsMap ?? {};
  const settings = (
    name: "evalSettingsVersion" | "evalSettingsLive" | "evalSettingsChange",
  ) => new Table(name, s.models?.[name] ?? name, s.fields?.[name]);
  const changes = settings("evalSettingsChange");
  const lives = settings("evalSettingsLive");
  const versions = settings("evalSettingsVersion");
  // Changes and live pointers point at versions, so they go first.
  const ch = await scoped(changes, "operation");
  if (ch) deleted.changes = await remove(changes, ch.d, "id", ch.ids);
  const lv = await scoped(lives, "operation", "operation");
  if (lv) deleted.live = await remove(lives, lv.d, "operation", lv.ids);
  const vs = await scoped(versions, "operation");
  if (vs) deleted.versions = await remove(versions, vs.d, "id", vs.ids);
  return deleted;
}

/**
 * A read-only check of your eval tables through a store's map: each
 * suite's cases, answers, tests, and outputs, read as the table holds
 * them, with anything that doesn't parse listed by row (an unknown
 * status, a cost that isn't a number, a missing column), with counts.
 * The store itself reads such a value as a default (an unknown status as
 * a known one), so this is how to see them. With suites (not just keys),
 * each case's input and answer is also checked against the suite's
 * schemas. It only reads.
 *
 * @param db - Your Prisma client.
 * @param map - The map you pass `prismaStore` (`{}` for Evalkeeper's own tables).
 * @param opts - Which suites, and how many tests of each.
 *
 * @example
 * ```ts
 * import { prismaReadCheck } from "@crowandraven/evalkeeper-prisma";
 * import { readCheckSummary } from "@crowandraven/evalkeeper";
 *
 * const report = await prismaReadCheck(prisma, map, { suites: SUITES });
 * console.log(readCheckSummary(report).join("\n"));
 * ```
 */
export function prismaReadCheck(
  db: object,
  map: PrismaStoreMap,
  opts: ReadCheckOptions,
): Promise<ReadCheckReport> {
  const table = (
    name: "evalCase" | "evalCaseLabel" | "evalRun" | "evalOutput",
  ) => new Table(name, map.models?.[name] ?? name, map.fields?.[name]);
  const cases = table("evalCase");
  const labels = table("evalCaseLabel");
  const runs = table("evalRun");
  const outputs = table("evalOutput");
  const labelsOf = cases.col("labels") ?? "labels";
  return checkReads(
    {
      async cases(suite) {
        const rows = cases.ins(
          await cases.on(db).findMany({
            where: cases.out({ suite }),
            include: { [labelsOf]: true },
            orderBy: cases.out({ createdAt: "asc" }),
          }),
        );
        return rows.map((row): ReadRow =>
          Array.isArray(row.labels)
            ? { ...row, labels: labels.ins(row.labels) }
            : row,
        );
      },
      async tests(suite, limit) {
        return runs.ins(
          await runs.on(db).findMany({
            where: runs.out({ suite }),
            orderBy: runs.out({ startedAt: "desc" }),
            ...(limit === undefined ? {} : { take: limit }),
          }),
        );
      },
      async outputs(ids) {
        return outputs.ins(
          await outputs.on(db).findMany({
            where: outputs.out({ runId: { in: [...ids] } }),
          }),
        );
      },
    },
    opts,
  );
}
