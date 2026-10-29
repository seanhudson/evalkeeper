import { checkStoreReads, readCheckSummary } from "../readCheck.js";
import type { ReadCheckReport } from "../readCheck.js";
import { stableJson } from "../stableJson.js";
import type { FeedbackRecord, FeedbackStore } from "../feedback.js";
import type {
  SettingsChange,
  SettingsStore,
  SettingsVersion,
} from "../settings.js";
import type {
  CaseRecord,
  EvalStore,
  LabelRecord,
  OutputRecord,
  RunRecord,
} from "../store.js";
import type {
  PrismaEvalClient,
  PrismaFeedbackClient,
  PrismaSettingsTables,
  PrismaStoreMap,
} from "./index.js";
import { prismaReadCheck } from "./contracts.js";
import {
  prismaFeedbackStore,
  prismaSettingsStore,
  prismaStore,
} from "./index.js";

/**
 * Moving in: copying an app's eval data from tables of its own into
 * Evalkeeper's, once. The app's current stores (mapped onto its tables)
 * read everything; this writes it into Evalkeeper's tables keeping every
 * id, date, and who did what, then reads it back to check it's the same.
 * A dry run writes nothing. Running it again skips what already moved.
 * The app's own tables are never changed.
 */

/** What to read from: the app's current stores, and what they hold. */
export type MoveInSource = {
  /** The app's eval store, mapped onto its own tables. */
  store: EvalStore;
  /** The app's thumbs store, if it has thumbs to move. */
  feedbackStore?: FeedbackStore;
  /** The app's settings store, if it has versioned settings to move. */
  settingsStore?: SettingsStore;
  /** The suites whose cases and tests to move, by key. */
  suites: readonly string[];
  /** The operations whose settings to move. */
  operations?: readonly string[];
  /**
   * Your Prisma client and the map your store uses, so the read check
   * sees each value before the store fills in a default (an unknown
   * status read as a known one). Without it, the check reads through the
   * store and can't see those.
   */
  tables?: { db: object; map: PrismaStoreMap };
};

/** The part of a generated Prisma client moving in writes to. */
export type PrismaMoveInClient = PrismaEvalClient &
  PrismaFeedbackClient &
  PrismaSettingsTables;

/** How one table's rows stand. */
export type MoveInCount = {
  /** Which rows: "cases", "answers", "tests", … */
  table: string;
  /** Rows read from the app's tables. */
  found: number;
  /** Rows already in Evalkeeper's tables from an earlier run. */
  already: number;
  /** Rows this run copied, or would copy on a dry run. */
  moved: number;
};

/** What moving in did, or would do. */
export type MoveInReport = {
  dryRun: boolean;
  counts: MoveInCount[];
  /**
   * Why rows can't move as they are: they'd clash with rows already in
   * Evalkeeper's tables, or point at a row that isn't there. Nothing is
   * written while there are any.
   */
  problems: string[];
  /** Values in the app's tables that Evalkeeper reads differently. */
  readCheck: ReadCheckReport;
  /** After a move: whether everything reads back the same. */
  verified: { ok: boolean; differences: string[] } | null;
};

/** What moving in takes beyond the source. */
export type MoveInOptions = {
  /** Read and report, and write nothing. */
  dryRun?: boolean;
  /**
   * Move even though the read check found values Evalkeeper reads
   * differently; they move as Evalkeeper reads them.
   */
  acceptReadProblems?: boolean;
};

/** Everything the source holds, read once. */
type Data = {
  cases: CaseRecord[];
  runs: RunRecord[];
  outputs: OutputRecord[];
  feedback: FeedbackRecord[];
  versions: SettingsVersion[];
  changes: SettingsChange[];
  live: SettingsVersion[];
};

async function readAll(s: MoveInSource): Promise<Data> {
  const cases: CaseRecord[] = [];
  const runs: RunRecord[] = [];
  for (const suite of s.suites) {
    cases.push(...(await s.store.listCases(suite, { includeRetired: true })));
    runs.push(...(await s.store.listRuns(suite)));
  }
  const ids = runs.map((r) => r.id);
  const outputs = s.store.listOutputsFor
    ? await s.store.listOutputsFor(ids)
    : (await Promise.all(ids.map((id) => s.store.listOutputs(id)))).flat();
  const feedback = s.feedbackStore ? await s.feedbackStore.listFeedback() : [];
  const versions: SettingsVersion[] = [];
  const changes: SettingsChange[] = [];
  const live: SettingsVersion[] = [];
  if (s.settingsStore)
    for (const op of s.operations ?? []) {
      versions.push(...(await s.settingsStore.listVersions(op)));
      changes.push(...(await s.settingsStore.listChanges(op)));
      const l = await s.settingsStore.liveVersion(op);
      if (l) live.push(l);
    }
  return { cases, runs, outputs, feedback, versions, changes, live };
}

/** Prisma reads `undefined` as "leave it alone": JSON null stays unset. */
const json = (v: unknown) => (v === undefined || v === null ? undefined : v);

/** Which of these ids a table already has. */
async function existing(
  table: { findMany(args: object): PromiseLike<object[]> },
  ids: string[],
  key = "id",
): Promise<Set<string>> {
  const found = new Set<string>();
  // In batches, so a large table never makes one huge query.
  for (let i = 0; i < ids.length; i += 500) {
    const rows = await table.findMany({
      where: { [key]: { in: ids.slice(i, i + 500) } },
      select: { [key]: true },
    });
    for (const r of rows)
      found.add(String((r as Record<string, unknown>)[key]));
  }
  return found;
}

/** A record as JSON, for comparing what moved with what it came from. */
const same = (a: unknown, b: unknown) => stableJson(a) === stableJson(b);

/** A case with its answers in a fixed order, for comparing. */
const sortedCase = (c: CaseRecord) => ({
  ...c,
  labels: [...c.labels].sort((x, y) => (x.id < y.id ? -1 : 1)),
});

/** A rating without what only a mapped store says (`keepsInputs`). */
const rating = ({ keepsInputs: _k, ...f }: FeedbackRecord) => f;

/**
 * Copies an app's eval data from its own tables (read through its current
 * stores) into Evalkeeper's tables, keeping ids, dates, who confirmed each
 * answer, and every test's answers and grades. Run it with `dryRun`
 * first: it reports what it would copy, table by table, what already
 * moved, and anything that doesn't fit, and writes nothing. A real run
 * copies only what isn't there yet, so it's safe to run again, and then
 * reads everything back to check it's the same. Your own tables are never
 * changed; keep them until you decide to drop them.
 *
 * @example
 * ```ts
 * const source = { store: myMappedStore, feedbackStore: myThumbs,
 *   suites: SUITES.map((s) => s.key) };
 * console.log(moveInSummary(await moveIn(source, prisma, { dryRun: true })).join("\n"));
 * ```
 *
 * @param source - Your current stores, and the suites and operations to move.
 * @param db - Your Prisma client, with Evalkeeper's tables migrated.
 * @param opts - `dryRun` to only report.
 */
export async function moveIn(
  source: MoveInSource,
  db: PrismaMoveInClient,
  opts: MoveInOptions = {},
): Promise<MoveInReport> {
  const data = await readAll(source);
  const readCheck = source.tables
    ? await prismaReadCheck(source.tables.db, source.tables.map, {
        suites: source.suites,
      })
    : await checkStoreReads(source.store, { suites: source.suites });
  const problems: string[] = [];

  // What each table already has, by id.
  const has = {
    cases: await existing(
      db.evalCase,
      data.cases.map((c) => c.id),
    ),
    labels: await existing(
      db.evalCaseLabel,
      data.cases.flatMap((c) => c.labels.map((l) => l.id)),
    ),
    runs: await existing(
      db.evalRun,
      data.runs.map((r) => r.id),
    ),
    outputs: await existing(
      db.evalOutput,
      data.outputs.map((o) => o.id),
    ),
    feedback: await existing(
      db.evalFeedback,
      data.feedback.map((f) => f.id),
    ),
    versions: await existing(
      db.evalSettingsVersion,
      data.versions.map((v) => v.id),
    ),
    changes: await existing(
      db.evalSettingsChange,
      data.changes.map((c) => c.id),
    ),
    live: await existing(
      db.evalSettingsLive,
      data.live.map((l) => l.operation),
      "operation",
    ),
  };

  // Rows that point at something that isn't moving.
  const caseIds = new Set(data.cases.map((c) => c.id));
  const runIds = new Set(data.runs.map((r) => r.id));
  const outputs = data.outputs.filter((o) => {
    if (caseIds.has(o.caseId) && runIds.has(o.runId)) return true;
    problems.push(
      `Test answer ${o.id} belongs to a ${caseIds.has(o.caseId) ? "test" : "case"} that isn't in the suites being moved.`,
    );
    return false;
  });

  // Rows that would clash with what's already in Evalkeeper's tables.
  for (const op of source.operations ?? []) {
    if (!source.settingsStore) break;
    const theirs = await db.evalSettingsVersion.findMany({
      where: { operation: op },
      select: { id: true },
    });
    const ours = new Set(
      data.versions.filter((v) => v.operation === op).map((v) => v.id),
    );
    if (theirs.some((v) => !ours.has(v.id)))
      problems.push(
        `${op} already has settings versions in Evalkeeper's tables that aren't from your tables; histories aren't merged. Move into empty settings tables.`,
      );
  }
  for (const f of data.feedback) {
    if (has.feedback.has(f.id)) continue;
    const clash = await db.evalFeedback.findFirst({
      where: {
        raterId: f.raterId,
        operation: f.operation,
        targetId: f.targetId,
      },
    });
    if (clash)
      problems.push(
        `Thumbs ${f.id} clashes with ${clash.id} in Evalkeeper's tables: the same person rated the same answer.`,
      );
  }

  const labels = data.cases.flatMap((c) =>
    c.labels.map((l) => ({ ...l, caseId: c.id })),
  );
  const todo = {
    cases: data.cases.filter((c) => !has.cases.has(c.id)),
    labels: labels.filter((l) => !has.labels.has(l.id)),
    runs: data.runs.filter((r) => !has.runs.has(r.id)),
    outputs: outputs.filter((o) => !has.outputs.has(o.id)),
    feedback: data.feedback.filter((f) => !has.feedback.has(f.id)),
    versions: data.versions.filter((v) => !has.versions.has(v.id)),
    changes: data.changes.filter((c) => !has.changes.has(c.id)),
    live: data.live.filter((l) => !has.live.has(l.operation)),
  };
  const count = (table: string, found: number, moved: number) => ({
    table,
    found,
    already: found - moved,
    moved,
  });
  const counts: MoveInCount[] = [
    count("cases", data.cases.length, todo.cases.length),
    count("answers", labels.length, todo.labels.length),
    count("tests", data.runs.length, todo.runs.length),
    count("test answers", outputs.length, todo.outputs.length),
    count("thumbs", data.feedback.length, todo.feedback.length),
    count("settings versions", data.versions.length, todo.versions.length),
    count("settings changes", data.changes.length, todo.changes.length),
    count("live settings", data.live.length, todo.live.length),
  ];
  const readProblems = readCheck.suites.some((s) => s.problems.length);
  const report = { counts, problems, readCheck, verified: null };
  if (
    opts.dryRun ||
    problems.length ||
    (readProblems && !opts.acceptReadProblems)
  )
    return { ...report, dryRun: true };

  for (const c of todo.cases)
    await db.evalCase.create({
      data: {
        id: c.id,
        suite: c.suite,
        input: json(c.input),
        tags: c.tags,
        split: c.split,
        status: c.status,
        source: c.source,
        sourceRef: c.sourceRef,
        note: c.note,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      },
    });
  for (const l of todo.labels)
    await db.evalCaseLabel.create({
      data: {
        id: l.id,
        caseId: l.caseId,
        kind: l.kind,
        status: l.status,
        // A skip's value is {}, as the store writes it.
        value: l.status === "SKIPPED" ? {} : json(l.value),
        raterRole: l.raterRole,
        raterId: l.raterId,
        note: l.note,
        createdAt: l.createdAt,
        updatedAt: l.updatedAt,
      } satisfies Omit<LabelRecord, "value"> & {
        caseId: string;
        value: unknown;
      },
    });
  for (const r of todo.runs)
    await db.evalRun.create({
      data: {
        ...r,
        temperature: r.temperature ?? null,
        maxOutputTokens: r.maxOutputTokens ?? null,
        metrics: json(r.metrics),
      },
    });
  for (const o of todo.outputs)
    await db.evalOutput.create({
      data: { ...o, output: json(o.output), scores: json(o.scores) },
    });
  for (const f of todo.feedback)
    await db.evalFeedback.create({
      data: { ...rating(f), input: json(f.input), output: json(f.output) },
    });
  for (const v of todo.versions)
    await db.evalSettingsVersion.create({
      data: { ...v, temperature: v.temperature ?? null },
    });
  for (const c of todo.changes)
    await db.evalSettingsChange.create({
      data: { ...c, evidence: json(c.evidence) },
    });
  for (const l of todo.live)
    await db.evalSettingsLive.create({
      data: { operation: l.operation, versionId: l.id },
    });

  return {
    ...report,
    dryRun: false,
    verified: await verify(source, data, outputs, db),
  };
}

/** Reads everything back from Evalkeeper's tables and compares. */
async function verify(
  source: MoveInSource,
  data: Data,
  outputs: OutputRecord[],
  db: PrismaMoveInClient,
): Promise<{ ok: boolean; differences: string[] }> {
  const store = prismaStore(db);
  const differences: string[] = [];
  const check = <T extends { id: string }>(
    what: string,
    before: T[],
    after: T[],
    shape: (x: T) => unknown = (x) => x,
  ) => {
    const byId = new Map(after.map((x) => [x.id, x]));
    for (const b of before) {
      const a = byId.get(b.id);
      if (!a) differences.push(`${what} ${b.id} isn't in Evalkeeper's tables.`);
      else if (!same(shape(a), shape(b)))
        differences.push(`${what} ${b.id} reads back differently.`);
    }
  };
  const cases: CaseRecord[] = [];
  const runs: RunRecord[] = [];
  for (const suite of source.suites) {
    cases.push(...(await store.listCases(suite, { includeRetired: true })));
    runs.push(...(await store.listRuns(suite)));
  }
  check("Case", data.cases, cases, sortedCase);
  check("Test", data.runs, runs);
  const runsMoved = [...new Set(outputs.map((o) => o.runId))];
  check(
    "Test answer",
    outputs,
    (await Promise.all(runsMoved.map((id) => store.listOutputs(id)))).flat(),
  );
  if (source.feedbackStore)
    check(
      "Thumbs",
      data.feedback,
      await prismaFeedbackStore(db).listFeedback(),
      rating,
    );
  if (source.settingsStore) {
    // Its own transaction isn't needed for reading.
    const settings = prismaSettingsStore({
      ...db,
      $transaction: (fn) => fn(db),
    });
    for (const op of source.operations ?? []) {
      check(
        "Settings version",
        data.versions.filter((v) => v.operation === op),
        await settings.listVersions(op),
      );
      check(
        "Settings change",
        data.changes.filter((c) => c.operation === op),
        await settings.listChanges(op),
      );
      const was = data.live.find((l) => l.operation === op);
      const now = await settings.liveVersion(op);
      if (was?.id !== now?.id)
        differences.push(`${op}'s live settings read back differently.`);
    }
  }
  return { ok: !differences.length, differences };
}

/**
 * A move-in report in words: what moved (or would), table by table, then
 * anything that stopped it or reads back differently.
 *
 * @param r - What `moveIn` returned.
 */
export function moveInSummary(r: MoveInReport): string[] {
  const lines = [
    r.dryRun
      ? "Moving in: nothing written. It would copy:"
      : "Moved into Evalkeeper's tables:",
  ];
  for (const c of r.counts)
    if (c.found)
      lines.push(
        `  ${c.table}: ${c.moved} of ${c.found}${c.already ? ` (${c.already} already there)` : ""}`,
      );
  if (r.counts.every((c) => !c.found)) lines.push("  nothing: no rows found.");
  if (r.readCheck.suites.some((s) => s.problems.length))
    lines.push(
      "Values Evalkeeper reads differently (they'd move as it reads them; pass acceptReadProblems once that's right):",
      ...readCheckSummary(r.readCheck).map((l) => `  ${l}`),
    );
  if (r.problems.length)
    lines.push(
      "Can't move until these are fixed:",
      ...r.problems.map((p) => `  ${p}`),
    );
  if (r.verified)
    lines.push(
      r.verified.ok
        ? "Read back: every row is the same."
        : "Read back differently:",
      ...r.verified.differences.map((d) => `  ${d}`),
    );
  return lines;
}
