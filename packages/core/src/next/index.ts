/**
 * Evalkeeper's glue for the Next.js App Router: the server actions, the
 * pages, the weekly check, and its cron route, so the files `add pages`
 * writes in your app are each a few lines. Import from
 * `@crowandraven/evalkeeper/next` in server code; your app's own
 * components go in `@crowandraven/evalkeeper/next/components`.
 *
 * @module evalkeeper/next
 */
export * from "./wiring.js";
export * from "./actions.js";
export * from "./pages.js";
export * from "./weekly.js";
export * from "./route.js";
export * from "./cron.js";
