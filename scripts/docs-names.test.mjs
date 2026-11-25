// The docs names check (scripts/docs-names.mjs). Runs with
// `npm run test:scripts`, part of `npm run check`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { asShown, labelPattern, mentions, missing } from "./docs-names.mjs";

const SOURCE = asShown(`
  <Submit>Rescore tests</Submit>
  <Button>Add {fresh.length} starter {fresh.length === 1 ? "case" : "cases"}</Button>
  what: \`Confirm \${n(t.answers, "answer")}\`,
  label: \`Make \${row.label} live\`,
  <summary>Every topic and its cases</summary>
  export function suiteTodos() {}
`);

test("reads plurals and counts the way a screen shows them", () => {
  assert.match(SOURCE, /starter cases/);
  assert.match(SOURCE, /Confirm N answers/);
});

test("N, X, and a check's name match whatever the screen fills in", () => {
  assert.ok(labelPattern("Add N starter cases").test(SOURCE));
  assert.ok(labelPattern("Confirm N answers").test(SOURCE));
  assert.ok(labelPattern("Make X live").test(SOURCE));
  assert.ok(!labelPattern("Show all topics").test(SOURCE));
});

test("finds labels and code names, not emphasis or code blocks", () => {
  const { labels, names } = mentions(
    [
      "Press **Rescore tests**, then **Make X live**.",
      "**This matters.** It's **important** and long words **in bold**.",
      "Call `suiteTodos` or `createRunner()`, not `npm` or `zod`.",
      "```ts",
      "**Inside a code block**",
      "```",
    ].join("\n"),
  );
  assert.deepEqual(labels, ["Rescore tests", "Make X live"]);
  assert.deepEqual(names, ["suiteTodos", "createRunner"]);
});

test("names a label or code name the code no longer has", () => {
  const problems = missing(
    [
      {
        path: "docs/upkeep.md",
        text: "Press **Rescore tests**, or **Show all topics**. Use `suiteHealth`.",
      },
    ],
    SOURCE,
  );
  assert.deepEqual(problems, [
    'docs/upkeep.md: "Show all topics" is retired; the screens say Every topic and its cases',
    "docs/upkeep.md: **Show all topics** isn't on any screen",
    "docs/upkeep.md: `suiteHealth` isn't in the code",
  ]);
});

test("a retired phrase is caught in plain words too, across a line break", () => {
  const problems = missing(
    [{ path: "docs/models.md", text: "the hub's costliest\nlive model" }],
    SOURCE,
  );
  assert.equal(problems.length, 1);
  assert.match(problems[0] ?? "", /costliest live model/);
});

test("skips pages about the past or the future", () => {
  const text = "**Show all topics** and `suiteHealth`";
  assert.deepEqual(
    missing(
      [
        { path: "docs/lessons.md", text },
        { path: "docs/roadmap.md", text },
      ],
      SOURCE,
    ),
    [],
  );
});
