import { nextSplit } from "./quickSet.js";
import { stableJson } from "./stableJson.js";
import type { EvalStore, NewCase, NewLabel } from "./store.js";
import type { AnySuite } from "./types.js";

/** One row of an import, mapped to the suite's shapes. */
export type ImportedCase = {
  /** Stable within its source (a row id in the file), so a rerun skips it. */
  id: string;
  /** The suite's input; checked against `suite.input`. */
  input: unknown;
  /** The answer, checked against `suite.labelValue`; null: none yet. */
  label: unknown;
  tags?: string[];
  note?: string | null;
  /** This row's set, instead of the import's `split`. */
  split?: "DEV" | "TEST";
};

/**
 * How imported answers arrive. Pending (the default): a person confirms
 * each one on the pages before tests use it. Provisional: tests use them
 * now, every score says it rests on unreviewed answers, and the rows carry
 * `tag` so the review queue is findable. Use provisional only when the
 * owner said so; `allowedBy` and `at` record who and when. Confirmed: only
 * for answers a person already reviewed in the system they come from;
 * `confirmedBy` and `at` read who and when from each row, and the import
 * is refused unless every row names both. Answers drafted by an agent or
 * scraped from somewhere are never imported confirmed.
 */
export type ImportAnswers<Row = never> =
  | { status: "PENDING" }
  | {
      status: "PROVISIONAL";
      /** Who drafted the answers: an agent's name, recorded as the rater. */
      rater: string;
      /** The person who allowed using them before review. */
      allowedBy: string;
      /** When they allowed it; default now. */
      at?: Date;
      /** Added to each row's tags; default "needs-review". */
      tag?: string;
    }
  | {
      status: "CONFIRMED";
      /**
       * The person who confirmed this row's answer in the old system,
       * recorded as the rater. Never defaulted: a row without one stops
       * the import.
       */
      confirmedBy: (row: Row) => string | null | undefined;
      /**
       * When they confirmed it: a Date, or text `Date` can read. Never
       * defaulted: a row without one, or with one in the future, stops
       * the import.
       */
      at: (row: Row) => Date | string | null | undefined;
    };

/** A row that couldn't be imported, and why. */
export type ImportProblem = { id: string; problem: string };

/** Rows that don't fit the suite. Nothing was written. */
export class CaseImportError extends Error {
  readonly problems: ImportProblem[];
  constructor(source: string, problems: ImportProblem[]) {
    super(
      `${problems.length} row${problems.length === 1 ? "" : "s"} in ${source} can't be imported, so none were: ${problems
        .slice(0, 5)
        .map((p) => `${p.id} (${p.problem})`)
        .join("; ")}${problems.length > 5 ? "; …" : ""}`,
    );
    this.name = "CaseImportError";
    this.problems = problems;
  }
}

/** What a suite's leak check removed from one imported case. */
export type ImportLeak = {
  /** The row's id within its source. */
  id: string;
  /** A plain line for each item removed. */
  removed: string[];
};

/** What an import did. */
export type ImportResult = {
  /** Cases created. */
  added: number;
  /** Rows imported before (by source and id), left alone. */
  skipped: number;
  /**
   * The cases added that the suite's `withoutLeaks` changed, and what it
   * removed from each, for a person to check. Empty without a leak check.
   */
  removed: ImportLeak[];
};

/**
 * Runs a suite's leak check (`withoutLeaks`) on an input about to be
 * frozen into a case, and checks the result still fits the suite's input.
 * Without a leak check, the input comes back as it was. Use it wherever
 * cases are made outside `importCases`, such as an "add case" action.
 *
 * @param suite - The suite the case belongs to.
 * @param input - The case's input, already checked against `suite.input`.
 * @param sourceRef - What the case was made from, or null when added by
 *   hand.
 * @returns The input to freeze, and what was removed from it.
 * @throws When the leak check returns an input that doesn't fit the suite.
 */
export function withoutLeaks(
  suite: AnySuite,
  input: unknown,
  sourceRef: string | null,
): { input: unknown; removed: string[] } {
  if (!suite.withoutLeaks) return { input, removed: [] };
  const out = suite.withoutLeaks(input, { sourceRef });
  const parsed = suite.input.safeParse(out.input);
  if (!parsed.success)
    throw new Error(
      `the leak check left an input that doesn't fit: ${parsed.error.issues[0]?.message ?? "invalid"}`,
    );
  return { input: parsed.data, removed: out.removed };
}

/** A note line saying what a leak check removed; null when nothing. */
export function leakNote(removed: readonly string[]): string | null {
  return removed.length
    ? `Removed before freezing, as learned from this case: ${removed.join("; ")}.`
    : null;
}

/** A date read from a row: a Date, or text Date can read; null if neither. */
function dateOf(v: Date | string | null | undefined): Date | null {
  if (v === null || v === undefined || v === "") return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

const day = (d: Date) => d.toISOString().slice(0, 10);

const sourceRefOf = (source: string, id: string) => `${source}#${id}`;

/**
 * Imports existing test data as cases for one suite. Every row is mapped
 * and checked against the suite's input and answer schemas first; if any
 * row fails, nothing is written and `CaseImportError` lists them. Rows
 * imported before (same source and id, retired ones included) are skipped,
 * so it can run again after the file grows.
 *
 * Splits: "DEV" for cases you tune against, "TEST" for a held-out file,
 * "auto" (the default) for new cases, split like cases added by hand.
 *
 * A suite with a leak check (`withoutLeaks`) has it run on every input
 * before it's frozen; `removed` in the result lists what it took out of
 * each case, and the case's note says so too.
 *
 * Answers arrive pending unless `answers` says otherwise (see
 * `ImportAnswers`); import them confirmed only when a person reviewed
 * them in the old system, naming who and when on every row.
 *
 * Run it against your development database; an app's own guard should
 * refuse a production one.
 *
 * @example
 * ```ts
 * const { added, skipped } = await importCases({
 *   store,
 *   suite: ticketTriage,
 *   source: "tickets-heldout.json",
 *   rows: JSON.parse(await readFile("tickets-heldout.json", "utf8")),
 *   map: (r) => ({ id: r.id, input: { body: r.text }, label: { queue: r.queue } }),
 *   split: "TEST",
 * });
 *
 * // Answers people already reviewed in an old harness:
 * await importCases({
 *   store,
 *   suite: ticketTriage,
 *   source: "old-harness",
 *   rows,
 *   map,
 *   answers: {
 *     status: "CONFIRMED",
 *     confirmedBy: (r) => r.reviewer,
 *     at: (r) => r.reviewedAt,
 *   },
 * });
 * ```
 */
export async function importCases<Row>(opts: {
  store: EvalStore;
  suite: AnySuite;
  /** Where the rows came from, such as a file name. */
  source: string;
  rows: readonly Row[];
  map: (row: Row, index: number) => ImportedCase;
  split?: "DEV" | "TEST" | "auto";
  answers?: ImportAnswers<Row>;
}): Promise<ImportResult> {
  const { store, suite, source } = opts;
  const answers: ImportAnswers<Row> = opts.answers ?? { status: "PENDING" };
  const now = new Date();

  // 1. Map and check every row before writing anything.
  const problems: ImportProblem[] = [];
  const seen = new Set<string>();
  const mapped: (ImportedCase & {
    input: unknown;
    label: unknown;
    removed: string[];
    confirmed: { by: string; at: Date } | null;
  })[] = [];
  opts.rows.forEach((row, i) => {
    let c: ImportedCase;
    try {
      c = opts.map(row, i);
    } catch (e) {
      problems.push({
        id: `row ${i + 1}`,
        problem: e instanceof Error ? e.message : String(e),
      });
      return;
    }
    const id = c.id || `row ${i + 1}`;
    if (!c.id) problems.push({ id, problem: "no id" });
    else if (seen.has(c.id))
      problems.push({ id, problem: "the same id as an earlier row" });
    seen.add(c.id);
    const input = suite.input.safeParse(c.input);
    if (!input.success)
      problems.push({
        id,
        problem: `input: ${input.error.issues[0]?.message ?? "invalid"}`,
      });
    let label: unknown = null;
    if (c.label !== null && c.label !== undefined) {
      const l = suite.labelValue.safeParse(c.label);
      if (!l.success)
        problems.push({
          id,
          problem: `answer: ${l.error.issues[0]?.message ?? "invalid"}`,
        });
      else label = l.data;
    }
    let confirmed: { by: string; at: Date } | null = null;
    if (answers.status === "CONFIRMED") {
      const by = answers.confirmedBy(row)?.trim();
      const at = dateOf(answers.at(row));
      if (!by)
        problems.push({ id, problem: "no person who confirmed the answer" });
      if (!at)
        problems.push({ id, problem: "no date the answer was confirmed" });
      else if (at > now)
        problems.push({ id, problem: "a confirmation date in the future" });
      if (by && at) confirmed = { by, at };
    }
    if (!input.success) return;
    let cleaned: { input: unknown; removed: string[] };
    try {
      cleaned = withoutLeaks(suite, input.data, sourceRefOf(source, c.id));
    } catch (e) {
      problems.push({
        id,
        problem: e instanceof Error ? e.message : String(e),
      });
      return;
    }
    mapped.push({ ...c, ...cleaned, label, confirmed });
  });
  if (problems.length) throw new CaseImportError(source, problems);

  // 2. Skip what's already there, retired cases included.
  const existing = await store.listCases(suite.key, { includeRetired: true });
  const refs = new Set(existing.map((c) => c.sourceRef));
  const counts = { DEV: 0, TEST: 0 };
  for (const c of existing) if (c.status !== "RETIRED") counts[c.split] += 1;

  const at =
    answers.status === "PROVISIONAL" ? (answers.at ?? new Date()) : null;
  let added = 0;
  let skipped = 0;
  const removed: ImportLeak[] = [];
  for (const c of mapped) {
    const sourceRef = sourceRefOf(source, c.id);
    if (refs.has(sourceRef)) {
      skipped += 1;
      continue;
    }
    const split =
      c.split ??
      (opts.split === "DEV" || opts.split === "TEST"
        ? opts.split
        : nextSplit(counts));
    counts[split] += 1;
    const labels: NewLabel[] = [];
    if (c.label !== null) {
      if (answers.status === "PROVISIONAL")
        labels.push({
          kind: "EXPECTED",
          status: "PROVISIONAL",
          value: c.label,
          raterRole: "AGENT",
          raterId: answers.rater,
          note: `Drafted by ${answers.rater}; ${answers.allowedBy} allowed testing on it before review (${at ? day(at) : ""}).`,
        });
      else if (c.confirmed)
        labels.push({
          kind: "EXPECTED",
          status: "CONFIRMED",
          value: c.label,
          raterRole: "REVIEWER",
          raterId: c.confirmed.by,
          note: `Imported as reviewed from ${source}: ${c.confirmed.by} confirmed it there on ${day(c.confirmed.at)}.`,
        });
      else
        labels.push({
          kind: "EXPECTED",
          status: "PENDING",
          value: c.label,
          raterRole: "IMPORT",
          raterId: null,
          note: null,
        });
    }
    const tags = [...(c.tags ?? [])];
    if (answers.status === "PROVISIONAL" && c.label !== null) {
      const tag = answers.tag ?? "needs-review";
      if (!tags.includes(tag)) tags.push(tag);
    }
    const note = [c.note ?? null, leakNote(c.removed)]
      .filter((n): n is string => !!n)
      .join(" ");
    const data: NewCase = {
      suite: suite.key,
      input: c.input,
      tags,
      split,
      // In use only with an answer tests may grade against.
      status:
        c.label !== null && answers.status !== "PENDING" ? "ACTIVE" : "DRAFT",
      source: "IMPORT",
      sourceRef,
      note: note || null,
      labels,
    };
    await store.createCase(data);
    refs.add(sourceRef);
    added += 1;
    if (c.removed.length) removed.push({ id: c.id, removed: c.removed });
  }
  return { added, skipped, removed };
}

/** A short, stable id for a starter case: a hash of its input. */
function starterId(input: unknown): string {
  // FNV-1a: the core stays free of node:crypto; this only names rows.
  let h = 0x811c9dc5;
  for (const ch of stableJson(input)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/**
 * Adds a suite's `starter` cases as drafts with pending answers, for a
 * person to confirm on the pages. Safe to run again: starters already
 * added (by their input) are skipped. A suite's leak check runs on each,
 * as in `importCases`.
 */
export function importStarters(
  store: EvalStore,
  suite: AnySuite,
): Promise<ImportResult> {
  return importCases({
    store,
    suite,
    source: `starter:${suite.key}`,
    rows: suite.starter ?? [],
    map: (s) => ({
      id: starterId(s.input),
      input: s.input,
      label: s.label,
      tags: s.tags,
      note: s.note,
      split: s.split,
    }),
  });
}
