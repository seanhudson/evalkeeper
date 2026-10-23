import type { z } from "zod";
import type { AnySuite, FormField } from "./types.js";

/** A field help shorter than this says nothing a label doesn't. */
const MIN_HELP = 10;

/** A zod schema's definition, read by name so any copy of zod works. */
type Def = {
  typeName?: string;
  shape?: () => Record<string, unknown>;
  schema?: z.ZodTypeAny;
  innerType?: z.ZodTypeAny;
  /** A union's options (a plain union's, or a discriminated one's). */
  options?: readonly z.ZodTypeAny[];
};

/**
 * The top-level keys of an object schema, through refinements, optional,
 * nullable, and default wrappers. For a union (`z.union` or
 * `z.discriminatedUnion`), every key that appears in any of its object
 * options, in the order they first appear, so one `fields` list covers
 * them all. Null for any other shape (a string, a list, a union with no
 * object option).
 *
 * @param schema - A suite's input or answer schema.
 */
export function schemaKeys(schema: z.ZodTypeAny): string[] | null {
  return keysOf(schema, 0);
}

/** Wrappers and unions deeper than this are read as an unknown shape. */
const MAX_DEPTH = 10;

function keysOf(schema: z.ZodTypeAny, depth: number): string[] | null {
  let s: z.ZodTypeAny | undefined = schema;
  for (let i = depth; s && i < MAX_DEPTH; i++) {
    // Trust boundary: zod's own definition object, read by its names.
    const def = s._def as Def;
    if (def.typeName === "ZodObject" && def.shape)
      return Object.keys(def.shape());
    if (
      (def.typeName === "ZodUnion" ||
        def.typeName === "ZodDiscriminatedUnion") &&
      def.options
    )
      return unionKeys(def.options, i + 1);
    s =
      def.typeName === "ZodEffects"
        ? def.schema
        : def.typeName === "ZodOptional" ||
            def.typeName === "ZodNullable" ||
            def.typeName === "ZodDefault"
          ? def.innerType
          : undefined;
  }
  return null;
}

/** Every key of a union's object options; null when none is an object. */
function unionKeys(
  options: readonly z.ZodTypeAny[],
  depth: number,
): string[] | null {
  const keys = new Set<string>();
  let known = false;
  for (const o of options) {
    const k = keysOf(o, depth);
    if (k === null) continue;
    known = true;
    for (const key of k) keys.add(key);
  }
  return known ? [...keys] : null;
}

function fieldProblems(
  suite: string,
  side: "input" | "label",
  keys: string[] | null,
  fields: FormField[],
): string[] {
  const out: string[] = [];
  for (const f of fields) {
    if (!f.label.trim())
      out.push(`${suite}: ${side} field "${f.name}" has no label.`);
    if (f.help.trim().length < MIN_HELP)
      out.push(
        `${suite}: ${side} field "${f.name}" needs help that says what it means.`,
      );
  }
  if (keys === null) return out;
  const named = new Set(fields.map((f) => f.name));
  for (const k of keys)
    if (!named.has(k))
      out.push(`${suite}: ${side} field "${k}" has no label and help.`);
  // Help left behind after a rename, or for a field that was removed.
  const has = new Set(keys);
  const what = side === "input" ? "the input" : "the answer";
  for (const f of fields)
    if (!has.has(f.name))
      out.push(
        `${suite}: ${side} field "${f.name}" has help but ${what} has no such field.`,
      );
  return out;
}

/**
 * What's missing for people (and pages) to read a set of suites, in plain
 * sentences; empty when nothing is. Checks that suite keys are unique;
 * every top-level field of each suite's input and answer (every option's,
 * for a union) has a `fields` entry with a label and help, and no entry
 * names a field the schema doesn't have; every check has a description; and starter
 * cases fit the suite's own schemas. Pure; `describeSuiteContract` runs it
 * as tests.
 */
export function suiteContractProblems(suites: readonly AnySuite[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const suite of suites) {
    const name = suite.key;
    if (seen.has(name)) out.push(`${name}: another suite has the same key.`);
    seen.add(name);
    out.push(
      ...fieldProblems(
        name,
        "input",
        schemaKeys(suite.input),
        suite.fields?.input ?? [],
      ),
      ...fieldProblems(
        name,
        "label",
        schemaKeys(suite.labelValue),
        suite.fields?.label ?? [],
      ),
    );
    for (const c of suite.checks)
      if (!c.description.trim())
        out.push(`${name}: check "${c.key}" has no description.`);
    (suite.starter ?? []).forEach((s, i) => {
      if (!suite.input.safeParse(s.input).success)
        out.push(`${name}: starter ${i + 1}'s input doesn't fit the schema.`);
      if (!suite.labelValue.safeParse(s.label).success)
        out.push(`${name}: starter ${i + 1}'s answer doesn't fit the schema.`);
    });
  }
  return out;
}
