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

| Import               | What it is                                                           |
| -------------------- | -------------------------------------------------------------------- |
| `evalkeeper`         | The core: suites, stats, suggestions, feedback, settings, and stores |
| `evalkeeper/runner`  | The runner (server-only)                                             |
| `evalkeeper/memory`  | An in-memory store                                                   |
| `evalkeeper/testing` | The store contracts, as Vitest tests                                 |
| `evalkeeper/cli`     | The `evalkeeper` command                                             |
| `@evalkeeper/prisma` | The Prisma tables and stores                                         |
| `@evalkeeper/ai-sdk` | Instruction hashes, pricing, and the meaning judge                   |
