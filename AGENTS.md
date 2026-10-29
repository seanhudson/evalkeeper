# Instructions for coding agents

Two jobs: working on this repo, and adding Evalkeeper to someone's app.
Read [docs/architecture.md](docs/architecture.md) first; it says where
each kind of change goes.

## Working on this repo

### Before you finish

- `npm run check` passes: scrub, formatting, build, typecheck, lint, and
  tests with coverage. For page changes, `npm run e2e` in `examples/next`
  passes too.
- Never bypass the hooks (`--no-verify`) or merge with CI red. CI is the
  gate; the hooks just catch things sooner.

### Strict typing

- No `any`. Use `unknown` and narrow it (`typeof`, `Array.isArray`, a
  zod schema). Data from outside (forms, JSON columns, model output) is
  parsed with zod or narrowed before use.
- No non-null assertions (`!`) outside tests. Use `at()` or `mustGet()`
  from `util.ts` for indexes and keys you've checked, or handle the
  missing case.
- No `@ts-ignore`. `@ts-expect-error` only with a comment saying why and
  what would remove it.
- `as` casts only at a trust boundary (a value this code wrote itself,
  read back from storage), with a comment saying so.
- Keep the compiler's strict flags (`noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, and the rest in `tsconfig.base.json`)
  and the lint rules on. Don't loosen them to make a change pass.
- Every export in the packages has a TSDoc comment that says what it's
  for and when to use it, not just what it is: `@param name - meaning`,
  never `@param {type}` (the types are in the code). The main entry points
  (`createRunner`, `createSettings`, `suggest`, `suiteHealth`,
  `weeklySummary`, `caseFromFeedback`, `describeStoreContract`,
  `prismaStore`, `instructionsHash`, `createMeaningJudge`) have an
  `@example`; a new entry point gets one too. Lint enforces the syntax
  (`tsdoc/syntax`) and the comments (`jsdoc/require-jsdoc`), and the API
  reference build (`npm run docs:api`) fails on any TypeDoc warning.

### Explain everything on screen

- Every term a page shows has an entry in `packages/core/src/glossary.ts`
  and a tooltip (`InfoTip` or `Tip`). Pages, tooltips, and docs use the
  same wording; change all three together.
- Every form field has a `label` and `help` (`FormField`), shown with the
  field and as a tooltip where the value is read.
- Every check has a `description` that says what it checks and why its
  severity is serious or minor.
- Plain words, US English, and the Oxford comma. Prose gets the `readable`
  class (about 65 characters a line).

### Tests ship with the feature

Every change comes with the tests that prove it, at the right level:

| Change                         | Tests                                                                                                         |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| A pure function or rule (core) | A unit test next to it, covering edge cases and each branch                                                   |
| A runner behavior              | A runner test on `memoryStore` (`runner.test.ts`, `runner.more.test.ts`)                                      |
| A storage method               | A case in `describeStoreContract`; every store must pass it                                                   |
| A new store or adapter         | Run `describeStoreContract` against it                                                                        |
| An AI adapter                  | Unit tests with `MockLanguageModelV3` from `ai/test`; no network                                              |
| A suite                        | Grader tests on fixed outputs: right, wrong, edge cases, no answer; `describeSuiteContract` over the registry |
| A form reader                  | A test that it reads good input and rejects bad input                                                         |
| A page, action, or component   | An end-to-end test in `examples/next/e2e`, demo models only                                                   |
| A bug fix                      | A test that fails before the fix and passes after                                                             |

- Coverage limits (`packages/*/vitest.config.ts`) never go down. Raise
  them when coverage rises.
- Tests never call a paid model or the network. End-to-end tests use demo
  models and their own database.
- Tests use made-up names and data only.

### Docs ship with the feature

- `CHANGELOG.md` gets a line under "Unreleased" for anything a user would
  notice: Added, Changed, Fixed, or Removed. A breaking change says how to
  update.
- Concepts, the glossary, the README, and the architecture doc change
  when what they describe does.
- A rule caused by a real case gets an entry in
  [docs/lessons.md](docs/lessons.md): what happened, what it taught, and
  what changed.

### Structure

- Everything ships in one package, `@crowandraven/evalkeeper`, with an
  entry point per part. The root entry stays pure: no database,
  framework, or provider imports, except `runner.ts` (`node:crypto`) and
  `cli/` (the `evalkeeper` command, which reads and writes files).
  Anything that talks to a service is its own entry point (`/prisma`,
  `/ai-sdk`), whose library is an optional peer dependency, never a new
  package.
- Pages and actions talk to storage through `EvalStore`, never to tables
  directly, so they work with any store.
- The Prisma stores read and write every column through the map
  (`packages/core/src/prisma/mapping.ts`), so apps with their own tables keep
  working. A new column or table goes through it too, gets a case in the
  mapped-store test on the app-shaped schema
  (`examples/next/test/byo`), and an unmapped store still builds the same
  queries as before.
- The example's eval pages are the CLI's templates
  (`packages/core/scripts/build-templates.mjs` copies them). They import
  only `@/lib/evalkeeper` (the app's wiring), `@/lib/evalkeeper/*` (the
  copied glue), and `@/components/evalkeeper/*`; links come from
  `evalsPath`; every page and action calls `requireAdmin()` first. A page
  that imports anything else breaks the copied app, and
  `examples/next/test/cli.test.ts` (which typechecks a copy) fails.
- Something an app customizes on the copied pages goes through the
  wiring module, not edits to the copies: an answer editor is an entry in
  its `answerEditors`. A new export the pages read goes in the starter
  wiring (`packages/core/starter/index.ts`), the example's, and the CLI's
  "exports what the pages use" step, together.
- Relative imports in the packages end in `.js`, so the built packages
  load in plain Node, not only through a bundler.
- A change to what a suite's grading means bumps its `graderVersion`.
- Packages follow semantic versioning. Until 1.0, a minor version may
  change an interface; its changelog entry says how to update.

### Dependencies

- Dependabot opens weekly pull requests. Read the release notes, run
  `npm run check`, and merge one major update at a time.
- An `overrides` entry in `package.json` (to pin a fixed sub-dependency)
  gets a CHANGELOG line saying why, and comes out once upstream ships the
  fix.
- Planned majors (zod, Prisma, `@types/node`) are ignored in
  `.github/dependabot.yml`; remove a line once its upgrade lands, as AI
  SDK 7 did.
- No new runtime dependency in the core without a reason in the pull
  request.
- CI's audit (`scripts/audit.mjs`) fails on any high or critical
  advisory. One that can't be fixed yet (only a planned major fixes it)
  goes in its `ALLOWED` list with why and when it comes out, plus a
  CHANGELOG line, and comes out with that upgrade. Never allow one to
  make a pull request pass.

### Security and privacy

- Never commit secrets, real people's data, or private project names. The
  scrub check (`scripts/scrub-check.mjs`) stores banned words as hashes;
  add new ones the same way.
- Security issues are reported privately (SECURITY.md), never in an
  issue.

## Adding Evalkeeper to an app

Follow [docs/adding-to-your-app.md](docs/adding-to-your-app.md) one step
at a time, and stop after each step for the person to check it. Read
[docs/concepts.md](docs/concepts.md) first.

**First, look at what the app already has.** Many apps had evals before
Evalkeeper: their own eval tables (often holding answers people already
reviewed), a model router, a settings history or admin page for models,
or eval pages. If so, follow [docs/bring-your-own.md](docs/bring-your-own.md) instead of
the fresh-start steps for those pieces, and tell the person which pieces
you found and which you'd map, keep, or replace.

- **Map, don't migrate.** Keep existing eval rows in their tables:
  `prismaStore(prisma, map)`, `prismaSettingsStore(prisma, map)`, and
  `prismaFeedbackStore(prisma, map)` map model names, column names,
  Decimal costs, enums, and missing columns.
  Don't copy Evalkeeper's models into a schema that already has its own,
  and don't move or re-import reviewed answers.
- **Prove the map before using it.** First the read-only check:
  `prismaReadCheck` (or `checkStoreReads`) through
  `describeMappedReadCheck` lists what in the existing rows doesn't
  parse. Then `describeStoreContract` (and
  `describeSettingsStoreContract` for versions), with `without` naming
  any setting mapped to `null`, either scoped (`scope` and
  `deleteScopedRows`, which delete only rows the scope names) or on a
  throwaway local database made from the schema file. Nothing ever
  empties a database that isn't throwaway: check the database's name
  before emptying anything, and say which database and that it will be
  emptied before running. Never against production.
- **Keep the app's router.** Wire `route`, `candidates`, `promptVersion`,
  and `continueRun` to the functions the app already has; don't add a
  second way to pick a model.
- **Copy only the pages being replaced.** Run `add pages --only <names>
--dry-run` first and show the person the plan. Never `--force` over
  pages the app wrote itself.
- **Say what changes once.** Request hashes may differ from the old
  harness's, so the first test of each model after the move pays for its
  answers again. Tell the person before they run it.

- **Never confirm an answer on the person's behalf.** Cases and answers
  you draft are PENDING. If the person wants drafts used before review,
  they're PROVISIONAL, and you say so. Only a person makes an answer
  CONFIRMED.
- **List the drafts you're unsure of,** so the person reviews those first.
- **No personal data in cases.** When freezing real inputs into cases,
  remove names, contact details, and anything identifying, and leave out
  anything the app learned from the case itself (its answer would leak).
- **Don't change which model is live.** Suggestions are for the person;
  the app's routing changes only when they say so.
- **Don't run paid tests without asking.** A test calls a model on every
  case. Say which suite, which models, and the estimate first.
- **Never point a migration tool at a production database.** Write
  migration SQL from schema files; never pass a real database's URL as a
  shadow database.
- **Read failures before changing a prompt or a check.** A low score is
  often the grader's fault. Fix the grader with a test that shows the bug,
  and bump the suite's `graderVersion`.
- **Hash every instruction a model gets** (`instructionsHash`): system
  text, prompt templates, output schemas, and tool descriptions, plus
  anything added or replaced at runtime (an admin override, edited
  guidance), joined with `promptVersionOf`. Pass the same parts' text
  (`instructionParts`) as the runner's `instructionTexts`, so the suite
  page warns about a case copied into them.
- **Never copy a case into the instructions as an example.** A test then
  grades the model on an answer it was handed, and the score rises
  without the model getting better. Write a new example instead, and
  read the "Cases in the instructions" warning before trusting a score.
- **Ready-made suites are a starting point.** `crisisRiskSuite` and
  `hopelessnessSuite` (`@crowandraven/evalkeeper/suites`) test the app's
  own detector on made-up cases that aren't clinically validated. Say so
  when adding one, and have the person review and adapt the cases with
  people who have crisis-line or clinical experience before relying on
  them.
- **Pass `readActual` when call sites read the app's own settings row,**
  so changes made outside Evalkeeper are recorded before the next save.
- **Thumbs keep inputs only with consent.** When adding ratings, keep the
  input behind an answer only when the person agreed, with names and
  contact details removed. The rating action looks the answer up by its
  id; it never takes the input or output from the browser.
- **Give every suite field help and every check a description,** and test
  the suite's grader like any other code. Run `describeSuiteContract`
  over the app's suites so a missing label or help fails a test.
