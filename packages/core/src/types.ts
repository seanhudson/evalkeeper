import type { z } from "zod";
import type { ReasoningEffort } from "./models";

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
  /** For matching checks: which expected item matched which output, and why. */
  matches?: { expected: string; actual: string; why: string }[] | undefined;
  /** "meaning": a judge model matched them; "words": shared words did. */
  matchedBy?: "meaning" | "words" | undefined;
  /**
   * Partial credit: of the parts this answer should have (e.g. expected
   * items), how many it got right. The headline score sums these.
   */
  units?: { right: number; total: number } | undefined;
};

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

export const FAVOR_TEXT: Record<SuitePriority["favor"], string> = {
  speed:
    "speed: someone waits on this, so a model that scores as well and answers clearly faster is worth switching to, and so is one about as accurate (within 10 points) in half the time",
  cost: "cost: this runs in the background, often, so a model that scores as well and is clearly cheaper is worth switching to, and so is one about as accurate (within 10 points) at half the cost",
  quality:
    "quality: people read and act on this, so only clearly better accuracy or fewer serious mistakes is worth switching for",
};

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
   * Drafts new cases aimed at what the answer key is missing, for a person
   * to review (they arrive with PENDING answers).
   */
  draftMore?(args: {
    existing: { input: Input; tags: string[] }[];
    count: number;
    focus: string | null;
  }): Promise<{ input: Input; label: Label; tags: string[]; note: string }[]>;
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
  /** A short line naming the case in lists. */
  title(input: Input): string;
  /** Fixture suites: the whole input, readable, for reviewing a case. */
  describe?(input: Input): string;
  /** Fixture suites: what the expected answer's fields mean. */
  labelHelp?: string;
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
