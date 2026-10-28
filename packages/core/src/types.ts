import type { z } from "zod";
import type { ReasoningEffort } from "./models.js";
import type { ShippedReview } from "./reviews.js";

/**
 * An eval suite: how to run one AI operation on a frozen case and how to
 * grade what comes back. Code says how to evaluate; the database holds the
 * cases and labels (EvalCase, EvalCaseLabel). See docs/evals.md.
 */

/** One check on one output. null: doesn't apply to this case. */
export type CheckResult = {
  key: string;
  pass: boolean | null;
  /** Why it failed (or a detail worth showing), in plain words. */
  note?: string | undefined;
  /**
   * What a decision check's answer gave, right or wrong ("34% true, bar
   * 40%", "bug (90%)"), so a run page can show the probability beside the
   * bar it was read at.
   */
  given?: string | undefined;
  /** For matching checks: which expected item matched which output, and why. */
  matches?: { expected: string; actual: string; why: string }[] | undefined;
  /** "meaning": a judge model matched them; "words": shared words did. */
  matchedBy?: "meaning" | "words" | undefined;
  /**
   * Partial credit: of the parts this answer should have (e.g. expected
   * items), how many it got right. The headline score sums these.
   */
  units?: { right: number; total: number } | undefined;
  /**
   * Numbers measured on this answer, averaged across a test: a decision's
   * `brier`, `logLoss`, `confidence`, and `correct` (see decisionCheck).
   */
  measures?: Record<string, number> | undefined;
};

/**
 * One check a suite runs: what it checks, whether it needs an answer, and how serious a
 * miss is.
 */
export type CheckDef = {
  key: string;
  label: string;
  /** What it checks, for the page that explains the suite. */
  description: string;
  /** "code": needs no label. "label": compares with a confirmed label. */
  kind: "code" | "label";
  /**
   * Serious: changes what the product does (which queue a ticket lands
   * in, what a summary claims). Minor: a fair difference of judgment (a category, how finely
   * to split). Models are ranked on serious mistakes.
   */
  severity: "serious" | "minor";
  /** Pass rate it should reach; default by severity (checkBar). */
  bar?: number;
};

/** The pass rate a check should reach: its own, else 95% serious, 75% minor. */
export function checkBar(c: CheckDef): number {
  return c.bar ?? (c.severity === "serious" ? 0.95 : 0.75);
}

/** Meets the bar, is within 10 points of it, or is further below. */
export function barStatus(
  rate: number,
  bar: number,
): "meets" | "close" | "below" {
  return rate >= bar ? "meets" : rate >= bar - 0.1 ? "close" : "below";
}

/**
 * What a suite cares about once accuracy holds. Accuracy is always the
 * floor; this is the one thing worth switching models for beyond it.
 */
export type SuitePriority = {
  /** speed: someone waits on it. cost: runs in the background, often.
   * quality: people read and act on it, so only accuracy counts. */
  favor: "speed" | "cost" | "quality";
  /** Models slower than this on average are never suggested. */
  maxSeconds?: number;
};

/** Each priority, explained for the suite page. */
export const FAVOR_TEXT: Record<SuitePriority["favor"], string> = {
  speed:
    "speed: someone waits on this, so a model that scores as well and answers clearly faster is worth switching to, and so is one about as accurate (within 10 points) in half the time",
  cost: "cost: this runs in the background, often, so a model that scores as well and is clearly cheaper is worth switching to, and so is one about as accurate (within 10 points) at half the cost",
  quality:
    "quality: people read and act on this, so only clearly better accuracy or fewer serious mistakes is worth switching for",
};

/**
 * An eval suite: how to call one AI feature on a model and how to grade what comes back.
 * Code says how to evaluate; the store holds the cases and answers.
 */
export type Suite<Input, Output, Label> = {
  key: string;
  /** The AI feature it tests, as your app names it ("summarize_ticket"). */
  operation: string;
  priority: SuitePriority;
  label: string;
  description: string;
  /** Bump when checks change, so runs say which grading they used. */
  graderVersion: string;
  input: z.ZodType<Input>;
  /** The EXPECTED label's value. */
  labelValue: z.ZodType<Label>;
  checks: CheckDef[];
  /** Calls the operation on exactly this model, recorded as an eval. */
  run(
    input: Input,
    ctx: {
      model: string;
      /** A reasoning setting to test; undefined: the operation's own. */
      reasoningEffort?: ReasoningEffort | null;
      /**
       * The temperature the test runs at: the operation's live one when the
       * test was started. Null: send none. Undefined from runners before
       * temperature was versioned.
       */
      temperature?: number | null;
      /**
       * The output-token cap the test runs at, like temperature. Null: send
       * none (the call's own default).
       */
      maxOutputTokens?: number | null;
      onCost: (usd: number) => void;
    },
  ): Promise<Output>;
  /**
   * Grades one output. `label` is the confirmed one, or null. A check that
   * asks a judge model reports its cost through `ctx.onCost`.
   */
  grade(
    input: Input,
    output: Output,
    label: Label | null,
    ctx?: { onCost: (usd: number) => void },
  ): Promise<CheckResult[]>;
  /**
   * Checks that compare a test's answers with each other, such as ranking.
   * Gets every graded answer of one repeat; returns extra checks for each,
   * in the same order. Pure; runs after a test and on every regrade.
   */
  gradeTogether?(
    answers: { input: Input; output: Output; label: Label | null }[],
  ): CheckResult[][];
  /** Reads a case's input from the add/edit form; throws on bad input. */
  inputFromForm(form: FormData): Input;
  /** Reads an answer from the add/edit form; throws on bad input. */
  labelFromForm?(form: FormData): Label;
  /**
   * The operation's output as an answer, so a thumbs-up can propose it
   * (pending until a person confirms it). Omit when outputs and answers
   * differ too much to propose one.
   */
  labelFromOutput?(output: Output): Label;
  /**
   * The form's fields, so pages can render one for any suite. Every field
   * has a plain label and help: people confirming answers weeks later
   * won't remember what a field means.
   */
  fields?: { input: FormField[]; label: FormField[] };
  /** Drafted cases to start from, added as drafts with PENDING labels. */
  starter?: {
    input: Input;
    label: Label;
    tags: string[];
    split: "DEV" | "TEST";
    smoke?: boolean;
    note: string;
  }[];
  /**
   * Reviews of `starter` cases that ship with the suite: its author or an
   * expert confirmed a case's answer once, for every app, so
   * `importStarters` adds it confirmed instead of pending. Each names who,
   * what qualifies them, and when, and counts only while the case's input
   * and answer are what they saw; the suite contract fails on one that
   * doesn't.
   */
  reviews?: readonly ShippedReview[];
  /**
   * Drafts new cases aimed at what the answer key is missing, for a person
   * to review (they arrive with PENDING answers).
   */
  draftMore?(args: {
    existing: { input: Input; tags: string[] }[];
    count: number;
    focus: string | null;
  }): Promise<{ input: Input; label: Label; tags: string[]; note: string }[]>;
  /**
   * Drafts cases from what the feature saw in your app since a date (inputs
   * people rated or admins flagged), so the answer key keeps up with real
   * use. The weekly check calls it through `draftFromActivity`; drafts
   * arrive with a PENDING answer or none, never confirmed. Strip names,
   * contact details, and anything identifying from each input. Return at
   * most `limit`, and skip anything whose `sourceRef` is in `known`.
   */
  draftFromActivity?(args: {
    /** Look at activity from this date on. */
    since: Date;
    /** The suite's cases, retired ones too, to avoid near-repeats. */
    existing: { input: Input; tags: string[] }[];
    /** The most drafts to return: what's left of this week's allowance. */
    limit: number;
    /** The `sourceRef` of every draft made before: skip these. */
    known: ReadonlySet<string>;
  }): Promise<ActivityDraft<Input, Label>[]>;
  /**
   * How long one answer may take before it counts as failed. Default 60s;
   * multi-step agent turns need more. Keep it under the run budget.
   */
  answerTimeoutMs?: number;
  /**
   * How many answers a test asks for at once. Default 6; slow operations
   * need more to finish before the platform's time limit.
   */
  concurrency?: number;
  /**
   * Graded as decisions (typed answers with probabilities, as from the AI
   * SDK's `experimental_decide`), so pages show probability quality and
   * calibration next to accuracy, and which models' probabilities are
   * native or prompted.
   */
  decisions?: boolean;
  /** What the headline counts: "items", "tickets", … Default "answers". */
  unitNoun?: string;
  /**
   * "typed": cases are text someone types (added by hand, or drafted).
   * "imported": cases are frozen from the app's own data, then rated by a
   * person.
   * "fixture": cases are structured inputs, shown with describe() and
   * edited as JSON.
   */
  caseKind?: "typed" | "imported" | "fixture";
  /**
   * Removes anything the input learned from its own case before it's
   * frozen, so a case can't carry its answer: facts the app learned from
   * the person's reaction to that same item, for example. `importCases`,
   * `importStarters`, and adding a case on the pages run it, and report
   * what it removed per case so a person can check it. Match on something
   * specific to the case (the company's name), not something general (a
   * job title), or it removes what other cases rightly share.
   *
   * @param input - The case's input, already checked against `input`.
   * @param source - Where the case came from: its `sourceRef`, or null
   *   for a case added by hand.
   * @returns The input without what leaked, and a plain line for each
   *   item removed (empty when nothing was).
   */
  withoutLeaks?(
    input: Input,
    source: { sourceRef: string | null },
  ): { input: Input; removed: string[] };
  /** A short line naming the case in lists. */
  title(input: Input): string;
  /** Fixture suites: the whole input, readable, for reviewing a case. */
  describe?(input: Input): string;
  /** Fixture suites: what the expected answer's fields mean. */
  labelHelp?: string;
};

/**
 * A case a suite drafted from your app's activity, for a person to review.
 * Return these from `Suite.draftFromActivity`.
 */
export type ActivityDraft<Input, Label> = {
  /** The input the feature saw, with names and contact details removed. */
  input: Input;
  /** A proposed answer, stored PENDING; null: the reviewer writes one. */
  label: Label | null;
  tags: string[];
  /** Why it was drafted, shown to the reviewer ("Rated thumbs down."). */
  note: string;
  /**
   * What it was drafted from (an id in your app), so it's never drafted
   * twice, even weeks later or after someone retires it.
   */
  sourceRef: string;
};

/**
 * One field of a suite's add/edit form. `name` is the form key (and the
 * input or answer property it fills). "lines": one item per line, read as
 * a list.
 */
export type FormField = {
  name: string;
  label: string;
  help: string;
  kind: "text" | "textarea" | "select" | "lines";
  /** For "select". */
  options?: readonly string[];
  required?: boolean;
};

/** A value as plain text: strings as they are, other values as JSON. */
export function asText(v: unknown): string {
  if (v === undefined || v === null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v);
}

/** A form value as text: "" when missing or a file. */
export function formText(form: FormData, name: string): string {
  const v = form.get(name);
  return typeof v === "string" ? v.trim() : "";
}

/** A field's value from a stored input or answer, as the form shows it. */
export function fieldValue(field: FormField, value: unknown): string {
  const v =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)[field.name]
      : undefined;
  if (Array.isArray(v)) return v.map(asText).join("\n");
  return asText(v);
}

/** A "lines" field's value as a list: one item per non-empty line. */
export function linesOf(form: FormData, name: string): string[] {
  return formText(form, name)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

/**
 * A suite of any shape, for registries. Its methods take and return
 * `unknown`; a suite's own code keeps its precise types.
 */
export type AnySuite = Suite<unknown, unknown, unknown>;

/**
 * Whether a suite is an injection suite (`injectionSuite` from
 * `@crowandraven/evalkeeper/suites`): it runs on its base suite's
 * operation, so code that finds a feature's suite by operation should
 * skip it and find the base suite.
 *
 * @param suite - Any registered suite.
 */
export function isInjectionSuite(
  suite: AnySuite,
): suite is AnySuite & { base: AnySuite } {
  return "base" in suite && "attackCase" in suite;
}

/** Where a zod issue sits, in plain words: "facts, item 2, name". */
function issuePath(path: readonly (string | number)[]): string {
  return path
    .map((p) => (typeof p === "number" ? `item ${p + 1}` : p))
    .join(", ");
}

/**
 * Reads one form field as JSON and checks it with a schema; throws a
 * plain error when the field is empty, isn't JSON, or doesn't fit (naming
 * the first part that doesn't).
 */
function readJson<T>(
  form: FormData,
  field: string,
  what: string,
  schema: z.ZodType<T>,
): T {
  const text = formText(form, field);
  if (!text) throw new Error(`${what} is empty: fill in the "${field}" field`);
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (e) {
    throw new Error(
      `${what} isn't valid JSON: ${e instanceof Error ? e.message : String(e)}`,
      { cause: e },
    );
  }
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  const issue = parsed.error.issues[0];
  const where = issue ? issuePath(issue.path) : "";
  const message = issue?.message ?? "invalid";
  throw new Error(
    where
      ? `${what} doesn't fit at ${where}: ${message}`
      : `${what} doesn't fit: ${message}`,
  );
}

/**
 * A suite's `inputFromForm` for fixture suites (`caseKind: "fixture"`),
 * whose cases are edited as JSON in one textarea. Reads the field, parses
 * it, and checks it with the schema; throws a plain error when it's empty,
 * isn't valid JSON ("Input isn't valid JSON: …"), or doesn't fit, naming
 * the first part that doesn't ("Input doesn't fit at facts, item 2, name:
 * Required").
 *
 * @param schema - The suite's input schema.
 * @param field - The form field holding the JSON; default "input".
 * @returns A form reader to use as the suite's `inputFromForm`.
 *
 * @example
 * ```ts
 * const profileFit: Suite<Profile, Fit, FitLabel> = {
 *   // …
 *   caseKind: "fixture",
 *   inputFromForm: inputFromJson(profileSchema),
 *   labelFromForm: labelFromJson(fitLabelSchema),
 * };
 * ```
 */
export function inputFromJson<T>(
  schema: z.ZodType<T>,
  field = "input",
): (form: FormData) => T {
  return (form) => readJson(form, field, "Input", schema);
}

/**
 * A suite's `labelFromForm` for fixture suites: like `inputFromJson`, for
 * the expected answer ("Answer isn't valid JSON: …").
 *
 * @param schema - The suite's answer schema (`labelValue`).
 * @param field - The form field holding the JSON; default "label".
 * @returns A form reader to use as the suite's `labelFromForm`.
 */
export function labelFromJson<T>(
  schema: z.ZodType<T>,
  field = "label",
): (form: FormData) => T {
  return (form) => readJson(form, field, "Answer", schema);
}
