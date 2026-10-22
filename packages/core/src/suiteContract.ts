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
};

/**
 * The top-level keys of an object schema, through refinements, optional,
 * nullable, and default wrappers; null for any other shape (a string, a
 * list).
 */
export function schemaKeys(schema: z.ZodTypeAny): string[] | null {
  let s: z.ZodTypeAny | undefined = schema;
  for (let i = 0; s && i < 10; i++) {
    // Trust boundary: zod's own definition object, read by its names.
    const def = s._def as Def;
    if (def.typeName === "ZodObject" && def.shape)
      return Object.keys(def.shape());
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
  const named = new Set(fields.map((f) => f.name));
  for (const k of keys ?? [])
    if (!named.has(k))
      out.push(`${suite}: ${side} field "${k}" has no label and help.`);
  return out;
}

/**
 * What's missing for people (and pages) to read a set of suites, in plain
 * sentences; empty when nothing is. Checks that suite keys are unique;
 * every top-level field of each suite's input and answer has a `fields`
 * entry with a label and help; every check has a description; and starter
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
