# Changelog

Notable changes, newest first. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions
follow [semantic versioning](https://semver.org/): until 1.0, a minor
version may change an interface, and its entry says how to update.

## Unreleased

### Added

- Decision suites: `decisions: true` on a suite, and `decisionCheck`,
  `scoreDecision`, `calibrationError`, `probabilityQuality`, and
  `meanCalibrationError` in the core. A check can carry `measures`
  (numbers averaged over a test), and a test's metrics and board rows
  carry them with each check's calibration error. `ModelInfo.decisions`
  says whether a model's probabilities are native or prompted.
  `decideAndPrice` in `@evalkeeper/ai-sdk` calls `experimental_decide`
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

- `npx evalkeeper add pages`: copies the eval pages, components, and their
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
- `describeFeedbackStoreContract` (`evalkeeper/testing`).

- Answer key: open a case to see its input, answer, and each model's
  result; add a case, edit an answer, or retire a case.
- `fields` and `labelFromForm` on suites, so pages render forms for any
  suite, with help on every field.
- `GLOSSARY`: plain definitions for every term on the pages, shown as
  tooltips.
- `describeStoreContract` (`evalkeeper/testing`): the tests every
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
- AI SDK 7 (`ai` 7, providers 4): `@evalkeeper/ai-sdk` needs `ai` 7 or
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
