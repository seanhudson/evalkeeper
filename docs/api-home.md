# Evalkeeper API reference

Every export of Evalkeeper's packages, with what it's for. For how the
pieces fit, start with the guides:

- [What Evalkeeper is](https://seanhudson.github.io/evalkeeper/), and the
  quick start in the [README](https://github.com/seanhudson/evalkeeper#readme)
- [Concepts](https://seanhudson.github.io/evalkeeper/start/concepts/):
  suites, cases, answers, checks, tests, and the rules behind suggestions
- [Adding Evalkeeper to your app](https://seanhudson.github.io/evalkeeper/start/adding-to-your-app/)
- [Architecture](https://seanhudson.github.io/evalkeeper/project/architecture/)

## Packages

| Import                                     | What it is                                                           |
| ------------------------------------------ | -------------------------------------------------------------------- |
| `evalkeeper`                               | The core: suites, stats, suggestions, feedback, settings, and stores |
| `@crowandraven/evalkeeper/runner`          | The runner (server-only)                                             |
| `@crowandraven/evalkeeper/memory`          | An in-memory store                                                   |
| `@crowandraven/evalkeeper/testing`         | The store contracts, as Vitest tests                                 |
| `@crowandraven/evalkeeper/cli`             | The `evalkeeper` command                                             |
| `@crowandraven/evalkeeper/prisma`          | The Prisma tables and stores                                         |
| `@crowandraven/evalkeeper/ai-sdk`          | Instruction hashes, pricing, and the meaning judge                   |
| `@crowandraven/evalkeeper/react`           | The screens' pieces, drawn with your app's own components            |
| `@crowandraven/evalkeeper/next`            | Next.js actions, pages, and the weekly cron route                    |
| `@crowandraven/evalkeeper/next/components` | Next.js's link and refresh for your provider                         |
