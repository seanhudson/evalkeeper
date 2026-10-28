import type { EvalStore } from "./store.js";
import { EVAL_SETS } from "./store.js";
import type { AnySuite } from "./types.js";

/**
 * A read-only check that a store reads what's already in your tables:
 * every case, answer, test, and output of each suite, with anything that
 * doesn't parse (an unknown status, a cost that isn't a number, a missing
 * column) listed by row, with counts. It never writes, so it's safe on a
 * copy of real data; it's the first thing to run after mapping a store
 * onto an app's own tables.
 */

/** What a row is: a case, an answer, a test (a run), or an output. */
export type ReadKind = "case" | "answer" | "test" | "output";

/** One value that doesn't read as Evalkeeper expects. */
export type ReadProblem = {
  suite: string;
  kind: ReadKind;
  /** The row's id, or empty when the rows couldn't be read at all. */
  id: string;
  /** Evalkeeper's name for the field, or empty for the whole row. */
  field: string;
  /** What's wrong, in plain words. */
  problem: string;
};

/** How many of each were read. */
export type ReadCounts = {
  cases: number;
  answers: number;
  tests: number;
  outputs: number;
};

/** What a read check found for one suite. */
export type SuiteReadReport = {
  suite: string;
  counts: ReadCounts;
  problems: ReadProblem[];
};

/** What a read check found, suite by suite. */
export type ReadCheckReport = { suites: SuiteReadReport[] };

/** A row as read, keyed by Evalkeeper's field names. */
export type ReadRow = Readonly<Record<string, unknown>>;

/**
 * Where a read check reads rows from: a store's records
 * (`checkStoreReads`), or an adapter's raw rows before it fills in
 * defaults (`prismaReadCheck` in `@crowandraven/evalkeeper/prisma`), so a
 * value the store would quietly replace still shows. Cases come with
 * their answers in `labels`.
 */
export type ReadSource = {
  /** A suite's cases, retired ones too, each with its answers. */
  cases(suite: string): Promise<readonly ReadRow[]>;
  /** A suite's tests, newest first, at most `limit` when given. */
  tests(suite: string, limit: number | undefined): Promise<readonly ReadRow[]>;
  /** These tests' outputs. */
  outputs(testIds: readonly string[]): Promise<readonly ReadRow[]>;
};

/** What to check: suites by key, or the suites themselves. */
export type ReadCheckOptions = {
  /**
   * The suites to read. Pass the suite itself (not just its key) to also
   * check each case's input and answer against the suite's own schemas,
   * the way your code reads them.
   */
  suites: readonly (string | AnySuite)[];
  /** Read at most this many tests per suite, newest first. All by default. */
  tests?: number;
};

const CASE_STATUSES = ["DRAFT", "ACTIVE", "RETIRED"];
const SPLITS = ["DEV", "TEST"];
const LABEL_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "PROVISIONAL",
  "REJECTED",
  "SKIPPED",
];
const RUN_STATUSES = ["RUNNING", "SUCCEEDED", "FAILED"];

type Rule = (v: unknown) => string | null;

const missing = "is missing (no column for it, or not mapped)";
// JSON.stringify gives undefined for these, or throws for a bigint.
const show = (v: unknown): string =>
  v === undefined || typeof v === "bigint" || typeof v === "function"
    ? String(v)
    : JSON.stringify(v);

const text: Rule = (v) =>
  v === undefined
    ? missing
    : typeof v === "string"
      ? null
      : `isn't text: ${show(v)}`;
const textOrNull: Rule = (v) => (v === null ? null : text(v));
const present: Rule = (v) => (v === undefined ? missing : null);
const oneOf =
  (allowed: readonly string[], orNull = false): Rule =>
  (v) =>
    v === undefined
      ? missing
      : (orNull && v === null) || (typeof v === "string" && allowed.includes(v))
        ? null
        : `${show(v)} isn't one of ${allowed.join(", ")}`;
const when: Rule = (v) =>
  v === undefined
    ? missing
    : v instanceof Date && !Number.isNaN(v.getTime())
      ? null
      : `isn't a date: ${show(v)}`;
const whenOrNull: Rule = (v) => (v === null ? null : when(v));
const amount =
  (orNull: boolean): Rule =>
  (v) =>
    v === undefined
      ? missing
      : orNull && v === null
        ? null
        : typeof v === "number" && Number.isFinite(v) && v >= 0
          ? null
          : `isn't a number of zero or more: ${show(v)}`;
/** A run setting: a column the app may not have, so unset is fine. */
const setting: Rule = (v) =>
  v === undefined || v === null || (typeof v === "number" && Number.isFinite(v))
    ? null
    : `isn't a number: ${show(v)}`;
const count: Rule = (v) =>
  v === undefined
    ? missing
    : typeof v === "number" && Number.isInteger(v) && v >= 1
      ? null
      : `isn't a whole number of 1 or more: ${show(v)}`;
const yesNo: Rule = (v) =>
  v === undefined
    ? missing
    : typeof v === "boolean"
      ? null
      : `isn't true or false: ${show(v)}`;
const words: Rule = (v) =>
  v === undefined
    ? missing
    : Array.isArray(v) && v.every((x) => typeof x === "string")
      ? null
      : `isn't a list of words: ${show(v)}`;
const objectOrNull: Rule = (v) =>
  v === undefined || v === null || (typeof v === "object" && !Array.isArray(v))
    ? null
    : `isn't what the runner writes: ${show(v)}`;
const scores: Rule = (v) =>
  v === undefined ||
  v === null ||
  (Array.isArray(v) &&
    v.every(
      (s) =>
        typeof s === "object" &&
        s !== null &&
        typeof Reflect.get(s, "key") === "string",
    ))
    ? null
    : `isn't a list of check results: ${show(v)}`;

/**
 * The fields of each kind of row and what each must be. Nulls the stores
 * read on purpose (a legacy test with no set reads as ALL, no grader
 * version as empty) aren't problems.
 */
const RULES: Record<ReadKind, Record<string, Rule>> = {
  case: {
    id: text,
    suite: text,
    input: present,
    tags: words,
    split: oneOf(SPLITS),
    status: oneOf(CASE_STATUSES),
    source: text,
    sourceRef: textOrNull,
    note: textOrNull,
    createdAt: when,
    updatedAt: when,
  },
  answer: {
    id: text,
    kind: oneOf(["EXPECTED"]),
    status: oneOf(LABEL_STATUSES),
    value: present,
    raterRole: text,
    raterId: textOrNull,
    note: textOrNull,
    createdAt: when,
    updatedAt: when,
  },
  test: {
    id: text,
    suite: text,
    model: text,
    promptVersion: text,
    reasoningEffort: textOrNull,
    temperature: setting,
    maxOutputTokens: setting,
    set: oneOf(EVAL_SETS, true),
    repeats: count,
    datasetVersion: textOrNull,
    graderVersion: textOrNull,
    status: oneOf(RUN_STATUSES),
    metrics: objectOrNull,
    error: textOrNull,
    estimatedCostUsd: amount(true),
    startedBy: textOrNull,
    startedAt: when,
    finishedAt: whenOrNull,
  },
  output: {
    id: text,
    runId: text,
    caseId: text,
    repeat: count,
    requestHash: text,
    output: present,
    error: textOrNull,
    scores,
    costUsd: amount(false),
    ms: amount(false),
    reused: yesNo,
    createdAt: when,
  },
};

/**
 * What doesn't read as Evalkeeper expects in one row: each field that's
 * missing or holds a value the store can't use as it is.
 *
 * @param kind - What the row is.
 * @param row - The row, keyed by Evalkeeper's field names.
 */
export function rowProblems(
  kind: ReadKind,
  row: ReadRow,
): { field: string; problem: string }[] {
  const out: { field: string; problem: string }[] = [];
  for (const [field, rule] of Object.entries(RULES[kind])) {
    const problem = rule(row[field]);
    if (problem) out.push({ field, problem });
  }
  return out;
}

const idOf = (row: ReadRow) => (typeof row.id === "string" ? row.id : "");
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** The first thing a schema says is wrong, in a line. */
function schemaProblem(
  schema: AnySuite["input"],
  value: unknown,
): string | null {
  const parsed = schema.safeParse(value);
  if (parsed.success) return null;
  const [first] = parsed.error.issues;
  const where = first?.path.length ? `${first.path.join(".")}: ` : "";
  return `doesn't fit the suite's schema (${where}${first?.message ?? "invalid"})`;
}

async function checkSuite(
  source: ReadSource,
  key: string,
  suite: AnySuite | null,
  opts: ReadCheckOptions,
): Promise<SuiteReadReport> {
  const counts: ReadCounts = { cases: 0, answers: 0, tests: 0, outputs: 0 };
  const problems: ReadProblem[] = [];
  const add = (kind: ReadKind, row: ReadRow) => {
    for (const p of rowProblems(kind, row))
      problems.push({ suite: key, kind, id: idOf(row), ...p });
  };
  const unreadable = (kind: ReadKind, e: unknown) =>
    problems.push({
      suite: key,
      kind,
      id: "",
      field: "",
      problem: `couldn't be read: ${message(e)}`,
    });

  try {
    for (const c of await source.cases(key)) {
      counts.cases++;
      add("case", c);
      if (suite && c.input !== undefined) {
        const p = schemaProblem(suite.input, c.input);
        if (p)
          problems.push({
            suite: key,
            kind: "case",
            id: idOf(c),
            field: "input",
            problem: p,
          });
      }
      if (!Array.isArray(c.labels)) {
        problems.push({
          suite: key,
          kind: "case",
          id: idOf(c),
          field: "labels",
          problem:
            "has no list of answers (check the mapping's labels relation)",
        });
        continue;
      }
      for (const l of c.labels as unknown[]) {
        counts.answers++;
        const row: ReadRow =
          typeof l === "object" && l !== null
            ? // Trust boundary: a row object from the source, read by key.
              (l as ReadRow)
            : {};
        add("answer", row);
        // A skip (blind rating) has no answer to fit the schema.
        if (suite && row.value !== undefined && row.status !== "SKIPPED") {
          const p = schemaProblem(suite.labelValue, row.value);
          if (p)
            problems.push({
              suite: key,
              kind: "answer",
              id: idOf(row),
              field: "value",
              problem: p,
            });
        }
      }
    }
  } catch (e) {
    unreadable("case", e);
  }

  let testIds: string[] = [];
  try {
    const tests = await source.tests(key, opts.tests);
    counts.tests = tests.length;
    for (const t of tests) add("test", t);
    testIds = tests.map(idOf).filter((id) => id !== "");
  } catch (e) {
    unreadable("test", e);
  }

  if (testIds.length) {
    try {
      const outputs = await source.outputs(testIds);
      counts.outputs = outputs.length;
      for (const o of outputs) add("output", o);
    } catch (e) {
      unreadable("output", e);
    }
  }
  return { suite: key, counts, problems };
}

/**
 * Reads each suite's rows from a source and lists what doesn't parse, with
 * counts. Read-only. Use `checkStoreReads` for any store, or an adapter's
 * own check (`prismaReadCheck`) to see values before the store fills in
 * defaults.
 *
 * @param source - Where to read the rows.
 * @param opts - Which suites, and how many tests of each.
 */
export async function checkReads(
  source: ReadSource,
  opts: ReadCheckOptions,
): Promise<ReadCheckReport> {
  const suites: SuiteReadReport[] = [];
  for (const s of opts.suites)
    suites.push(
      await checkSuite(
        source,
        typeof s === "string" ? s : s.key,
        typeof s === "string" ? null : s,
        opts,
      ),
    );
  return { suites };
}

/**
 * Reads each suite's cases, answers, tests, and outputs through a store
 * and lists anything that doesn't parse, with counts. Read-only, so it's
 * safe on a copy of real data. A store may fill in defaults as it reads
 * (the Prisma store reads an unknown status as a known one); for a Prisma
 * store, `prismaReadCheck` sees the values before that.
 *
 * @param store - The store to read through.
 * @param opts - Which suites, and how many tests of each.
 *
 * @example
 * ```ts
 * import { checkStoreReads, readCheckSummary } from "@crowandraven/evalkeeper";
 *
 * const report = await checkStoreReads(store, { suites: SUITES });
 * console.log(readCheckSummary(report).join("\n"));
 * ```
 */
export function checkStoreReads(
  store: EvalStore,
  opts: ReadCheckOptions,
): Promise<ReadCheckReport> {
  return checkReads(
    {
      cases: (suite) => store.listCases(suite, { includeRetired: true }),
      tests: (suite, limit) =>
        store.listRuns(suite, limit === undefined ? {} : { limit }),
      outputs: async (ids) =>
        store.listOutputsFor
          ? store.listOutputsFor([...ids])
          : (await Promise.all(ids.map((id) => store.listOutputs(id)))).flat(),
    },
    opts,
  );
}

const plural = (n: number, one: string, many: string) =>
  `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/**
 * A read check in words: a line per suite with its counts, then each kind
 * of problem once with how many rows have it and an example id.
 *
 * @param report - What `checkReads`, `checkStoreReads`, or
 * `prismaReadCheck` found.
 */
export function readCheckSummary(report: ReadCheckReport): string[] {
  const lines: string[] = [];
  for (const s of report.suites) {
    const c = s.counts;
    lines.push(
      `${s.suite}: ${plural(c.cases, "case", "cases")}, ${plural(c.answers, "answer", "answers")}, ${plural(c.tests, "test", "tests")}, and ${plural(c.outputs, "output", "outputs")}; ${s.problems.length ? plural(s.problems.length, "problem", "problems") : "no problems"}.`,
    );
    const groups = new Map<string, { n: number; id: string }>();
    for (const p of s.problems) {
      const what = `${p.kind}${p.field ? ` ${p.field}` : ""} ${p.problem}`;
      const g = groups.get(what);
      if (g) g.n++;
      else groups.set(what, { n: 1, id: p.id });
    }
    for (const [what, g] of groups)
      lines.push(
        `  ${what}: ${plural(g.n, "row", "rows")}${g.id ? ` (e.g. ${g.id})` : ""}.`,
      );
  }
  return lines;
}
