# @crowandraven/evalkeeper

The core of [Evalkeeper](https://github.com/seanhudson/evalkeeper), an eval harness for the AI features in TypeScript apps: suite and check types, stats,
paired comparisons, model suggestions, suite health, grader helpers, and
the runner. Pure TypeScript; the runner (`@crowandraven/evalkeeper/runner`) is
server-only, and `@crowandraven/evalkeeper/memory` is an in-memory store for tests and
demos.

The `evalkeeper` command copies the eval pages into your app:
`npx @crowandraven/evalkeeper add pages --base admin/evals`. Already have
pages, tables, or a model router of your own? Copy only what you're
replacing with `--only <names>` (and `--dry-run` to see the plan), and see
"Bring your own" in
[Adding Evalkeeper to your app](https://github.com/seanhudson/evalkeeper/blob/main/docs/adding-to-your-app.md#bring-your-own).
