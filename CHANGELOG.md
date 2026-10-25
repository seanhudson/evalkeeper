# Changelog

Notable changes, newest first. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions
follow [semantic versioning](https://semver.org/): until 1.0, a minor
version may change an interface, and its entry says how to update.

## Unreleased

### Added

- `prismaFeedbackStore(prisma, map)` runs on an app's own thumbs table,
  in the style of `prismaStore`'s map: the model and column names
  (`raterId: "userId"`), the rating column's values (`ratings: { UP:
"up", DOWN: "down" }`), and `null` for columns the table lacks
  (`reason`, `excerpt`, `input`, `output`, `status`, or `caseId`). Reads
  give null (a status, OPEN), and writing a value fails rather than
  losing it. The weekly summary's thumbs-down alerts and the hub's counts
  need only the rating, feature, and time. `deleteScopedRows` takes
  `feedbackMap` (#64).
- A store with no column for inputs marks each rating `keepsInputs:
false`, and `whyNotACase` (so `caseFromFeedback` too) refuses it in
  plain words: "This app doesn't keep inputs with ratings, so a rating
  can't become a case." (`NO_INPUTS_KEPT`) (#64).
- `describeFeedbackStoreContract` takes `without` for the columns a
  thumbs table lacks, as the other contracts do, and checks a listed
  rating reads the same as the one saved (#64).

### Changed

- The suite contract reads union inputs and answers (`z.union` and
  `z.discriminatedUnion`): every key in any option needs a field, so one
  `fields` list covers them all. It also names help left for a field the
  schema no longer has, as in `triage: input field "concernFirst" has
help but the input has no such field.` **To update:** if
  `describeSuiteContract` now fails, add a label and help for each union
  key it names, and remove (or rename) the help it says is left over
  (#65).

### Security

- CI's audit allows GHSA-mrhx-c7xc-m3w5 for now (`scripts/audit.mjs`).
  It's a high advisory for zod below 4.6.6 (memory exhaustion when
  validating oversized constrained collections) that affects every zod 3
  version and is fixed only in zod 4, a planned upgrade. Every other high
  or critical advisory still fails CI. This exception comes out with the
  zod 4 upgrade.

## 0.7.0 - 2026-10-22

A ready-made crisis risk suite; answer keys that grow from real activity
and blind ratings; compare and side-by-side pages; settings that notice
changes made outside them; and store contracts that run outside Vitest
and on databases holding other rows. **To update:** most of it is
opt-in. Read "Changed" for the four interface changes, and copy the
pages you want (`npx @crowandraven/evalkeeper add pages --only
rate,compare,side-by-side,DisagreementChip,suite,run,actions --dry-run`
first).

### Added

- `crisisRiskSuite` in the new `@crowandraven/evalkeeper/suites` entry
  point: a ready-made suite for an app's crisis risk detector, with about
  90 made-up messages in groups that arrive pending. Use it as it is, add
  your own cases, or read it as a pattern. It tests detection on these
  examples; it doesn't certify an app as safe (#54).
- `importCases` imports answers people already reviewed as confirmed:
  `answers: { status: "CONFIRMED", confirmedBy, at }` reads who confirmed
  each answer and when from its row, and refuses the import unless every
  row names both. Use it only for answers a person confirmed in the old
  system (#40).
- `withoutLeaks` on a suite removes what a case learned from itself
  before it's frozen. `importCases`, `importStarters`, and the example's
  "Add a case" run it, and `ImportResult.removed` and the case's note say
  what was removed. `withoutLeaks(suite, input, sourceRef)` and
  `leakNote(removed)` do the same for other code that makes cases (#41).
- `inputFromJson(schema)` and `labelFromJson(schema)` read a fixture
  suite's JSON fields, with plain errors for empty fields, bad JSON, and
  the first part that doesn't fit (#45).
- `Suite.draftFromActivity`: suites draft new cases from the app's real
  activity. Call `runner.draftFromActivity(suite.key)` from the weekly
  job. Drafts arrive pending (or with no answer), are never added twice
  (by `sourceRef`, retired cases included), and are capped at 5 per suite
  per week by default. Strip names and contact details from each input.
  `weeklySummary` takes `cases` and returns `drafted`, and the example hub
  links to them (#42).
- Rate blind for imported suites: a page (`rate`) that shows one case at
  a time by its input only, never the app's output, and takes the answer
  with a required reason, or a skip. Each rating is the rater's own
  confirmed answer, added beside other people's. In the core:
  `rateQueue`, `nextToRate`, `raterStatus`, `blindRating`, `skipMark`,
  and `BLIND_RATER` (#44).
- Compare and side-by-side pages: compare two finished tests (the verdict
  in plain words, each check's pass rate side by side, and the cases they
  graded differently), then read both answers to each of those cases
  next to the expected answer, stepping through them. The suite board
  and a test's page link to them. In the core, `disagreements()` and
  `aroundCase()`, and `runner.compare()` returns `disagreements` (#43).
- Settings record changes made outside them: `createSettings({
readActual })` compares the app's own settings row with the live
  version and records a mismatch as an OUTSIDE version, so a rollback
  can always get back to it. `promptVersionOf({ code, runtime })` and
  `splitPromptVersion` split an instructions hash into its code and
  runtime parts, and `syncPrompt` records INSTRUCTIONS when only the
  runtime part changed. `prismaSettingsStore`'s map takes `kinds` for an
  enum column without every kind. The settings history labels both new
  kinds (#48).
- Every contract in `@crowandraven/evalkeeper/testing` takes its test
  functions (`{ test: { describe, it, expect, afterAll } }`) and still
  defaults to Vitest; the testing entry loads without Vitest installed,
  and `assertExpect` gives `node:test` the matchers the contracts use
  (#47).
- Store contracts can run on a database that holds other rows: `{ scope:
"contract-", cleanup }` prefixes everything they write, and
  `deleteScopedRows` in `@crowandraven/evalkeeper-prisma` deletes only
  those rows. A read-only check, `prismaReadCheck` or `checkStoreReads`,
  lists existing rows that don't parse, with counts;
  `describeMappedReadCheck` runs it as tests (#46).
- The store contract checks that a case's `source`, `sourceRef`, and
  `createdAt` read back as written, and covers blind ratings, skips, and
  every settings change kind.
- Docs: lessons from moving a real app onto Evalkeeper, a release
  checklist in CONTRIBUTING.md, and seven roadmap items (#49).

### Changed

- `ImportResult` has a `removed` list, and `ImportAnswers` takes the row
  type (`ImportAnswers<Row>`). **To update:** code that compares a whole
  import result adds `removed: []`.
- `LabelStatus` gains `SKIPPED`: a rater passed on a case. It has no
  value, is never graded against, and doesn't make tests out of date.
  **To update:** if your mapped label table's status is an enum, add
  `SKIPPED`; code that switches over `LabelStatus` needs the case.
- `ChangeKind` gains `OUTSIDE` and `INSTRUCTIONS`. **To update:** add
  them wherever you switch over every kind (or re-copy `SettingsHistory`
  and `RollBack`); if your mapped change log's kind column is an enum,
  add both values with a migration or set `kinds` in the map.
- The testing entry loads Vitest with a top-level `await import`, so it
  loads without Vitest. Import it only from test code, as before.
- "Bring your own" → "Check it" runs the read-only check first. The
  emptying contract runs only on a throwaway local database made from
  your schema file, after checking its name and saying so.

## 0.6.0 - 2026-10-21

A suite contract test, so missing field help fails a test, and the
suggestion no longer proposes a switch when the live model's test only
had a timeout or two. 0.5.1 wasn't published to npm; its README changes
ship here. **To update:** copy the suite page
(`app/evals/[suite]/page.tsx`); everything else is opt-in.

### Added

- `describeSuiteContract(name, suites)` in `@crowandraven/evalkeeper/testing`:
  one test per suite that fails, in plain words, when a top-level field
  of its input or answer has no label and help, a check has no
  description, a starter case doesn't fit its schemas, or two suites
  share a key. `suiteContractProblems` is the same check as a pure
  function (#39). **To update:** nothing; add the contract to your suite
  tests when you're ready, and it lists what's missing.

### Fixed

- When the live model's current test has failed answers (a timeout,
  say), the suggestion said to switch, reading live as untested. It now
  says to test live again, with how many answers failed and why
  (`Suggestion.retestLive`), and keeps suggesting the fallback; the
  suite page hides "Use these" when it would change nothing, and the hub
  card says the same (#34). A live model that's retiring, out of date, or
  over the time limit is still replaced. **To update:** copy the suite
  page (`app/evals/[suite]/page.tsx`); custom pages that read `same` keep
  working, and can show `reasons` when `retestLive` is true.

## 0.5.1 - 2026-10-21

Docs only: the READMEs on npm now say you can bring your own tables,
versions, router, and pages. **To update:** nothing.

### Changed

- Each package's README (shown on npm) points to "Bring your own": core
  for `add pages --only` and `--dry-run`, prisma for mapping onto your
  own tables, and ai-sdk for working with your own router and billing.
  0.5.0 went out with the older READMEs.

## 0.5.0 - 2026-10-21

For apps that had evals before Evalkeeper: keep your own tables,
versions, and pages. **To update:** nothing; every change is opt-in, and
stores without a mapping behave as before.

### Added

- Each version tag gets its GitHub release, written from its CHANGELOG.md
  section with the install line and the packages on npm
  (`scripts/release-notes.mjs`, the Release workflow). Before, the
  releases page stopped at 0.1.1.
- `prismaStore(prisma, map)` and `prismaJudgmentCache(prisma, map)` run on
  an app's own eval tables: other model and column names, Decimal costs
  read as numbers, Prisma enums, `String[]` or `Json` tags, and `null` for
  a column the app lacks (reads as null; writing a value fails rather
  than losing it). **To update:** nothing, unless you want it; see "Bring
  your own" in docs/adding-to-your-app.md.
- `prismaSettingsStore(prisma, map)` runs on an app's own versions
  tables, with `by` callbacks for a table that keeps a user id for who
  made each change. **To update:** nothing, unless you want it.
- `describeStoreContract` and `describeSettingsStoreContract` take
  `{ without: [...] }` for a store with no column for temperature or the
  output cap: the contract then checks it refuses a value instead of
  losing it.
- `add pages --only <names>` copies just the pages (hub, suite, run,
  feedback, cron), components, and glue you name, or the groups `pages`
  and `components`. With `--dry-run`, it lists what would be written,
  skipped, or overwritten, and what the chosen files import that your app
  doesn't have.
- "Bring your own" in docs/adding-to-your-app.md: your own tables,
  router, versions, and pages, and what each costs. The README and
  AGENTS.md point to it, and AGENTS.md tells coding agents to check what
  an app already has before adding anything.

## 0.4.1 - 2026-10-21

The person choosing a fallback decides: "Make fallback" shows on every
model the operation allows, and scores show whole numbers. **To update:**
copy the suite page, `lib/evalkeeper/actions.ts`, and
`components/evalkeeper/ui.tsx`.

### Changed

- "Make fallback" shows on every model the operation allows as a
  fallback, except the live model and the current fallback: tested or
  not, with failed answers or not, same provider or not. The suggestion
  still recommends the most accurate model from another provider, and the
  change records the model's score, or "not tested". A model's failed
  answers show as a note on its row instead of hiding the button.
  **To update:** copy the suite page (`app/evals/[suite]/page.tsx`) and
  `lib/evalkeeper/actions.ts`.

### Fixed

- Scores show whole numbers (`48/50`, not `47.6/49.6`) when a failed
  answer counts a graded answer's average parts. **To update:** copy
  `components/evalkeeper/ui.tsx`.

## 0.4.0 - 2026-10-20

From running Evalkeeper in production on a remote database: the pages
load in fewer queries and no longer spin while a test runs, confirming
an answer moves straight to the next draft, and two scoring fixes.
**To update:** copy the changed pages and components (each entry below
names them); a custom `EvalStore` needs nothing, and can add
`listOutputsFor` and `findReusableHashes` to load faster.

### Added

- Two optional `EvalStore` methods load in one query what took one per
  item: `listOutputsFor(runIds)` and `findReusableHashes(hashes, since)`.
  The memory and Prisma stores have them, and `describeStoreContract`
  checks them when present. A custom store without them still works: the
  runner falls back to a call per item (#25).

### Changed

- The board, the suite page, and the answer key load in fewer, parallel
  queries. On a remote database the suite page was waiting on dozens of
  round trips in turn (#25). **To update:** copy the suite page and
  `AnswerKey.tsx` again, or make the same changes to your copies.
- Rolling back needs a note: the button stays off, with a tooltip saying
  why, until there's one (#28). **To update:** copy `RollBack.tsx`,
  `SettingsHistory.tsx`, and `Submit.tsx`.
- Buttons that aren't the page's main action use the app's accent as an
  outline instead of plain gray (`QUIET_BUTTON` in `Submit.tsx`), so the
  pages carry the app's colors wherever `--accent` is set (#29).
- On the evals hub, each card shows the live version beside its versions
  count, and the live and fallback models in bold (#30).
- Confirming an answer closes its case and opens the next one waiting
  for a confirmation at once, while the save and the page's refresh
  finish behind it, so reviewing drafts doesn't wait on the whole page
  each time. **To update:** copy `ConfirmAnswer.tsx` and `AnswerKey.tsx`.

### Fixed

- The suite page could spin forever while a test ran: `RefreshWhile`
  refreshed on a timer, and each refresh cancelled the one still in
  flight, so a page slower than the interval never updated. It now waits
  for each refresh to land (#25). **To update:** copy `RefreshWhile.tsx`.
- `numbersCheck` read a comma after a number as part of it, so "In March
  2020, I joined" claimed "2020," and failed. A comma joins a number only
  as a thousands separator now (#26).
- With partial credit (`units`), a failed answer dropped out of the total,
  so a model that failed answers could score 100%. It now counts as wrong,
  worth what a graded answer is on average (#27).

## 0.3.0 - 2026-10-20

From adopting Evalkeeper in two apps: the output cap counts like
temperature, reasoning settings beyond none to high, retiring models
shown only while in use, importing existing cases, and clearer pages on a
fresh install. **To update:** add the nullable `maxOutputTokens Int?`
column to `EvalRun` (see `schema/evalkeeper.prisma`), and have a custom
`EvalStore` honor `listCases(suite, { includeRetired })`.

### Added

- The output cap is part of what a test ran with, like temperature:
  `Route.maxOutputTokens` (`settings.route` returns it), `RunRecord` and
  the suite's `run` context carry it, it's in the request hash when set,
  and a test at another cap than the live one is out of date. A raised cap
  no longer reuses answers cut short under the old one. **To update:** add
  a nullable `maxOutputTokens Int?` column to `EvalRun`. (#18)
- `createRunner({ retiringOnBoard: "inUse" })` lists a retiring model on
  the board only while a feature runs on it as its live or fallback model.
  The default, `"always"`, lists every candidate as before. (#20)
- `importCases` imports existing test data as a suite's cases. It checks
  every row against the suite's schemas before writing anything
  (`CaseImportError` lists the bad rows), skips rows it imported before
  (retired ones included), and splits DEV, TEST, or like new cases.
  Answers arrive PENDING, or PROVISIONAL when the owner allowed it, tagged
  `needs-review` and noting who allowed it. `importStarters` adds a
  suite's `starter` cases the same way. `EvalStore.listCases` takes
  `{ includeRetired }`; a custom store should honor it (the contract
  checks). (#22)

### Fixed

- The pages explain a fresh install: with no suites, the hub says what a
  suite is and how to add the first one, and the feedback page no longer
  links to `/try`, a page only the example app has. (#23)

### Changed

- Reasoning settings beyond none to high: `ReasoningEffort` is any name a
  provider uses, and `REASONING_EFFORTS` lists the known ones lowest first
  (`none`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`). `effortFor`
  sends a setting below a model's lowest at its lowest (so `none` never
  reaches a model that rejects it) and one above its highest at its
  highest. The Prisma store keeps a setting as named; it used to turn any
  name it didn't know into `low`. (#19)
- `confirmedLabel` and `isProvisional` are generic over any label with a
  `status` and `updatedAt`, so pages that read their own label rows share
  the rule (newest confirmed, else newest provisional) and keep their row
  type. Code passing `LabelRecord[]` is unaffected. (#21)

## 0.2.0 - 2026-10-20

What a real app needed to adopt Evalkeeper: settings for apps whose models
are chosen in an admin page, temperature as a setting, prices for cached
input, and baselines. **To update:** add the nullable `temperature`
columns below to your schema, and set `baseline` on any `BoardRow` you
build by hand.

### Added

- Cached-input prices: `ModelInfo.cachedInputPer1M` and
  `cacheWriteInputPer1M`, and `priceCall` takes `cachedInput` and
  `cacheWriteInput` (parts of `input`). `costOf` reads the AI SDK's
  `usage.inputTokenDetails`, so a test of a mostly cached operation (a chat
  turn) no longer reads several times its real cost. Models without cache
  prices cost the same as before. (#15)
- Settings without defaults in code: `defaults` may return null, reading
  such a feature's settings throws `NoSettingsError` until it has a
  version, and `settings.seed(operation, settings, { by, reason })` records
  an app's existing config as version 1 (only when the feature has none,
  so an import can run again). A first `change` with no default records
  the new settings as version 1. (#13)
- Temperature is a versioned setting: `Settings.temperature` and
  `Route.temperature` (null or unset: none sent). A test records the
  temperature it ran at (`RunRecord.temperature`) and passes it to the
  suite's `run` as `ctx.temperature`; a test at another temperature than
  the live one is out of date, answers aren't reused across temperatures,
  and a temperature change isn't called drift. **To update:** add a
  nullable `temperature Float?` column to `EvalRun` and
  `EvalSettingsVersion` (see `schema/evalkeeper.prisma`), and a custom
  `EvalStore` keeps `temperature` on runs. Requests without a temperature
  hash as before, so earlier answers are still reused. (#14)
- Baselines: `ModelInfo.baseline` marks a catalog entry that is code, not
  a model (a matcher, a rules engine), so the board shows whether a model
  beats it. A baseline is tested and compared like any model, but never
  suggested as live, as the fallback, or as one to watch, and it doesn't
  count as a tested model in a suite's health or as a suite's best model.
  `BoardRow.baseline` says which rows are baselines; code that builds board
  rows by hand sets it. (#16)

### Changed

- Package descriptions say what Evalkeeper is: an eval harness for
  TypeScript apps.

## 0.1.1 - 2026-10-20

The first version to install from npm.

### Added

- Decision suites: `decisions: true` on a suite, and `decisionCheck`,
  `scoreDecision`, `calibrationError`, `probabilityQuality`, and
  `meanCalibrationError` in the core. A check can carry `measures`
  (numbers averaged over a test), and a test's metrics and board rows
  carry them with each check's calibration error. `ModelInfo.decisions`
  says whether a model's probabilities are native or prompted.
  `decideAndPrice` in `@crowandraven/evalkeeper-ai-sdk` calls `experimental_decide`
  and prices it. The example adds a ticket routing suite with four demo
  decision models and Jev, GPT-6 Luna, and Claude entries, and shows
  probability quality, calibration error, and native or prompted on the
  board.
- The starter `lib/evalkeeper/index.ts` has `modelsFor(operation)`, the
  models a feature can be tested on, used for the runner's candidates.

- TSDoc on every export of the packages, with `@example` on the main entry
  points, enforced by lint (`eslint-plugin-tsdoc`, `eslint-plugin-jsdoc`),
  and an API reference built with TypeDoc (`npm run docs:api`) and
  published from CI to GitHub Pages.

- `npx @crowandraven/evalkeeper add pages`: copies the eval pages, components, and their
  server actions into a Next.js app, fitted to its import alias, folders,
  and a base path; never overwrites without `--force`; writes a starter
  `lib/evalkeeper/index.ts` whose `requireAdmin` refuses everyone until
  you write yours. `--dry-run` and `--no-cron`. Tested by typechecking a
  real copy.

- Versioned settings (optional): `createSettings` keeps each feature's
  live model, fallback, reasoning setting, and output limit as numbered
  versions, logs every change, promotion, rollback, and deploy with who,
  why, and evidence, and serves the runner's `route`. `SettingsStore`
  with `prismaSettingsStore` (the `EvalSettings*` tables) and
  `memoryStore`, and `describeSettingsStoreContract`. A switch decided
  against a stale live version is refused (`SettingsConflict`). The
  example uses it for routing, promotions from tests, "Use these" on the
  suggestion, and a settings history with rollback.

- The weekly check: `runner.startDriftCheck` and `runDriftCheck` run a
  suite's quick set on its live model with fresh answers, and
  `weeklySummary` reports drift (a drop of 15 points against last week's
  check of the same model, instructions, and grading), checks that didn't
  finish, live and fallback models retiring within 60 days, and features
  with a high thumbs-down share. The example adds a cron route with a
  constant-time secret check, a `vercel.json` schedule, and a Weekly check
  card with "Run it now".

- Feedback: thumbs up and down on AI answers (`FeedbackStore`,
  `prismaFeedbackStore`, and the `EvalFeedback` table), a weekly summary
  that flags a high thumbs-down share (`thumbsSummary`), and draft cases
  made from ratings on kept inputs (`caseFromFeedback`). A thumbs down
  leaves the answer for a person to write; a thumbs up proposes the
  model's answer, pending. `labelFromOutput` on suites makes the proposal.
  The example app adds a "try it" page, the thumbs component, a feedback
  queue, and a hub card.
- `describeFeedbackStoreContract` (`@crowandraven/evalkeeper/testing`).

- Answer key: open a case to see its input, answer, and each model's
  result; add a case, edit an answer, or retire a case.
- `fields` and `labelFromForm` on suites, so pages render forms for any
  suite, with help on every field.
- `GLOSSARY`: plain definitions for every term on the pages, shown as
  tooltips.
- `describeStoreContract` (`@crowandraven/evalkeeper/testing`): the tests every
  `EvalStore` must pass.
- `addLabel`, `setLabelStatus`, and `setCaseStatus` on `EvalStore`.
- Live, Fallback, Retires, and Out of date chips on the model board.
- README screenshots, light and dark, taken from the production build by
  `npm run screenshots`.
- Tests for every feature: unit, runner, store contract, AI adapter (with
  a mock model), suite graders, and end-to-end browser tests of the pages.
- Coverage limits, pre-commit and pre-push hooks, Dependabot, CodeQL, and
  CI on Node 20 and 22.

### Changed

- Published on npm under `@crowandraven`: `@crowandraven/evalkeeper` (was
  `evalkeeper`, now deprecated), `@crowandraven/evalkeeper-prisma` (was
  `@evalkeeper/prisma`), and `@crowandraven/evalkeeper-ai-sdk` (was
  `@evalkeeper/ai-sdk`). Change your imports and installs; the command is
  still `evalkeeper` (`npx @crowandraven/evalkeeper add pages`). Each
  package ships its LICENSE, and `vitest` is an optional peer (only
  `@crowandraven/evalkeeper/testing` needs it).
- The example's icons are Lucide (`lucide-react`, now in the CLI's install
  line): back arrows, thumbs, the case chevron, the info tip, and the
  circle loader. Everything you can press shows a pointer
  (`evalkeeper.css`).
- The example's hub cards show each feature's live version, models,
  cost and speed, latest test, and its versions with rollback. The
  settings history is called Versions and shows v1 (the defaults from
  code) before the first change. Answer key: Add a case and an icon
  Rescore at the top right; each case's edit and retire are in a menu.
- Glossary: `settingsHistory` is now `versions`; `answerKey` and `checks`
  are new, and so is `suites`.
- AI SDK 7 (`ai` 7, providers 4): `@crowandraven/evalkeeper-ai-sdk` needs `ai` 7 or
  later. zod 3 and Prisma 6 are unchanged. `costOf` takes usage whose
  token counts may be undefined. The judge passes `instructions` instead
  of the deprecated `system`; do the same in your suites.

- The example's eval pages import only the app's wiring module
  (`lib/evalkeeper/index.ts`) and the copied glue beside it, check
  `requireAdmin()` first, take links from one base path (`evalsPath`), and
  read through the store, never Prisma directly.

- `estimateRun` prices only the answers that won't be reused, and says how
  many will be (`answers`, `reused`), so a retest after rescoring shows as
  free. It takes `fresh` and `reasoningEffort`, and `createRun` passes
  them, so a test's stored estimate counts reuse too. The example shows
  each model's estimate under its Test button.
- `requestHashFor` is the one definition of an identical request, shared
  by tests and estimates.

- `AnySuite` is `Suite<unknown, unknown, unknown>` instead of `any`.
- The Prisma adapter is typed by its rows; no `any`.
- Stricter compiler and lint settings across the repo.

### Fixed

- The built packages now load in plain Node: relative imports end in
  `.js` and the packages compile with Node's module rules. Before, only
  bundlers could load them.

- Tooltips inside an open case all appeared at once (they answered the
  case's hover too); they now open only for their own trigger.
- Buttons on the model board no longer wrap onto two lines, and the hub
  says when every suite already has a model at 100%.

- `sentenceCount`, `numbersIn`, and `inventedNumbers` could take seconds on long, odd model
  output (a run of "!" or a long digit string). Both are linear now, with
  timing tests. Found by CodeQL.

- A high-severity advisory in the Prisma CLI's `deepmerge-ts`, through an
  npm override (`overrides.deepmerge-ts` in `package.json`). Remove it once
  Prisma ships `@prisma/config` with `deepmerge-ts` 8 or later.
- A test started without `liveEffort` now uses the route's reasoning
  setting, instead of the model's default.

## 0.1.0 - 2026-10-20

- First release: the core, the Prisma and AI SDK adapters, and the
  example Next.js app.
