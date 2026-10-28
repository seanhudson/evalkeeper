/**
 * Finds cases whose text appears in a feature's instructions. A case
 * copied into the instructions as an example gets graded on an answer the
 * model was handed, so its score rises without the model getting better.
 * Pure.
 */

/** A stretch this long (after evening out) counts, even inside a longer text. */
export const IN_INSTRUCTIONS_MIN_CHARS = 20;

/** A whole case text this long counts when all of it appears. */
export const IN_INSTRUCTIONS_MIN_WHOLE = 12;

/** One case found in the instructions, with the words that matched. */
export type CaseInInstructions = {
  caseId: string;
  title: string;
  /** The matching words, evened out (lowercase, no punctuation). */
  found: string;
};

/**
 * Lowercase, apostrophes (straight or curly) dropped, and anything but
 * letters and digits turned to single spaces, so "The Broncos are
 * hopeless!" and "the broncos are hopeless" read the same.
 */
function evenOut(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’']/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Every string in a value, however deep, in order. */
function stringsIn(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(stringsIn);
  if (value && typeof value === "object")
    return Object.values(value).flatMap(stringsIn);
  return [];
}

/** The longest run of whole words from `text` that appears in `within`. */
function longestRun(text: string, within: string): string {
  const words = text.split(" ");
  let best = "";
  for (let i = 0; i < words.length; i++) {
    let run = "";
    for (let j = i; j < words.length; j++) {
      const next = run ? `${run} ${words[j] ?? ""}` : (words[j] ?? "");
      if (!` ${within} `.includes(` ${next} `)) break;
      run = next;
    }
    if (run.length > best.length) best = run;
  }
  return best;
}

/**
 * The cases whose input text appears in the instructions: all of one of
 * its texts (when at least `minWhole` characters), or a run of whole words
 * at least `minChars` long, after evening out case and punctuation. Use it
 * to warn, not to fail: an example may belong in the instructions, and
 * then the case should be rewritten or retired.
 *
 * @param cases - Each case's id, title, and input.
 * @param instructions - Everything the model is told: system text, prompt
 *   templates, schema and tool descriptions (`instructionParts` in
 *   `@crowandraven/evalkeeper/ai-sdk` gives these).
 * @param opts - Other lengths than `IN_INSTRUCTIONS_MIN_CHARS` and
 *   `IN_INSTRUCTIONS_MIN_WHOLE`.
 * @returns The cases found, each with its longest matching words.
 * @example
 * ```ts
 * casesInInstructions(
 *   [{ id: "c1", title: "Broncos", input: { message: "the Broncos are hopeless" } }],
 *   ["Not hopeless: “The Broncos are hopeless!” is about a team."],
 * ); // [{ caseId: "c1", title: "Broncos", found: "the broncos are hopeless" }]
 * ```
 */
export function casesInInstructions(
  cases: readonly { id: string; title: string; input: unknown }[],
  instructions: readonly string[],
  opts: { minChars?: number; minWhole?: number } = {},
): CaseInInstructions[] {
  const minChars = opts.minChars ?? IN_INSTRUCTIONS_MIN_CHARS;
  const minWhole = opts.minWhole ?? IN_INSTRUCTIONS_MIN_WHOLE;
  const within = instructions.map(evenOut).join(" \u0000 ");
  if (!within) return [];
  const found: CaseInInstructions[] = [];
  for (const c of cases) {
    let best = "";
    for (const raw of stringsIn(c.input)) {
      const text = evenOut(raw);
      if (!text) continue;
      const run = longestRun(text, within);
      const counts =
        run.length >= minChars || (run === text && run.length >= minWhole);
      if (counts && run.length > best.length) best = run;
    }
    if (best) found.push({ caseId: c.id, title: c.title, found: best });
  }
  return found;
}
