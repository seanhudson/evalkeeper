// Signing starter cases (scripts/review-starters.mjs). Runs with `npm run
// test:scripts`, part of `npm run check`, after the build.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fromTsv, toTsv, withReviews } from "./review-starters.mjs";

test("writes a sheet with a header and one line per case", () => {
  const tsv = toTsv([
    {
      case: "a1b2c3d4",
      answer: '{"group":"must"}',
      title: "one\ttwo\nthree",
      input: '{"message":"one"}',
    },
  ]);
  assert.equal(
    tsv,
    'case\tconfirm\tanswer\ttitle\tinput\na1b2c3d4\t\t{"group":"must"}\tone two three\t{"message":"one"}\n',
  );
});

test("reads marks back by column name, whatever the order", () => {
  const rows = fromTsv(
    "title\tconfirm\tcase\nfirst\tyes\ta1b2c3d4\r\nsecond\t\te5f6a7b8\n\n",
  );
  assert.deepEqual(rows, [
    { case: "a1b2c3d4", confirm: "yes" },
    { case: "e5f6a7b8", confirm: "" },
  ]);
  const withAnswer = fromTsv(
    'case\tconfirm\tanswer\nx1\tyes\t{"group":"must"}\n',
  );
  assert.deepEqual(withAnswer, [
    { case: "x1", confirm: "yes", answer: '{"group":"must"}' },
  ]);
  assert.throws(() => fromTsv("case\tanswer\nx\ty\n"), /no "confirm" column/);
});

test("replaces the list and keeps the file's comment", () => {
  const before =
    'import type { ShippedReview } from "../reviews.js";\n\n/** Notes. */\nexport const X_REVIEWS: readonly ShippedReview[] = [];\n';
  const after = withReviews(before, "X_REVIEWS", [{ case: "a1b2c3d4" }]);
  assert.match(after, /^import type[\s\S]*\/\*\* Notes\. \*\//);
  assert.match(after, /X_REVIEWS: readonly ShippedReview\[\] = \[\n {2}\{/);
  assert.throws(() => withReviews(before, "Y_REVIEWS", []), /No "export/);
});
