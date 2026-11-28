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
  /**
   * Set by Evalkeeper when it grades: the check's level then (the suite's,
   * or a person's from Suite settings). A nice-to-have (`minor`) miss
   * never fails an answer (`allPassed`). Absent on answers graded before
   * levels were kept: those count every check.
   */
  level?: CheckDef["severity"] | undefined;
  /**
   * Set by Evalkeeper on checks from a suite's `gradeTogether`: they grade
   * this answer against others (a ranking), so the case matters to other
   * cases' results too, and is never retired as easy.
   */
  together?: boolean | undefined;
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
   * Its level. Serious (must pass): changes what the product does (which
   * queue a ticket lands in, what a summary claims); models are ranked on
   * these misses first. Moderate (should pass): matters, but less. Minor
   * (nice to have): a fair difference of judgment (a category, how finely
   * to split); tracked against its aim, but never fails an answer. A
   * person can change any check's level in the suite's settings.
   */
  severity: "serious" | "moderate" | "minor";
  /**
   * The pass rate it aims for, shown as its aim; default by severity
   * (checkBar).
   */
  bar?: number;
  /**
   * True when grading it can ask an AI judge (such as
   * `createMeaningJudge`) to compare wording. Rescoring such a suite may
   * then cost a little, for wording the judge hasn't seen, so the pages
   * say so and wait while tests are stopped or over a daily limit.
   */
  judged?: boolean;
};

/**
 * Whether any of a suite's checks asks an AI judge (`CheckDef.judged`),
 * so rescoring it may cost a little. Use it to say what a rescore costs.
 *
 * @param suite - The suite, or anything with its checks.
 */
export function usesJudge(suite: { checks: readonly CheckDef[] }): boolean {
  return suite.checks.some((c) => c.judged === true);
}

/**
 * Each level's aim when a check sets none: must pass 95%, should pass 85%,
 * nice to have 75%.
 */
export const DEFAULT_AIM: Readonly<Record<CheckDef["severity"], number>> = {
  serious: 0.95,
  moderate: 0.85,
  minor: 0.75,
};

/** The levels in order, most important first, for sorting checks. */
export const SEVERITY_ORDER: readonly CheckDef["severity"][] = [
  "serious",
  "moderate",
  "minor",
];

/**
 * What the pages call each level: a serious check must pass, a moderate
 * one should pass, a minor one is nice to have.
 */
export const SEVERITY_LABEL: Readonly<Record<CheckDef["severity"], string>> = {
  serious: "Must pass",
  moderate: "Should pass",
  minor: "Nice to have",
};

/** The pass rate a check should reach: its own, else its level's (DEFAULT_AIM). */
export function checkBar(c: CheckDef): number {
  return c.bar ?? DEFAULT_AIM[c.severity];
}

/**
 * A rate as a whole percent, except when it's under its bar but would
 * round up to it: then one decimal, so "94.7%, under the 95% bar" never
 * reads as "95%, under the 95% bar". Pure.
 */
export function pctBeside(rate: number, bar: number): string {
  const whole = Math.round(rate * 100);
  return rate < bar && whole >= Math.round(bar * 100)
    ? `${(Math.floor(rate * 1000) / 10).toFixed(1)}%`
    : `${whole}%`;
}

/** Meets the aim (bar), is within 10 points of it, or is further below. */
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
  /**
   * How careful the suggestion is with the feature's attack cases. Strict
   * (the default): never a model with more must-pass misses under attack
   * than live. Balanced: one more is allowed when the model has a real
   * gain (clearly more accurate, or at least two fewer must-pass misses).
   * Off: attacks are shown, not weighed. A person can change it in the
   * suite's settings.
   */
  attacks?: AttackCare;
};

/** How careful the suggestion is with attacks (`SuitePriority.attacks`). */
export type AttackCare = "strict" | "balanced" | "off";

/** Each attack setting, in order, with its name and what it does. */
export const ATTACK_CARE: readonly {
  value: AttackCare;
  label: string;
  text: string;
}[] = [
  {
    value: "strict",
    label: "Strict",
    text: "never a model with more must-pass misses on the attacks than live",
  },
  {
    value: "balanced",
    label: "Balanced",
    text: "one more must-pass miss on the attacks is allowed for a model that's clearly more accurate or makes at least two fewer must-pass misses",
  },
  {
    value: "off",
    label: "Off",
    text: "attacks are shown on the board but not weighed",
  },
];

/** Each priority, explained for the suite page. */
export const FAVOR_TEXT: Record<SuitePriority["favor"], string> = {
  speed:
    "speed: someone waits on this, so a model that scores as well and answers clearly faster is worth switching to, and so is one with similar accuracy (within 10 points) in half the time",
  cost: "cost: this runs in the background, often, so a model that scores as well and is clearly cheaper is worth switching to, and so is one with similar accuracy (within 10 points) at half the cost",
  quality:
    "quality: people read and act on this, so only clearly better accuracy or fewer must-pass misses is worth switching for",
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
  /**
   * How many cases this suite's answer key should have (default 50). Lower
   * it for a suite whose every case costs real money (a billed web search,
   * say), where about 10 is the sensible size. A person can change it on
   * the suite's page (Suite settings) when the runner has a
   * `suiteSettings` store; theirs wins.
   */
  targetCases?: number;
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
   * False: never reuse an earlier test's answers, so every test of this
   * suite asks the model again, as if `fresh` were passed. For a suite
   * whose answer depends on when it's made, such as one that reads the
   * live web or puts today's date in the prompt: a reused answer would be
   * stale. Every retest pays in full. Default true.
   */
  reuseAnswers?: boolean;
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
  /**
   * False when blind rating doesn't fit the suite's cases: each answer is
   * one person's own (a verdict on their own data), or your app has no
   * rate page. The answer key then offers no **Rate blind**.
   */
  rateBlind?: boolean;
  /**
   * How a person should judge an answer, where it takes more than each
   * field's help: opened from the info button beside the answer key's
   * heading, as "How to judge an answer".
   * Without it, `labelHelp` shows there. For people only: it never reaches
   * the model, so it doesn't change the instructions hash.
   */
  answerGuide?: AnswerGuide;
  /**
   * What a person should look at to check this case's answer: shown with
   * the answer to confirm ("Look at: pay is below their floor"), each
   * note's `marks` highlighted wherever they appear in the input. Pick
   * them by rule from the case (a dealbreaker beside what it rules on),
   * never from the draft answer's own reasoning: that steers a person to
   * agree with it. When models' tests disagree, the answer key says so on
   * its own. For people only: it never reaches the model.
   *
   * @param input - The case's input, already checked against `input`.
   * @param answer - The answer being checked, or null without one.
   */
  lookAt?(input: Input, answer: Label | null): LookAt[];
  /**
   * One model's answer as a short line, shown beside that model's latest
   * test in the answer key ("“Get a full-time admin job in local
   * government”", or "Left as typed"), so a person can compare what
   * models wrote with the input and the answer. Shown below the answer,
   * so a person reads the answer first. Shown as given: quote the
   * model's own words yourself. For people only.
   *
   * @param output - What the model returned, as stored.
   * @returns The line, or null to show none for this output.
   */
  outputLine?(output: Output): string | null;
};

/** One thing to look at when checking an answer (`Suite.lookAt`). */
export type LookAt = {
  /** A short note: "pay is below their $70K floor". */
  note: string;
  /** Text to highlight in the case's input: "$55,000–$61,000". */
  marks?: string[];
};

/** How to judge a suite's answers: a lead-in, the points, and a note. */
export type AnswerGuide = {
  /** A short lead-in: "When you confirm a case, check:". */
  lead?: string;
  /** One point each; `term`, when given, comes first in bold. */
  points: { term?: string; text: string }[];
  /** Steps to follow in order (numbered), or points in any order. */
  ordered?: boolean;
  /** A closing note, shown quieter. */
  note?: string;
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
 * a list. "json": a structured value (a list of objects, a nested shape)
 * edited as JSON in a monospace box, checked against the suite's schema
 * when saved.
 */
export type FormField = {
  name: string;
  label: string;
  help: string;
  kind: "text" | "textarea" | "select" | "lines" | "json";
  /** For "select". */
  options?: readonly string[];
  /**
   * How each value reads to a person: a choice's options ("YES" → "Would
   * apply"), or "true" and "false" for a yes-or-no field. A JSON field
   * with these is edited as a choice between them.
   */
  optionLabels?: Readonly<Record<string, string>>;
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
  if (field.kind === "json")
    return v === undefined || v === null ? "" : JSON.stringify(v, null, 2);
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

/**
 * The injection suites that attack a suite: the ones whose base it is.
 * Their results belong with the base suite's, since both test the same
 * feature and one choice of model serves both.
 *
 * @param suites - Every registered suite.
 * @param baseKey - The base suite's key.
 */
export function injectionSuitesOf(
  suites: readonly AnySuite[],
  baseKey: string,
): (AnySuite & { base: AnySuite })[] {
  return suites.filter(
    (s): s is AnySuite & { base: AnySuite } =>
      isInjectionSuite(s) && s.base.key === baseKey,
  );
}

/** Where a zod issue sits, in plain words: "facts, item 2, name". */
function issuePath(path: readonly PropertyKey[]): string {
  return path
    .map((p) => (typeof p === "number" ? `item ${p + 1}` : String(p)))
    .join(", ");
}

/** Text as JSON, with a plain error naming what it was. */
function parseJson(text: string, what: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (e) {
    throw new Error(
      `${what} isn't valid JSON: ${e instanceof Error ? e.message : String(e)}`,
      { cause: e },
    );
  }
}

/** A value checked with a schema, with a plain error naming the first misfit. */
function fit<T>(value: unknown, schema: z.ZodType<T>, what: string): T {
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
  return fit(parseJson(text, what), schema, what);
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

/**
 * A form's values for a suite's fields, each read by its kind: text as it
 * is, "lines" as a list, "json" parsed (with a plain error naming the
 * field when it isn't valid JSON; empty reads as null). Pure.
 *
 * @param fields - The suite's input or answer fields.
 * @param form - The submitted form.
 */
export function valuesFromFields(
  fields: readonly FormField[],
  form: FormData,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.kind === "lines") out[f.name] = linesOf(form, f.name);
    else if (f.kind === "json") {
      const text = formText(form, f.name);
      out[f.name] = text ? parseJson(text, f.label) : null;
    } else out[f.name] = formText(form, f.name);
  }
  return out;
}

/**
 * A suite's `inputFromForm` from its fields, any kinds: reads each field
 * by kind (`valuesFromFields`) and checks the whole with the schema,
 * throwing a plain error that names the first part that doesn't fit.
 *
 * @param schema - The suite's input schema.
 * @param fields - The suite's input fields (`fields.input`).
 * @returns A form reader to use as the suite's `inputFromForm`.
 */
export function inputFromFields<T>(
  schema: z.ZodType<T>,
  fields: readonly FormField[],
): (form: FormData) => T {
  return (form) => fit(valuesFromFields(fields, form), schema, "Input");
}

/**
 * A suite's `labelFromForm` from its answer fields, like `inputFromFields`.
 *
 * @param schema - The suite's answer schema (`labelValue`).
 * @param fields - The suite's answer fields (`fields.label`).
 * @returns A form reader to use as the suite's `labelFromForm`.
 */
export function labelFromFields<T>(
  schema: z.ZodType<T>,
  fields: readonly FormField[],
): (form: FormData) => T {
  return (form) => fit(valuesFromFields(fields, form), schema, "Answer");
}

/**
 * The form field an answer editor submits its answer under, as JSON
 * (see `AnswerEditorProps`).
 */
export const ANSWER_JSON_FIELD = "answerJson";

/**
 * What an app's own answer editor gets, for answers plain fields can't
 * edit well (a list of facts with a category each, a verdict with
 * reasons). The editor is a client component that renders its own
 * controls and keeps the whole answer, as JSON, in a form field named
 * `name` (a hidden input). Register it in your wiring module's
 * `answerEditors`, keyed by suite; the copied answer key, "Add a case",
 * and blind rating use it in place of the suite's answer fields, and the
 * actions check what it submits against the suite's `labelValue`.
 */
export type AnswerEditorProps = {
  /** The form field to submit the answer under, as JSON. */
  name: string;
  /** Prefix for element ids, unique on the page. */
  idPrefix: string;
  /** The case's input, when there is one yet (null on "Add a case"). */
  input: unknown;
  /** The current answer, or null for a new one. */
  value: unknown;
  /** The suite's answer fields, for their labels and help. */
  fields: readonly FormField[];
};

/**
 * The answer a form submits for a suite: from an answer editor (JSON in
 * `ANSWER_JSON_FIELD`, checked against the suite's `labelValue`) when the
 * form has one, otherwise the suite's own `labelFromForm`. Throws a plain
 * error when the suite has neither, or the answer doesn't fit.
 *
 * @param suite - The suite the answer is for.
 * @param form - The submitted form.
 */
export function answerFromForm(suite: AnySuite, form: FormData): unknown {
  if (formText(form, ANSWER_JSON_FIELD))
    return readJson(form, ANSWER_JSON_FIELD, "Answer", suite.labelValue);
  if (suite.labelFromForm) return suite.labelFromForm(form);
  throw new Error("This suite has no answer form");
}
