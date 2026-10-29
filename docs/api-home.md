# Evalkeeper API reference

Every export of Evalkeeper's packages, with what it's for. For how the
pieces fit, start with the guides in the repository:

- [README](https://github.com/seanhudson/evalkeeper#readme): what it does
  and the quick start
- [Concepts](https://github.com/seanhudson/evalkeeper/blob/main/docs/concepts.md):
  suites, cases, answers, checks, tests, and the rules behind suggestions
- [Adding Evalkeeper to your app](https://github.com/seanhudson/evalkeeper/blob/main/docs/adding-to-your-app.md)
- [Architecture](https://github.com/seanhudson/evalkeeper/blob/main/docs/architecture.md)

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
