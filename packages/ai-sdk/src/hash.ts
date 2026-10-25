import { createHash } from "node:crypto";
import { zodSchema } from "ai";
import type { z } from "zod";

/**
 * A short hash of an operation's fixed instructions: its system text and its prompt templates, filled with placeholders
 * instead of anyone's data, so only an edit to the wording changes it.
 */
export function promptHash(...parts: string[]): string {
  return createHash("sha256")
    .update(parts.join("\n\u0000\n"))
    .digest("hex")
    .slice(0, 8);
}

/** A placeholder for a prompt template's per-call value, written as `{name}`. */
export const slot = (name: string) => `{${name}}`;

/**
 * Everything a model is told besides its settings, as one hash: system text
 * and prompt templates, and also what it reads from the output schema and
 * tools (field names and descriptions, tool descriptions). Editing a
 * `.describe()` changes the answer as surely as editing the system text, so
 * it must mark older tests out of date too. Pass the result to the runner
 * as the operation's promptVersion.
 *
 * @example
 * ```ts
 * export const triageVersion = instructionsHash({
 *   texts: [SYSTEM, prompt({ subject: slot("subject"), body: slot("body") })],
 *   schemas: [outputSchema],
 * });
 * ```
 */
export function instructionsHash(parts: InstructionParts): string {
  return promptHash(...instructionParts(parts));
}

/** What an operation tells its model: the parts `instructionsHash` takes. */
export type InstructionParts = {
  texts: string[];
  schemas?: z.ZodTypeAny[];
  tools?: Record<string, { description?: string; inputSchema: z.ZodTypeAny }>;
};

/**
 * The texts `instructionsHash` hashes, in order: the texts, each schema as
 * JSON (field names and descriptions), and each tool's name, description,
 * and input schema. Pass them to the runner's `instructionTexts`, so the
 * suite page warns when a case was copied into the instructions.
 *
 * @param parts - The same parts you pass to `instructionsHash`.
 * @returns Every text the model is told, besides per-call data.
 * @example
 * ```ts
 * const TRIAGE = { texts: [SYSTEM], schemas: [outputSchema] };
 * export const triageVersion = instructionsHash(TRIAGE);
 * export const triageTexts = instructionParts(TRIAGE);
 * ```
 */
export function instructionParts(parts: InstructionParts): string[] {
  const shape = (schema: z.ZodTypeAny) =>
    JSON.stringify(zodSchema(schema).jsonSchema);
  return [
    ...parts.texts,
    ...(parts.schemas ?? []).map(shape),
    ...Object.entries(parts.tools ?? {})
      .sort(([a], [b]) => a.localeCompare(b))
      .map(
        ([name, t]) =>
          `${name}: ${t.description ?? ""} ${shape(t.inputSchema)}`,
      ),
  ];
}
