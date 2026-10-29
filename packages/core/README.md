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
[Bring your own](https://seanhudson.github.io/evalkeeper/guides/bring-your-own/).
A `--base` inside a Next.js route group (`"(app)/admin/evals"`) keeps the
group in the folders and leaves it out of the links.

Ready-made suites live in `@crowandraven/evalkeeper/suites`: a crisis risk
suite (`crisisRiskSuite`) and a hopelessness suite (`hopelessnessSuite`)
for apps that watch chat messages. Your app passes its own detector. Their
cases are made-up examples written as a starting point, not clinically
validated: review and adapt them with people who have crisis-line or
clinical experience before relying on them.
