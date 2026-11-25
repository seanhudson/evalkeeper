// The pull request "Docs:" line check (scripts/pr-docs-line.mjs). Runs
// with `npm run test:scripts`, part of `npm run check`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { docsLineProblem } from "./pr-docs-line.mjs";

test("passes a line that names pages, or says none and why", () => {
  assert.equal(
    docsLineProblem("Fixes it.\n\nDocs: upkeep.md, answer-key.md"),
    null,
  );
  assert.equal(docsLineProblem("**Docs:** none, a test-only change"), null);
  assert.equal(docsLineProblem("- Docs: README.md"), null);
});

test("fails with no line, an empty one, or a bare none", () => {
  assert.match(docsLineProblem("Fixes it.") ?? "", /needs a "Docs:" line/);
  assert.match(docsLineProblem("Docs:") ?? "", /is empty/);
  assert.match(docsLineProblem("Docs: none") ?? "", /without why/);
});

test("the template's own hint doesn't count as an answer", () => {
  assert.match(
    docsLineProblem("Docs: <!-- the pages this changed, or none and why -->") ??
      "",
    /is empty/,
  );
});

test("dependency updates from Dependabot are exempt", () => {
  assert.equal(docsLineProblem("Bumps zod.", "dependabot[bot]"), null);
});
