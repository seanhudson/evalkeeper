// Fails when a tracked file mentions something that must never ship in
// this repo: names of private projects and people's email addresses.
// Examples use made-up names only. The banned words are stored as hashes,
// so this file doesn't publish the very names it keeps out.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const BANNED = new Set([
  "dbc737adcf55c4e6",
  "5888e41be672b504",
  "d05b118663c888a2",
  "02aac7d8ea090e70",
  "bc74d4c225d5b7d9",
  "9e66a118b9a0fb8c",
  "cf07a92555a6eb89",
]);
const hash = (word) =>
  createHash("sha256").update(word).digest("hex").slice(0, 16);

/** Addresses that are fine to publish. */
const ALLOWED_EMAIL = /@(users\.noreply\.github\.com|anthropic\.com|example\.(com|org))$/i;
const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g;

const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard"],
  { encoding: "utf8" }
)
  .split("\n")
  .filter((f) => f && !/\.(png|jpe?g|gif|ico|webp|db)$/.test(f));

const problems = [];
for (const file of files) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  text.split("\n").forEach((line, i) => {
    const where = `${file}:${i + 1}`;
    // Words, and each pair run together ("data base" as "database").
    const words = line.toLowerCase().match(/[a-z_]+/g) ?? [];
    const candidates = [
      ...words,
      ...words.slice(1).map((w, j) => words[j] + w),
    ];
    if (candidates.some((w) => BANNED.has(hash(w))))
      problems.push(`${where}: a private name`);
    for (const email of line.match(EMAIL) ?? [])
      if (!ALLOWED_EMAIL.test(email) && !/\.(ts|js|json|png)$/.test(email))
        problems.push(`${where}: an email address (${email})`);
  });
}
if (problems.length) {
  console.error(
    `Scrub check failed (${problems.length}):\n${problems.join("\n")}`
  );
  process.exit(1);
}
console.log(`Scrub check passed: ${files.length} files.`);
