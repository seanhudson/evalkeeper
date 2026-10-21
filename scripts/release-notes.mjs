// Writes a version's GitHub release notes from CHANGELOG.md: its section
// there, with the install line and the three packages on npm. The release
// workflow runs it for each version tag, so the release page keeps up with
// the changelog instead of being written by hand.
//
//   node scripts/release-notes.mjs 0.4.1 > notes.md
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const PACKAGES = [
  "@crowandraven/evalkeeper",
  "@crowandraven/evalkeeper-prisma",
  "@crowandraven/evalkeeper-ai-sdk",
];

/**
 * The changelog's section for `version`: its heading line and its body
 * (without the heading), or null when there's none.
 */
export function changelogSection(changelog, version) {
  const lines = changelog.split("\n");
  const start = lines.findIndex(
    (l) => l.startsWith(`## ${version} `) || l === `## ${version}`,
  );
  if (start === -1) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith("## "));
  return {
    heading: lines[start].slice(3),
    body: (end === -1 ? rest : rest.slice(0, end)).join("\n").trim(),
  };
}

/** GitHub's anchor for a heading: "0.4.1 - 2026-10-21" is "041---2026-10-21". */
export function anchorFor(heading) {
  return heading
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, "")
    .replaceAll(" ", "-");
}

/** The release page for `version`, or null when the changelog has no section for it. */
export function releaseNotes(changelog, version) {
  const section = changelogSection(changelog, version);
  if (!section) return null;
  const install = PACKAGES.map((p) => `${p}@${version}`).join(" ");
  const table = [
    "| Package | npm |",
    "| --- | --- |",
    ...PACKAGES.map(
      (p) =>
        `| \`${p}\` | [${version}](https://www.npmjs.com/package/${p}/v/${version}) |`,
    ),
  ].join("\n");
  return (
    [
      section.body,
      "```bash\nnpm install " + install + "\n```",
      table,
      `Full changelog: [CHANGELOG.md](https://github.com/seanhudson/evalkeeper/blob/main/CHANGELOG.md#${anchorFor(section.heading)})`,
    ].join("\n\n") + "\n"
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const version = (process.argv[2] ?? "").replace(/^v/, "");
  const notes = releaseNotes(readFileSync("CHANGELOG.md", "utf8"), version);
  if (!notes) {
    console.error(`CHANGELOG.md has no "## ${version}" section.`);
    process.exit(1);
  }
  process.stdout.write(notes);
}
