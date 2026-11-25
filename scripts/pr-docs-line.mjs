// Fails a pull request whose description has no "Docs:" line saying which
// pages it changed, or why none needed to. Docs drifted when a change
// updated some pages and not the others its rename touched, so each
// pull request says what it did about them. Runs in CI on every pull
// request (.github/workflows/pr-docs.yml), reading PR_BODY and PR_AUTHOR.
import { fileURLToPath } from "node:url";

/** Authors whose pull requests change no behavior to document. */
export const EXEMPT_AUTHORS = new Set(["dependabot[bot]"]);

/**
 * What's wrong with a pull request's "Docs:" line, or null when it's fine.
 * The line names the pages changed ("Docs: answer-key.md, upkeep.md") or
 * says why none needed to ("Docs: none, a test-only change").
 *
 * @param body - The pull request's description.
 * @param author - Its author's login.
 */
export function docsLineProblem(body, author = "") {
  if (EXEMPT_AUTHORS.has(author)) return null;
  // Template hints are comments: strip them until none is left, an
  // unclosed one included, so a hint never counts as an answer.
  let text = body ?? "";
  for (let before = ""; before !== text;) {
    before = text;
    text = text.replace(/<!--[\s\S]*?(?:-->|$)/g, "");
  }
  const match = /^\s*(?:[-*]\s*)?\**Docs:?\**:?[ \t]*(.*)$/im.exec(text);
  if (!match)
    return 'The description needs a "Docs:" line: the pages this changed, or "none" and why.';
  const says = (match[1] ?? "").trim();
  if (says.length < 3)
    return 'The "Docs:" line is empty: name the pages this changed, or say "none" and why.';
  if (/^none\.?$/i.test(says))
    return 'The "Docs:" line says "none" without why: add the reason ("none, a test-only change").';
  return null;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const problem = docsLineProblem(
    process.env.PR_BODY ?? "",
    process.env.PR_AUTHOR ?? "",
  );
  if (problem) {
    console.error(problem);
    process.exit(1);
  }
  console.log("The description says what happened to the docs.");
}
