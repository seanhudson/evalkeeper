// Fails when the docs name something the code no longer has: a button or
// label in bold (**Rescore tests**) that no screen shows, or a code name
// in backticks (`suiteTodos`) that no file defines. Renames in the code
// left pages describing the old screens (0.19's verdict words, "Show all
// topics"), so this catches the next one in the same pull request.
// Runs in `npm run check`.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/** Pages that describe the past or the future, not today's code. */
export const SKIP_PAGES = new Set([
  "docs/lessons.md",
  "docs/plan-add-on.md",
  "docs/roadmap.md",
]);

/**
 * Bold text that isn't a label on a screen: callout titles, list leads,
 * and values a label shows. Add one here only when it's not a label.
 */
export const NOT_LABELS = new Set([
  "A model drafted it",
  "A price for each model",
  "Adapters",
  "Add both to the enum",
  "Alerts and counts",
  "An import",
  "Costs",
  "Do this",
  "Favors cost",
  "Hash every instruction a model gets",
  "How it's made",
  "In a chat",
  "List what it holds",
  "Marking ratings looked at",
  "Node 20 or later",
  "Schedule the weekly check",
  "Seven screens",
  "Start here",
  "The Feedback page",
  "Turning ratings into cases",
  "TypeScript on Node 20 or later",
  "Upgrading",
  "Using it",
  "You asked for more",
]);

/**
 * Words the screens used to say, and what they say now. When you rename
 * something on a screen, add the old words here, so no page keeps them.
 */
export const RETIRED = new Map([
  ["about as accurate", "similar"],
  ["too few cases to tell", "can't tell"],
  ["costliest live model", "nothing: the hub has no cost cards since 0.19"],
  ["Show all topics", "Every topic and its cases"],
  ["Draft N more cases", "Describe them, then Draft them"],
]);

/** Code names from other projects (TypeScript, the AI SDK). */
export const OUTSIDE_NAMES = new Set([
  "exactOptionalPropertyTypes",
  "MockLanguageModelV3",
  "noUncheckedIndexedAccess",
]);

/**
 * The code's text as a screen would show it: JSX entities decoded, a
 * plural ternary as its plural ("{n === 1 ? "case" : "cases"}" reads
 * "cases"), `n(count, "answer")` as "N answers", and whitespace folded.
 *
 * @param text - Source files joined.
 */
export function asShown(text) {
  return text
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\$?\{[^{}?]*\?\s*"[^"]*"\s*:\s*"([^"]*)"\s*\}/g, "$1")
    .replace(/\$\{n\([^,()]+,\s*"([^"]+)",\s*"([^"]+)"\)\}/g, "N $2")
    .replace(/\$\{n\([^,()]+,\s*"([^"]+)"\)\}/g, "N $1s")
    .replace(/\{" "\}/g, " ")
    .replace(/\s+/g, " ");
}

/**
 * A pattern for a bold label: N stands for any count, X for any name,
 * and "check" for any check's name.
 *
 * @param label - The text between the asterisks.
 */
export function labelPattern(label) {
  const escaped = label
    .replace(/\s+/g, " ")
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\bN\b/g, "\\S+")
    .replace(/\bX\b/g, ".{1,40}?")
    .replace(/"check"/g, '"?\\S.{0,40}?"?');
  return new RegExp(escaped);
}

/**
 * The bold labels and code names a page mentions, outside code blocks.
 * Bold text ending in punctuation, starting lowercase, or longer than
 * seven words is prose emphasis, not a label.
 *
 * @param markdown - One page.
 */
export function mentions(markdown) {
  const text = markdown.replace(/```[\s\S]*?```/g, "");
  const labels = [];
  for (const m of text.matchAll(/\*\*([^*\n]+?)\*\*/g)) {
    const s = (m[1] ?? "").trim();
    if (/[.:,;!?)]$/.test(s) || !/^[A-Z]/.test(s)) continue;
    if (s.split(/\s+/).length > 7) continue;
    labels.push(s);
  }
  const names = [];
  for (const m of text.matchAll(
    /`([A-Za-z_$][\w$]*(?:\.[\w$]+)*)(?:\(\))?`/g,
  )) {
    const s = m[1] ?? "";
    // camelCase or PascalCase with an inner capital: a code name, not a word.
    if (/[a-z][A-Z]|^[A-Z][a-z]+[A-Z]/.test(s)) names.push(s);
  }
  return { labels, names };
}

/**
 * What the docs mention that the code doesn't have.
 *
 * @param pages - Each page's path and text.
 * @param source - The code's text, through `asShown`.
 */
export function missing(pages, source) {
  const problems = [];
  for (const { path, text } of pages) {
    if (SKIP_PAGES.has(path)) continue;
    const prose = text.replace(/```[\s\S]*?```/g, "").replace(/\s+/g, " ");
    for (const [old, now] of RETIRED)
      if (prose.toLowerCase().includes(old.toLowerCase()))
        problems.push(`${path}: "${old}" is retired; the screens say ${now}`);
    const { labels, names } = mentions(text);
    for (const label of new Set(labels))
      if (!NOT_LABELS.has(label) && !labelPattern(label).test(source))
        problems.push(`${path}: **${label}** isn't on any screen`);
    for (const name of new Set(names)) {
      const last = name.split(".").pop() ?? name;
      if (!OUTSIDE_NAMES.has(name) && !source.includes(last))
        problems.push(`${path}: \`${name}\` isn't in the code`);
    }
  }
  return problems;
}

const SOURCE_DIRS = ["packages/core/src", "examples/next", "scripts"];

function sourceFiles(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) {
      if (!["node_modules", ".next", "dist", "test-results"].includes(f))
        sourceFiles(p, out);
    } else if (/\.(tsx?|mjs|prisma)$/.test(f) && !/\.test\./.test(f)) {
      out.push(p);
    }
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(fileURLToPath(import.meta.url), "../..");
  const source = asShown(
    SOURCE_DIRS.flatMap((d) => sourceFiles(join(root, d)))
      .map((p) => readFileSync(p, "utf8"))
      .join("\n"),
  );
  const paths = [
    "README.md",
    "AGENTS.md",
    ...readdirSync(join(root, "docs"))
      .filter((f) => f.endsWith(".md"))
      .map((f) => `docs/${f}`),
  ];
  const pages = paths.map((p) => ({
    path: relative(root, join(root, p)),
    text: readFileSync(join(root, p), "utf8"),
  }));
  const problems = missing(pages, source);
  if (problems.length) {
    console.error(
      `Docs name things the code doesn't have (${problems.length}). Update the page, or, if it isn't a label, add it to NOT_LABELS in scripts/docs-names.mjs:\n${problems.join("\n")}`,
    );
    process.exit(1);
  }
  console.log(`Docs names check passed: ${pages.length} pages.`);
}
