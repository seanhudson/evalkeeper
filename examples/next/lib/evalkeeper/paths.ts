/**
 * Where the eval pages live in your app. The CLI sets this to the base you
 * choose (`npx @crowandraven/evalkeeper add pages --base admin/evals`); every link and
 * refresh on the pages is built from it.
 */
export const EVALS_BASE = "/evals";

/** A path under the eval pages: evalsPath("ticket_triage", "runs", id). */
export function evalsPath(...parts: string[]): string {
  return [EVALS_BASE, ...parts.map(encodeURIComponent)].join("/");
}
