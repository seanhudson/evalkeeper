// Release notes from the changelog (scripts/release-notes.mjs). Runs with
// `npm run test:scripts`, part of `npm run check`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { anchorFor, changelogSection, releaseNotes } from "./release-notes.mjs";

const CHANGELOG = `# Changelog

## Unreleased

## 1.2.0 - 2026-01-02

New things.

### Added

- A thing.

## 1.1.0 - 2026-01-01

Old things.
`;

test("takes a version's section, up to the next one", () => {
  assert.deepEqual(changelogSection(CHANGELOG, "1.2.0"), {
    heading: "1.2.0 - 2026-01-02",
    body: "New things.\n\n### Added\n\n- A thing.",
  });
  assert.equal(changelogSection(CHANGELOG, "1.1.0")?.body, "Old things.");
});

test("has no section for a version the changelog doesn't have", () => {
  assert.equal(changelogSection(CHANGELOG, "1.3.0"), null);
  assert.equal(changelogSection(CHANGELOG, "1.2"), null);
  assert.equal(releaseNotes(CHANGELOG, "1.3.0"), null);
});

test("adds the install line, the packages on npm, and the changelog link", () => {
  const notes = releaseNotes(CHANGELOG, "1.2.0") ?? "";
  assert.ok(notes.startsWith("New things."));
  // Split so the scrub check doesn't read "package@version" as an email.
  assert.ok(notes.includes("npm install @crowandraven/evalkeeper" + "@1.2.0 "));
  assert.ok(
    notes.includes(
      "[1.2.0](https://www.npmjs.com/package/@crowandraven/evalkeeper-prisma/v/1.2.0)",
    ),
  );
  assert.ok(notes.endsWith("CHANGELOG.md#120---2026-01-02)\n"));
});

test("makes GitHub's heading anchors", () => {
  assert.equal(anchorFor("0.4.1 - 2026-10-21"), "041---2026-10-21");
  assert.equal(anchorFor("Unreleased"), "unreleased");
});
