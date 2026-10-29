import assert from "node:assert/strict";
import { test } from "node:test";
import {
  alertsToAsides,
  convertBody,
  firstParagraph,
  rewriteLink,
  screenshotFigure,
  splitTitle,
  toPage,
} from "./docs-site.mjs";

test("the title comes from the first heading", () => {
  assert.deepEqual(splitTitle("# Concepts\n\nWhat each word means.\n"), {
    title: "Concepts",
    body: "What each word means.\n",
  });
  assert.throws(() => splitTitle("No heading"), /# heading/);
});

test("the description is the first paragraph, in plain text", () => {
  assert.equal(
    firstParagraph("```ts\ncode\n```\n\nSee [the `guide`](x.md),\nthen *go*."),
    "See the guide, then go.",
  );
  assert.equal(firstParagraph("## Only a heading"), null);
});

test("links go to site pages, screenshots, or GitHub", () => {
  const from = "docs/concepts.md";
  assert.equal(
    rewriteLink("bring-your-own.md#your-own-router", from),
    "/evalkeeper/guides/bring-your-own/#your-own-router",
  );
  assert.equal(
    rewriteLink("../CHANGELOG.md", from),
    "/evalkeeper/upgrading/changelog/",
  );
  assert.equal(
    rewriteLink("screenshots/board-light.png", from),
    "/evalkeeper/screenshots/board-light.png",
  );
  assert.equal(
    rewriteLink("../packages/core/src/prisma", from),
    "https://github.com/seanhudson/evalkeeper/tree/main/packages/core/src/prisma",
  );
  assert.equal(
    rewriteLink("../LICENSE", from),
    "https://github.com/seanhudson/evalkeeper/blob/main/LICENSE",
  );
  for (const same of ["#rules", "https://example.com/a.md", "mailto:x"])
    assert.equal(rewriteLink(same, from), same);
});

test("code is left alone and diagrams are drawn in the browser", () => {
  const body = [
    "See [concepts](concepts.md).",
    "```ts",
    "const a = [b](c.md);",
    "```",
    "```mermaid",
    "a --> b<br/>c",
    "```",
  ].join("\n");
  assert.equal(
    convertBody(body, "docs/lessons.md"),
    [
      "See [concepts](/evalkeeper/start/concepts/).",
      "```ts",
      "const a = [b](c.md);",
      "```",
      '<pre class="mermaid">a --&gt; b&lt;br/&gt;c</pre>',
    ].join("\n"),
  );
});

test("a page gets frontmatter with an edit link", () => {
  const page = toPage("# Lessons\n\nWhat went wrong.\n", "docs/lessons.md");
  assert.match(page, /^---\ntitle: "Lessons"\ndescription: "What went wrong."/);
  assert.match(page, /editUrl: ".*\/edit\/main\/docs\/lessons\.md"/);
});

test("a screenshot becomes a figure in light and dark", () => {
  const fig = screenshotFigure(
    '![The "Add a case" form](screenshots/add-case-light.png "Adding a case")',
    "docs/answer-key.md",
  );
  assert.match(
    fig,
    /class="dark:sl-hidden" src="\/evalkeeper\/screenshots\/add-case-light\.png"/,
  );
  assert.match(
    fig,
    /class="light:sl-hidden" src="\/evalkeeper\/screenshots\/add-case-dark\.png"/,
  );
  assert.match(fig, /alt="The &quot;Add a case&quot; form"/);
  assert.match(fig, /<figcaption>Adding a case<\/figcaption>/);
  assert.equal(screenshotFigure("![a](diagram.png)", "docs/x.md"), null);
  assert.equal(
    screenshotFigure("Text with ![a](s/x-light.png) in it", "docs/x.md"),
    null,
  );
});

test("GitHub's alerts become asides", () => {
  assert.equal(
    alertsToAsides("Before.\n> [!TIP]\n> **Do it.** Now.\n>\n> More.\nAfter."),
    "Before.\n:::tip\n**Do it.** Now.\n\nMore.\n:::\nAfter.",
  );
  assert.equal(alertsToAsides("> A quote."), "> A quote.");
});
