// Signing the ready-made suites' starter cases, so they ship confirmed
// ("Author reviewed" or "Expert reviewed") instead of pending.
//
//   node scripts/review-starters.mjs sheet crisis_risk > crisis.tsv
//     Lists every starter case: its key, a blank "confirm" column, its
//     answer, its title, and its whole input. Open it in a spreadsheet and type "yes" in
//     "confirm" for each case whose answer you'd stand behind. Leave the
//     rest blank; to change an answer, edit the suite's cases file first
//     and make a new sheet.
//
//   node scripts/review-starters.mjs sign crisis_risk crisis.tsv \
//     --level AUTHOR --by "Your Name" --credential "suite author" \
//     [--at 2026-11-14]
//     Writes the confirmed rows to the suite's reviews file, replacing
//     your earlier reviews and keeping everyone else's. Run `npm run
//     build` first: it reads the built package.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = (p) =>
  pathToFileURL(join(root, "packages", "core", "dist", p)).href;

/** Each ready-made suite: how to build it and where its reviews live. */
export const SUITES = {
  crisis_risk: {
    factory: "crisisRiskSuite",
    reviews: "CRISIS_REVIEWS",
    file: "packages/core/src/suites/crisisRiskReviews.ts",
  },
  hopelessness: {
    factory: "hopelessnessSuite",
    reviews: "HOPELESSNESS_REVIEWS",
    file: "packages/core/src/suites/hopelessnessReviews.ts",
  },
};

const COLUMNS = ["case", "confirm", "answer", "title", "input"];

/** A cell on one line: tabs and line breaks would split the sheet. */
const cell = (v) => String(v).replace(/[\t\r\n]+/g, " ");

/**
 * A review sheet as tab-separated text, with a header row.
 *
 * @param rows - From `reviewSheet`.
 */
export function toTsv(rows) {
  const lines = rows.map((r) =>
    [r.case, "", r.answer, r.title, r.input].map(cell).join("\t"),
  );
  return [COLUMNS.join("\t"), ...lines].join("\n") + "\n";
}

/**
 * Reads a marked sheet back: each row's case and mark. Columns are found
 * by their header, so a spreadsheet that reorders them still works.
 *
 * @param text - The sheet, tab-separated, with its header row.
 */
export function fromTsv(text) {
  const [head, ...lines] = text.split(/\r?\n/).filter((l) => l.trim());
  const names = (head ?? "").split("\t").map((h) => h.trim().toLowerCase());
  const at = (name) => {
    const i = names.indexOf(name);
    if (i < 0) throw new Error(`The sheet has no "${name}" column.`);
    return i;
  };
  const key = at("case");
  const mark = at("confirm");
  // The answer the reviewer saw, so signing refuses one changed since.
  const answer = names.indexOf("answer");
  return lines.map((l) => {
    const cells = l.split("\t");
    const row = { case: (cells[key] ?? "").trim(), confirm: cells[mark] ?? "" };
    return answer < 0 ? row : { ...row, answer: cells[answer] ?? "" };
  });
}

/**
 * The reviews file with a new list, keeping its comment and import.
 *
 * @param source - The file as it is.
 * @param name - The exported list's name.
 * @param reviews - The reviews it should hold.
 */
export function withReviews(source, name, reviews) {
  const head = `export const ${name}: readonly ShippedReview[] =`;
  const i = source.indexOf(head);
  if (i < 0) throw new Error(`No "${head}" in the reviews file.`);
  return `${source.slice(0, i)}${head} ${JSON.stringify(reviews, null, 2)};\n`;
}

/** --name value pairs after the positional arguments. */
function flags(args) {
  const out = {};
  for (let i = 0; i < args.length; i += 2) {
    const name = args[i];
    if (!name?.startsWith("--") || args[i + 1] === undefined)
      throw new Error(`Expected --name value, got "${name}".`);
    out[name.slice(2)] = args[i + 1];
  }
  return out;
}

async function suiteOf(key) {
  const entry = SUITES[key];
  if (!entry)
    throw new Error(
      `Unknown suite "${key}"; one of ${Object.keys(SUITES).join(", ")}.`,
    );
  const suites = await import(dist("suites/index.js"));
  const suite = suites[entry.factory]({
    operation: key,
    run: async () => {
      throw new Error("Not run while signing.");
    },
  });
  return { suite, entry, existing: suites[entry.reviews] };
}

async function main([command, key, ...rest]) {
  const core = await import(dist("index.js"));
  if (command === "sheet") {
    const { suite } = await suiteOf(key);
    process.stdout.write(toTsv(core.reviewSheet(suite)));
    return;
  }
  if (command === "sign") {
    const [file, ...more] = rest;
    if (!file) throw new Error("Name the marked sheet to sign.");
    const f = flags(more);
    const level = (f.level ?? "").toUpperCase();
    if (level !== "AUTHOR" && level !== "EXPERT")
      throw new Error("--level is AUTHOR or EXPERT.");
    const reviewer = {
      level,
      by: f.by ?? "",
      credential: f.credential ?? "",
      at: f.at ?? new Date().toISOString().slice(0, 10),
    };
    const { suite, entry, existing } = await suiteOf(key);
    const next = core.reviewsFromSheet(
      suite,
      fromTsv(readFileSync(file, "utf8")),
      reviewer,
    );
    // Reviews come from the build; refuse one older than the source file.
    const path = join(root, entry.file);
    const source = readFileSync(path, "utf8");
    const inSource = (source.match(/\bcase: "/g) ?? []).length;
    if (inSource !== existing.length)
      throw new Error(
        `${entry.file} has ${inSource} reviews but the build has ${existing.length}; run npm run build first.`,
      );
    const merged = core.mergeReviews(existing, next, reviewer);
    const problems = core.reviewProblems({ ...suite, reviews: merged });
    if (problems.length) throw new Error(problems.join("\n"));
    const prettier = await import("prettier");
    const text = withReviews(source, entry.reviews, merged);
    const options = (await prettier.resolveConfig(path)) ?? {};
    writeFileSync(
      path,
      await prettier.format(text, { ...options, filepath: path }),
    );
    console.error(
      `${next.length} of ${suite.starter?.length ?? 0} ${key} cases signed by ${reviewer.by.trim()} (${level.toLowerCase()}); ${merged.length} reviews in ${entry.file}.`,
    );
    return;
  }
  throw new Error(
    "Usage: review-starters.mjs sheet <suite> | sign <suite> <sheet.tsv> --level AUTHOR|EXPERT --by <name> --credential <text> [--at YYYY-MM-DD]",
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  main(process.argv.slice(2)).catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
