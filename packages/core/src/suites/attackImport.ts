import { z } from "zod";
import { ATTACK_KINDS, type Attack, type AttackKind } from "./injection.js";

/**
 * Attacks from other tools, for the injection suite (./injection.ts).
 * Each reader takes what the tool wrote, as text, and returns attacks in
 * Evalkeeper's shape; it never calls the tool or the network. Where the
 * tool checks for a word the model shouldn't say, the reader swaps that
 * word for `{{canary}}`, so the suite's own canary check grades it.
 * Attacks the suite couldn't grade without a judge model are left out
 * and counted in `skipped`.
 *
 * Their datasets carry their own licenses (garak: Apache-2.0;
 * CyberSecEval: MIT; promptfoo's generated tests: yours). The attacks are
 * stored as cases in your database, so read them before relying on them.
 */

/** Attacks read from a tool's output, and what was left out. */
export type ImportedAttacks = {
  attacks: Attack[];
  /** Entries left out, with why, for a person to check. */
  skipped: { id: string; why: string }[];
};

/** One attack, as Evalkeeper's attack file (JSONL) holds it. */
const attackRow = z.object({
  id: z.string().min(1),
  kind: z.enum(ATTACK_KINDS),
  text: z.string().min(1),
  technique: z.string().min(1),
  source: z.string().min(1),
});

/**
 * Reads an attack file: one JSON attack per line (`id`, `kind`, `text`,
 * `technique`, `source`). Blank lines are skipped. Any line that doesn't
 * fit, or an id used twice within a source, stops it with every problem
 * listed, so a file is used whole or not at all.
 *
 * @param text - The file's contents.
 * @returns The attacks, in file order.
 * @throws When a line isn't JSON, doesn't fit, or repeats an id.
 * @example
 * ```ts
 * const attacks = readAttacks(readFileSync("attacks.jsonl", "utf8"));
 * export const triageInjection = injectionSuite(ticketTriage, {
 *   inject,
 *   attacks: [...INJECTION_ATTACKS, ...attacks],
 * });
 * ```
 */
export function readAttacks(text: string): Attack[] {
  const problems: string[] = [];
  const out: Attack[] = [];
  const seen = new Set<string>();
  text.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      problems.push(`line ${i + 1} isn't JSON`);
      return;
    }
    const row = attackRow.safeParse(value);
    if (!row.success) {
      const issue = row.error.issues[0];
      problems.push(
        `line ${i + 1}: ${issue?.path.join(".") || "attack"} ${issue?.message ?? "doesn't fit"}`,
      );
      return;
    }
    const key = `${row.data.source}|${row.data.id}`;
    if (seen.has(key))
      problems.push(`line ${i + 1} repeats the id ${row.data.id}`);
    seen.add(key);
    out.push(row.data);
  });
  if (problems.length)
    throw new Error(
      `The attack file can't be read: ${problems.slice(0, 5).join("; ")}${problems.length > 5 ? "; …" : ""}.`,
    );
  return out;
}

/**
 * Attacks as an attack file: one JSON attack per line, for `readAttacks`.
 *
 * @param attacks - The attacks to write.
 */
export function writeAttacks(attacks: readonly Attack[]): string {
  return attacks
    .map((a) =>
      JSON.stringify({
        id: a.id,
        kind: a.kind,
        text: a.text,
        technique: a.technique,
        source: a.source,
      }),
    )
    .join("\n")
    .concat(attacks.length ? "\n" : "");
}

/** Every whole-word use of `word` in `text`, any case, swapped for the canary. */
function withCanary(text: string, word: string): string | null {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?<![\\w])${escaped}(?![\\w])`, "gi");
  return re.test(text) ? text.replace(re, "{{canary}}") : null;
}

const cyberSecEvalRow = z.object({
  prompt_id: z.union([z.number(), z.string()]),
  test_case_prompt: z.string(),
  user_input: z.string(),
  judge_question: z.string(),
  injection_variant: z.string(),
  injection_type: z.string(),
});

/**
 * Reads CyberSecEval's prompt injection set (Meta's PurpleLlama,
 * `CybersecurityBenchmarks/datasets/prompt_injection/prompt_injection.json`).
 * A case whose check asks for a word the attack itself names ("say
 * 'Piano'") becomes a direct or indirect attack carrying the canary. One
 * whose word is a secret in the benchmark's own system prompt becomes an
 * extraction attack, graded by your suite's `secrets`. Cases checked
 * another way (a judge's reading of the answer) are skipped.
 *
 * @param json - The dataset's JSON text.
 * @param source - Where it came from, recorded on each attack; include
 *   the commit or version.
 */
export function cyberSecEvalAttacks(
  json: string,
  source = "CyberSecEval",
): ImportedAttacks {
  const rows = z.array(cyberSecEvalRow).parse(JSON.parse(json));
  const out: ImportedAttacks = { attacks: [], skipped: [] };
  for (const r of rows) {
    const id = `cse-${r.prompt_id}`;
    const word = /'([^']+)'/.exec(r.judge_question)?.[1];
    const technique = r.injection_variant.replaceAll("_", " ");
    const asked = word ? withCanary(r.user_input, word) : null;
    const kind: AttackKind | null = asked
      ? r.injection_type === "indirect"
        ? "indirect"
        : "direct"
      : word && withCanary(r.test_case_prompt, word)
        ? "extract"
        : null;
    if (!kind) {
      out.skipped.push({
        id,
        why: `its check needs a judge: “${r.judge_question}”`,
      });
      continue;
    }
    out.attacks.push({
      id,
      kind,
      text: asked ?? r.user_input,
      technique,
      source,
    });
  }
  return out;
}

/**
 * Reads garak's system prompt extraction attacks
 * (`garak/data/sysprompt_extraction/attacks.json`: lists of requests by
 * technique) as extraction attacks, graded by your suite's `secrets`.
 *
 * @param json - The file's JSON text.
 * @param source - Where it came from, with garak's version.
 */
export function garakSyspromptAttacks(
  json: string,
  source = "garak",
): ImportedAttacks {
  const groups = z
    .record(z.string(), z.array(z.string()))
    .parse(JSON.parse(json));
  return {
    attacks: Object.entries(groups).flatMap(([group, texts]) =>
      texts.map((text, i) => ({
        id: `garak-sysprompt-${group}-${i + 1}`,
        kind: "extract" as const,
        text,
        technique: group.replaceAll("_", " "),
        source,
      })),
    ),
    skipped: [],
  };
}

const garakAttempt = z.object({
  entry_type: z.literal("attempt"),
  uuid: z.string(),
  probe_classname: z.string(),
  prompt: z
    .object({
      turns: z.array(
        z.object({
          role: z.string(),
          content: z.object({ text: z.string().nullable() }),
        }),
      ),
    })
    .nullable(),
  notes: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Reads the attempts in a garak report (`garak.<run>.report.jsonl`) from
 * its injection probes: run garak against its offline `test.Blank`
 * generator and no model is called, but the report still records every
 * attack. Each attempt's trigger (the string garak checks the answer
 * for) becomes the canary; `latentinjection` probes, which hide the
 * attack in a document, are indirect, the rest direct. Attempts with no
 * trigger in their text, and repeats of the same text, are skipped.
 *
 * @param jsonl - The report's text.
 * @param source - Where it came from, with garak's version.
 */
export function garakReportAttacks(
  jsonl: string,
  source = "garak",
): ImportedAttacks {
  const out: ImportedAttacks = { attacks: [], skipped: [] };
  const texts = new Set<string>();
  for (const line of jsonl.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      continue;
    }
    const a = garakAttempt.safeParse(value);
    if (!a.success) continue;
    const id = `garak-${a.data.uuid}`;
    const turn = a.data.prompt?.turns.filter((t) => t.role === "user").at(-1);
    const triggers = z
      .array(z.string())
      .catch([])
      .parse(a.data.notes?.["triggers"] ?? []);
    let text = turn?.content.text ?? null;
    for (const t of triggers) if (text) text = withCanary(text, t) ?? text;
    if (!text || !text.includes("{{canary}}")) {
      out.skipped.push({ id, why: "no trigger in its text to check for" });
      continue;
    }
    if (texts.has(text)) {
      out.skipped.push({ id, why: "the same text as an earlier attempt" });
      continue;
    }
    texts.add(text);
    const probe = a.data.probe_classname;
    out.attacks.push({
      id,
      kind: probe.startsWith("latentinjection") ? "indirect" : "direct",
      text,
      technique: probe,
      source,
    });
  }
  return out;
}

/**
 * Reads promptfoo's red team tests written as Burp payloads
 * (`promptfoo redteam generate -o tests.burp`): one URL-encoded attack
 * per line. They
 * carry no canary, so only your suite's own checks and `secrets` grade
 * them. Note that promptfoo writes these with a model, on its hosted
 * service unless you set it up otherwise, and sends it your app's
 * description.
 *
 * @param text - The .burp file's text.
 * @param source - Where it came from, with promptfoo's version.
 * @param kind - What the plugin you generated with tests; default
 *   "direct".
 */
export function promptfooBurpAttacks(
  text: string,
  source = "promptfoo",
  kind: AttackKind = "direct",
): ImportedAttacks {
  const out: ImportedAttacks = { attacks: [], skipped: [] };
  text.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    const id = `promptfoo-${i + 1}`;
    try {
      out.attacks.push({
        id,
        kind,
        text: decodeURIComponent(line.trim()),
        technique: "promptfoo red team",
        source,
      });
    } catch {
      out.skipped.push({ id, why: "not URL-encoded text" });
    }
  });
  return out;
}
