# Changelog

Notable changes, newest first. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions
follow [semantic versioning](https://semver.org/): until 1.0, a minor
version may change an interface, and its entry says how to update.

## Unreleased

### Fixed

- **Suite settings showed the old values after a save** when only a
  level, an aim, or the attack setting changed: the form now remounts on
  any saved change.
- **`migration --write --out` with an absolute path** wrote the SQL
  inside the project (`<project>/tmp/…`) and made that folder tree there.
  It now writes where the path says, and prints the SQL file's full path
  (#157).
- **"Cases in the instructions" flagged short labels.** A whole-text
  match now needs 3 words as well as 12 characters, so a field such as
  "Medical Billing" that names a term in the prompt isn't flagged; a
  message copied into the instructions still is
  (`IN_INSTRUCTIONS_MIN_WHOLE_WORDS`, `minWholeWords`) (#139).

### Added

- **"Review check levels" on a suite's to-do list** when more than half
  of four or more checks must pass, linking to Suite settings
  (`MANY_CHECKS`). A link to `#menu=<key>` opens a page menu's drawer.
- **Guidance on check levels and on letting a coding agent set things
  up**: a "Choose check levels" section in best practices, AGENTS.md
  rules to propose levels sparingly and list them for review, and a
  README section on what an agent does and what stays yours.
- **How careful the suggestion is with attacks** (#142). A suite's
  settings (and `SuitePriority.attacks` in code) choose **Strict** (the
  default: never more must-pass misses on the attacks than live, as
  before), **Balanced** (one more for a model that's clearly more
  accurate or makes at least two fewer must-pass misses), or **Off**
  (attacks shown, not weighed). Kept in suite settings, so no migration
  (`AttackCare`, `ATTACK_CARE`, `SuiteSettings.attacks`).
- **Use anyway** on a model the attacks hold back (#142): the suggestion
  links to the attack tests it missed on, and a button makes it live,
  recorded in the history as a person's call (`Suggestion.held`,
  `override=attacks` on `makeLive`). Under Strict, the reasons say when
  Balanced would allow it.
- **Spending limits the runner keeps** (#143). A `budget` runner option
  is asked before each new answer (reused ones are free) with the test,
  its feature, the model, and what the test has spent; a reason stops
  the test with that reason as its error, not "out of credits".
  `spendingBudget(spending)` makes one from your `EvalSpending`, so apps
  no longer need a guard that throws an out-of-credits error.
- **A stop between answers** (#143). A running test reads its own status
  every couple of seconds (`STOP_CHECK_MS`), so a stop takes effect
  within an answer or two, not at the next leg, and a finishing test
  never overwrites it. `runner.stopTests()` stops running tests, and
  **Stop all tests** uses it when your `spending` has no `stopAll`.
- **Test every model asks first** when it would cost more than $5, or
  when a model's price is unknown (`CONFIRM_TESTS_USD`,
  `EvalApp.confirmTestsAboveUsd`) (#143).
- **A failed test says what testing again costs**: under it on the model
  table, how many answers are reused free and what the rest cost (#143).
- **`voiceCheck` and `thirdPerson` take what the model was given**
  (`sources`). A pronoun the sources already use for someone else, such
  as "her" for a manager in the person's story or "they" for a company,
  no longer fails the voice check; one only the answer uses still does.
  Without `sources`, nothing changes. A suite that starts passing them
  should bump its `graderVersion` (#156).

### Changed

- **A roomier model table.** Short headings that fit on one line
  (Must-pass, Attacks, Confidence, Calibration, vs live). Accuracy shows
  the percent and bar, with "85 of 90 right" in its tooltip. Must-pass
  is now the share of answers with no must-pass miss, with the count in
  its tooltip; the suggestion still compares counts. Calibration reads
  "12% off". The "Native probabilities" chip is gone; only the exception,
  **Self-estimated** (prompted), gets one. `ScoreProps.counts` hides the
  count beside the bar (screen readers still read it).
- **Plainer explanations** of accuracy, must-pass, confidence,
  calibration, and built-in versus self-estimated probabilities, with
  examples, in the tooltips and the docs.

## 0.20.0 - 2026-11-25

Rescore tests, fixed and made plain: it covers every test the model
table shows, says what it cost, and goes on past the request's time limit.

Update:

- No re-copy needed: the copied actions file already returns what
  `rescore` returns. An app that wrote its own `rescore` action returns a
  `RescoreResult` (or `undefined`) now.
- Mark checks whose grading asks an AI judge with `judged: true` on the
  `CheckDef`, so the pages say what rescoring them costs.
- `runner.rescoreRecent(suite, limit)` still works; it now also takes
  `{ limit, skip, requestStartedAt }` and returns what it did.

### Fixed

- **Rescore tests covers every test the model table shows.** It rescored
  the latest test of each model on any set, so a weekly check's quick-set
  tests of the live model pushed the full test the table shows out of the
  rescore, and the table kept it graded the old way.
- **A long rescore no longer fails at the request's time limit.** It
  stops before `requestLimitMs` and the button goes on in a new request;
  if a request fails anyway, it says how far it got, and pressing again
  picks up where it left off (`RescoreOptions`, `RescoreProgress`,
  `RESCORE_MARGIN_MS`).

### Added

- **What rescoring costs, said plainly.** `CheckDef.judged` and
  `usesJudge`: the Rescore tests tooltip says "Free: no model calls" for
  a suite without judged checks, and that it may ask the judge about new
  wording (usually a few cents) for one with them. After a rescore, the
  app's toast (or a line beside the button) says what it did and what the
  judge actually spent (`RescoreButton`, `rescoreMessage`, `centsText`).
  A judged suite's rescore waits while tests are stopped or over a daily
  limit.
- **Test every model says it costs money**: a tooltip, and what testing
  every model would cost now beside the button.

### Changed

- Notes that said rescoring is free now say it makes no new model
  answers, since a judged check can cost a little.

## 0.19.0 - 2026-11-24

A design pass over the eval pages (#148): the hub answers "is anything
wrong?" in seconds, each suite's page leads with what to do next, every
menu and drawer is one shared component, and the words are plain.

Update:

- Re-copy the actions file so the new menu items and buttons work:
  `npx @crowandraven/evalkeeper add pages --only actions --force` (the
  file is Evalkeeper's; your own code isn't in it). Without it the
  pages still work; they just don't offer Suite settings, Save limits,
  Stop all tests, or Retire replaced starters.
- For Suite settings, add the optional EvalSuiteSetting table
  (`npx @crowandraven/evalkeeper migration`) and pass
  `suiteSettings: prismaSuiteSettingsStore(prisma)` to `createRunner`.
- To show spending, pass your own `spending` (an `EvalSpending`) in your
  wiring, and take out any panel of your own on the eval pages.
- A nice-to-have miss no longer fails an answer. Tests graded before
  this still count it until rescored: press **Rescore tests** (free) on
  each suite's answer key once after upgrading. `CheckDef.severity` can
  now be `"moderate"` too, so a `switch` over it needs that case.
- The glossary term `bar` is now `aim`. `InfoTip term="bar"` becomes
  `term="aim"`.
- A hub of your own: `loadHub` returns `suites` (each with its `status`
  and `todos`) in place of `cards`, `histories`, and `needs`;
  `HubIntro` takes `data`; `HubStats` is now one line of thumbs down.
  `suiteHealth`, its standings, and `StandingBadge` are still exported
  but no page uses them; use `suiteTodos` and `suiteStatus`.

### Added

- **A to-do list at the top of each suite's page**, in the order to do
  it: test every model (or test again), make a better model live, fix
  each must-pass check every tested model misses (how far off it is, and
  a link to the cases it misses), confirm provisional answers, add cases
  toward the target, make attack cases, retire replaced starters, and
  review cases models split on. Each is done right there and drops off
  once it's done (`suiteTodos`, `todoText`).
- **A suite's own target number of cases.** `targetCases` on a suite
  (default 50), and **Suite settings** in the page's menu to change it,
  kept apart from the model versions. The target replaces 50 in "Add
  cases", drafting, the floor for retiring easy cases, "Aim for", and
  "Too few cases", so a suite at its own target isn't flagged
  (`targetCasesOf`, `runner.targetCases`, `prismaSuiteSettingsStore`,
  `describeSuiteSettingsStoreContract`).
- **Spending and daily limits** from your app's numbers: in the page's
  menu, a drawer with the last 24 hours' spending and one form for both
  limits, in dollars. Over a limit, stopped, or while a test runs, a
  warning says what to do, with **Stop all tests** or **Allow tests**
  (`EvalSpending`, `memorySpending`, `SpendingAlert`). The runner side
  (a stop between answers, a budget hook) stays in #143.
- **Replaced starters.** A case added from a suite's starters whose input
  no starter has anymore is marked **No longer a starter**, and the to-do
  list offers to retire just those. A new starter that shares a title
  with one it replaces says so (`replacedStarters`).
- **Three check levels, set per suite** (#150): must pass (`serious`),
  should pass (`moderate`, a new level, aiming at 85%), and nice to have
  (`minor`). A nice-to-have miss no longer fails an answer, so it no
  longer drags down the answers fully right. **Suite settings** sets any
  check's level and aim in place of the code's; grading, the board, the
  suggestion, and the to-do list all use them. Each test records the
  levels it was graded with (`metrics.levels`, shown on its page), and
  saving new levels rescores recent tests for free (`effectiveChecks`,
  `runner.effectiveSuite`).
- One vertical-dots `Menu` (model rows, cases, and the page title all use
  it) and a `Drawer`, exported for custom pages.

### Changed

- **The hub is one short row per suite**: its name and status, Needs
  attention first, then Can't tell yet, then Healthy. Each row opens the
  suite's page. No chips, scores, bars, models, or versions on the hub,
  and the four stat cards are gone (thumbs down this week stays, as one
  line).
- **Plain words**: a check's "bar" is its **aim**, "serious" checks
  **must pass**, "minor" ones are **nice to have**, and the model table's
  column is **Must-pass misses**. A yes-or-no decision's threshold reads
  "cutoff".
- Where the mistakes are: **Answers with no mistakes at all** shows a
  percentage per model in the same colored chips as the rows above it,
  against an aim of 100%, and its label says how many answers ("14 of
  16 answers" stays as each cell's tooltip).
- The answer key no longer shows each case's Dev or Test chip: nothing
  on the pages treats the two sets differently (every test runs every
  case). Cases keep their `split` for tests run from code.
- The answer key's **Attacks** tab looks like its **Cases** tab: a
  heading with how many are in use, **Add an attack** as a button, and
  **Update attack cases** as an icon button, each with a tooltip.
- **Against live** says **Better**, **Similar**, or **Worse** (or
  **Can't tell**, with too few cases), in place of "More accurate",
  "About as accurate", and "Less accurate".
- The suite page's status sits beside its title. The to-do list is the
  one place to act: the suggestion card explains, and its item has **Use
  the suggestion**; the separate "attack cases not made yet" card is now
  a to-do item.
- When attacks hold back a model that would otherwise be suggested, the
  suggestion's first reason says so, with what it would have won on, and
  it isn't also named as "one to watch" (#142).
- **Add cases here** says first that picking a topic opens Add a case
  with it filled in, and each topic shows a + to say it opens one.
  Split-case cards in Answer key health span the panel; their words keep
  a readable width. With `draftMore`, the topics to draft for are chips that
  toggle (a ✓ once picked), like the + chips, not checkboxes.
- Colors come from the app's color names (`--color-good`, `--color-warn`,
  `--color-bad`), not fixed palette colors with `dark:` variants, so an
  app's own light and dark themes apply to chips, the check breakdown,
  and topics (#121).

### Fixed

- CI's audit passes again. Two packages that only the Prisma command
  line tool uses (`effect` and `deepmerge-ts`, through `@prisma/config`)
  had high advisories with fixed versions Prisma 6 doesn't ask for yet,
  so `package.json` overrides them to the fixed ones (`effect` 3.22.5,
  `deepmerge-ts` 8.0.2). They come out when Prisma's own dependencies
  reach those versions, or with the planned Prisma upgrade. The picomatch
  advisory is no longer reported, so its allowance is gone. Nothing in
  the published package changes.
- One feature with no settings yet (no version, no default in code) no
  longer breaks the hub or its page; its page says how to set them, and
  **Use the suggestion** asks for them first (`currentSettings`, #141).
- Non-urgent reasons no longer show an (i) that isn't a tip (#146).
- Tooltips on chips at the right edge of a page no longer make it scroll
  sideways.

## 0.18.0 - 2026-11-17

Retiring easy cases is slow and rare by design: the answer key is for
adding cases that tell models apart.

Update: `EASY_FLOOR` (a share, 0.1) is replaced by `EASY_FLOOR_CASES`
(50) and `EASY_MIN_ROUNDS` (4). `easyToRetire(easy, inUse)` now returns
none at 50 cases or fewer. Pass `rounds` in `CaseResult` (or use
`withRounds` with the runner's `easyRounds`) for `answerKeyHealth` to
suggest any.

### Added

- A feature with attack tests set up but no attack cases says so on its
  own page, above its answer key, with **Make attack cases**. Before,
  only the attack suite's own page offered it.

### Changed

- **A floor of 50.** Easy cases are suggested for retiring only when a
  suite has more than 50 cases in use, and never take it below 50.
- **Four rounds.** A case qualifies only after four rounds of testing:
  days on which three or more models were tested on it and all got it
  fully right, counted since its answer last changed. `runner.easyRounds`
  counts them, reading test history only past the floor.

### Fixed

- CI's audit allows the new picomatch advisory (no fixed version exists;
  it reaches only tooling that reads this repo's own file patterns) and
  drops the zod 3 entry, which the zod 4 override resolved. Nothing in
  the published package changes.
- **Retire easy cases** no longer retires a case that a suite's
  `gradeTogether` compares with others (a ranking). Every model getting
  it right doesn't make it useless: other cases' results depend on it,
  and retiring the clear-cut ones left only close calls, so a ranking
  score dropped with no model getting worse. Checks from
  `gradeTogether` are now marked `together`, per-case results say
  `ranked`, and retiring regrades first so older tests get the mark.
- A model tested with repeats counted once per repeat toward "every
  model gets it right" and "models split": one model with three repeats
  met the three-model bar alone. Each model counts once now, right only
  if every repeat was.

## 0.17.1 - 2026-11-17

### Added

- `Suite.outputLine(output)`: one model's answer as a short line, shown
  beside that model's latest test in the answer key, after the answer
  and the input, so a person can compare what models wrote with them.
  It's shown as given: quote a model's own words yourself.

### Changed

- The answer key's refresh button has the same green outline as **Add a
  case**.

### Fixed

- A model tested with repeats showed once per repeat under "Each model's
  latest test", with React warning about duplicate keys. It shows once,
  with the first repeat it got wrong, if any.
- After **The answer is right** or **Confirm this answer**, the rest of
  the "Models split" list could vanish: saving an answer puts every
  test out of date until it's regraded, and only the ten newest tests
  were, so models whose latest test was older dropped out. Every model's
  and setting's latest test is regraded now.
- A yes-or-no value reads "Yes" or "No" instead of "true" or "false",
  and a field's `optionLabels` can name them ("true" → "Yes, as they
  typed it").
- A JSON field whose values are all named in `optionLabels` (a
  yes-or-no) is edited as a choice between them, not typed as JSON.

## 0.17.0 - 2026-11-17

Reviewing a case is quicker to read and to act on.

Update: nothing required. To point reviewers at what matters, give a
suite a `lookAt`; to show Evalkeeper's messages as your app's toasts,
pass `notify` to `EvalComponentsProvider`.

### Added

- `Suite.lookAt(input, answer)`: notes on what to check for a case, with
  text to highlight in its input. The answer key shows them under
  **Look at**, and adds a note on its own when models' latest tests
  disagree with the answer.
- `notify` in `EvalComponents`: your app's toast for quick actions.
  `useNotify()` reads it.
- `FormField.optionLabels`: how each option of a choice reads to a
  person ("YES" shows as "Would apply").
- `CaseStatusChip`, `ReadableValue`, `Marked`, and `Folded`, for pages
  of your own.

### Changed

- An unconfirmed case opens with **Check this answer**: the proposed
  answer, what to look at, and **Confirm this answer** and **Edit
  answer** together, with the input below.
- Stored inputs and answers read like a page, never raw JSON: objects as
  labeled rows, lists of records as blocks, links as links, long text
  folded with its headings and lists, and all-caps values in sentence
  case ("VERIFIED" reads "Verified").
- **Confirm this answer** marks the case Confirmed at once, before the
  save finishes. A failed save opens the case again and says so.
- On the evals hub, each reason under a suite's name has an icon and its
  standing's color (red for serious, amber for what to improve), so it
  isn't missed.

- typescript-eslint uses minimatch 11.0.1 or later, which fixes a denial
  of service in glob patterns (a moderate advisory). eslint-plugin-tsdoc
  still asks for an older typescript-eslint, so an `overrides` entry pins
  minimatch under it until it ships the fix; the entry comes out then.
  typedoc keeps minimatch 10 for now, since it breaks on 11: it only
  reads this repo's own patterns, to build the API docs. Nothing in the
  published package changes.

## 0.16.0 - 2026-11-16

The evals hub says where each suite stands in one word and color, with
what needs you first.

Update: nothing required. `HealthChips` still works on pages of your own;
the hub uses `StandingBadge` and `HealthReasons` now.

### Changed

- The evals hub groups suites by one standing each, at risk first: At
  risk (red), Can improve (amber), Healthy (green), and Can't tell yet
  (gray). Each color means only that. The reasons read as one plain line
  under the suite's name, the check furthest under its bar shows as a bar
  with a tick at the bar, and provisional answers move to the end of the
  details, since they're a choice rather than a problem.
- `suiteHealth` returns `standing` and `worst` (the live model's check
  furthest under its bar). `StandingBadge`, `HealthReasons`,
  `STANDING_LABEL`, and `STANDING_ORDER` are new; `HealthChips` stays for
  pages of your own.
- "No eval yet" shows one slim card per untested feature instead of a
  comma-separated sentence. A feature in `features` can carry a
  `description` for its card.

## 0.15.0 - 2026-10-30

A quieter suite page: the answer guide, reasoning settings, and earlier
versions sit where they're needed instead of taking room. The weekly
check shows each suite's latest result and can't be started twice.

Update: remove `TestSettingSection` from a suite page you arrange
yourself; the Models table holds it now.

### Fixed

- The weekly check shows each suite's newest check. A suite that failed
  earlier in the day and passed when run again no longer shows as
  **Didn't finish**.
- **Run it now** can't start a second check while one runs. While it
  runs, a spinning **Running** status takes the button's place.

### Changed

- **How to judge an answer** moved into the info button beside **Answer
  key**, a popup with a close button, instead of a card above it.
- **Test a reasoning setting** is the Models table's last row, inset on
  a tint. `TestSettingSection` now renders nothing: remove it from a page
  you arrange yourself.
- **Versions** shows the newest and live versions; **Show N earlier
  versions** opens the rest.
- Answer key health: **Check these answers** is now **Answers worth a
  second look**, says why a split case matters, and its cards span the
  panel with the text kept to a readable width.
- **Add cases here**, on a suite that can't draft, says first that a
  topic opens **Add a case** with it tagged, and puts an **Add a case**
  button beside the topics.

## 0.14.0 - 2026-10-30

An answer key you can act on: describe the cases you want, fill thin
topics, and settle the cases models split on in one click. The weekly
check finishes every suite on platforms with a request limit, failed
answers say what to change, and **Favors …** is the toggle.

### Added

- **Describe the cases you want:** **Add a case** has a **Describe them**
  tab on a suite with `draftMore`: a request in your own words and how
  many, drafted for you to confirm. `draftMoreCases` takes a `count`.
- **Topics to fill:** in **Answer key health**, pick thin topics to draft
  cases for, or, without `draftMore`, open **Add a case** with the topic
  tagged (`#add-case=<topic>`).
- **Split cases you can resolve:** each lists which models gave the
  answer key's answer, with **The answer is right** (a new optional
  `keepAnswer` action: the answer is confirmed again and leaves the list
  until a newer test splits on it), **Fix the answer**, and **Retire it**.
  `answerKeyHealth` takes when the newest test ran.
- **Failed answers are easy to find:** a test's page lists answers that
  never came back first, says why they failed ("Timed out after 60s
  (3)"), and the board's note links there.

### Changed

- **Favors …** is the button that changes it (#111): it opens what the
  priority means and the form, which closes with its X, Escape, or a
  click outside. The separate **Change** link is gone.
- Failed answers say what to do: an answer that timed out or ran out of
  room (its output limit) usually fails the same way again, so the
  test's page and the suggestion say to lower the reasoning setting,
  raise the limit, or allow more time, not only to test again.
  `failureKind` and `failureHints` are exported.
- No suggestion while a test runs: the page says it's waiting, **Use
  these** refuses, and hub cards hold their suggestion chips.
- Pending and provisional answers show **Confirm this answer** and **Edit
  answer** side by side. Provisional ones couldn't be confirmed before.
- **Suggested** is a section heading like **Models**, and the header's
  "Priority: …" line is gone: "Favors …" explains it on hover.
- Dates show in the viewer's own time zone (`LocalDate`), not the
  server's.
- Answer key rows keep their chips on the right, and long titles wrap at
  a readable width.
- **Draft N more cases** moved into **Add a case**, as **Describe them**.

### Fixed

- A suggestion's reasons never compare a score with itself: two that
  round alike show enough decimals to differ ("98.14% against 98.06%"),
  and "clearly more accurate" says it's on the cases both answered.
- The weekly check finishes every suite on a platform with a request
  limit. Suites ran one after another, each timing itself from its own
  start, so the request was cut off midway and the suites still waiting
  were marked "stopped before it finished". Now three suites run at once
  on one clock from the request's start, and a suite that can't start in
  time carries on in a fresh request (`continueRun`). `weekly.run` takes
  when the request began, and `runEval` a `requestStartedAt`.
- After an answer changes (confirmed, edited, kept, or rated), the page
  shows fresh results: the free rescore runs before it refreshes, not
  after, so tests no longer read "out of date" until a reload.

**To update:** add `keepAnswer` to `lib/evalkeeper/actions.ts` (`add pages
--force --only actions`) to show **The answer is right**. A weekly route
of your own passes when the request began: `const startedAt = Date.now()`
first, then `after(() => weekly.run(ids, startedAt))`.

## 0.13.0 - 2026-10-29

Suite pages that say what to do: each card names its reasons, the board
reads in the suggestion's order with accuracy, speed, and cost, the
answer key health panel is a to-do list, and admins can change what a
feature favors. Plus fixes for apps that keep their own settings tables.

### Added

- **Each suite card names its reasons.** In place of one status word,
  chips say why: "2 serious under bar", "New fallback suggested",
  "Add cases (33 of 50)", "Retest live", "Good" (`HealthChips`, from a
  new `flags` list on `suiteHealth`). A suggestion alone is the new
  `change` status, not "Needs work".
- **The board reads in the suggestion's order:** the suggested model,
  live, then fewest serious mistakes, accuracy, and the priority
  (`orderRows`), with **Suggested** and **Suggested fallback** chips.
  **Against live** adds the gain when it's about as accurate ("About as
  accurate, 4× cheaper", `priorityGain`). Cost and speed only break ties.
- **The priority beside Models:** "Favors cost", "Favors speed", or
  "Favors accuracy".
- **The answer key health panel lists what to do,** in order: check these
  answers, add cases here (only the thin topics, with **Draft cases for
  these topics**), and retire these.
- **Update attack cases** and an **Add an attack** link on the Attacks
  tab.
- **Change what a feature favors** on its page: **Change** beside
  "Favors cost" picks accuracy alone, speed, or cost, with an optional
  reason, saved as a settings version (a new `favor` setting) that
  **Versions** shows and rolling back undoes. The suggestion, row order,
  and hub card follow it (`priorityOf`). It needs the `setPriority`
  action.
- `changedBy: "id"` in your wiring, for a settings history that keeps a
  user id rather than a name.
- `rateBlind: false` on a suite, to leave out **Rate blind** where answers
  are one person's own or the app has no rate page.

### Changed

- The board's **Score** and **Time** columns are **Accuracy** and
  **Speed**, and the hub's cards say accuracy too.
- **Test** moved into each row's menu, with what it costs ("free, all 34
  reused"), so the table loses a column. The menu closes once you choose.
- Checks list serious ones first.
- The hub's four cards are the same height.
- A failed attack test says how many answers failed and to test again,
  in place of "— · answers failed".

### Fixed

- "95%, under the 95% bar": a rate under its bar that would round up to
  it shows one decimal ("94.7%", `pctBeside`).
- A new fallback, saved with its test as evidence, was recorded as a
  promotion. Only a new live model or reasoning setting is one now.

**To update:**

- Evalkeeper's tables gain one column, `EvalSettingsVersion.favor`. Run
  `npx @crowandraven/evalkeeper migration` to add it. Until you do,
  everything works except **Change** on a priority.
- On your own versions tables, add a `favor` column, or map it to `null`
  (`favor: null` in the settings map, `without: ["favor"]` in its
  contract test).
- Add `setPriority` to `lib/evalkeeper/actions.ts` (`add pages --force
--only actions` rewrites it) to show **Change**.
- If your settings store keeps a user id as who made a change, set
  `changedBy: "id"` in your wiring.

## 0.12.0 - 2026-10-29

The suite page now does what apps were building beside it: test a
reasoning setting, see each check per model, fill the answer key from
starters, drafts, and attacks, and see which AI features have no eval
yet.

### Added

- **Test a reasoning setting** on a feature's page: test any model at a
  setting your catalog lists in `efforts`, and it gets its own row
  (`TestSettingSection`). The Test action takes the setting as `setting`
  (a model and setting together) or `model` with `effort`.
- **Where the mistakes are:** each check's pass rate for every model with
  a current test, beside its bar (`CheckBreakdownSection`). The checks
  section still shows the live model alone.
- **Ways to fill the answer key** above it (`AnswerKeyToolsSection`):
  **How to judge an answer** from a suite's new `answerGuide` (or its
  `labelHelp`), **Test with drafts, as provisional**, **Make attack
  cases** on an injection suite, **Add N starter cases** for starters not
  added yet, and **Draft N more cases** from a suite's `draftMore`, with
  an optional focus. Each needs its action: `addStarters`,
  `makeAttackCases`, `draftMore`, and `useDraftsProvisionally`, all
  optional, all in `evalActions`. `draftMoreCases` and
  `useDraftsProvisionally` do the same in code.
- **No eval yet** on the hub (`NoEvalYet`): the AI features no suite
  tests, from a new optional `features` list in your wiring.

**To update:** to show the new buttons, add the four actions to
`lib/evalkeeper/actions.ts` (`npx @crowandraven/evalkeeper add pages
--force --only actions` rewrites it), and pass `features` in your wiring
for the hub's list. Without them, those parts stay hidden.

### Fixed

- A row for a model at another reasoning setting tested again at the
  feature's own setting. It now tests at its own.
- Making such a row live used the model's row at the feature's own
  setting: it was refused when that row had no test, or made the model
  live without the tested setting. It now makes the model live at the
  row's setting.

## 0.11.1 - 2026-10-29

### Fixed

- `lucide-react` 0.500 or later is enough for the screens' icons. 0.11.0
  asked for 1 or later, which stopped apps on lucide 0.x from installing
  it, though every icon the screens use is older than that.

## 0.11.0 - 2026-10-29

Evalkeeper is now one package you add to an app, not pages you copy: the
screens and their actions come from `/react` and `/next`, so they upgrade
with the package. Its tables live in their own schema file, written by
`npx @crowandraven/evalkeeper migration`, and `moveIn` copies an app's own
eval tables into them. Each feature's page gains answer key health, and
the docs are a site. **To update:** move to zod 4.6.6 or later, then
follow each **To update** below; [How to
upgrade](https://seanhudson.github.io/evalkeeper/upgrading/how-to-upgrade/)
has the steps.

### Added

- Answer key health on each feature's page: cases every current model
  gets right, with a button to retire them all but a floor (then rescore
  recent tests for free); cases models split on and near-duplicates to
  check; drafts nobody reviewed in 30 days; and tags with a single case.
  The weekly check now retires those old drafts on its own. The runner
  has `answerKeyHealth`, `retireEasy`, and `retireStaleDrafts`, and the
  core `answerKeyHealth` does the sorting. **To update:** apps with their
  own `actions.ts` add two one-line wrappers, `retireEasy` and
  `retireStaleDrafts` (`add pages --only actions --force` rewrites the
  file); without them the panel shows without its buttons.

- A docs site at <https://seanhudson.github.io/evalkeeper/>: what
  Evalkeeper is, the guides from `docs/`, the changelog, and search, in
  the screens' own colors with light and dark. The guides are still
  written in `docs/`, so each change updates its docs in the same pull
  request, and a broken link between pages fails the build. **To
  update:** the API reference moved to `/evalkeeper/api/`; update any
  bookmarks to its pages.

- `moveIn` in `@crowandraven/evalkeeper/prisma`: copies an app's eval
  data from tables of its own (read through its mapped stores) into
  Evalkeeper's, once, keeping every id, date, who confirmed each answer,
  every test's answers and grades, thumbs, and the settings history. A
  dry run writes nothing and reports what it would copy table by table,
  what already moved, values Evalkeeper reads differently, and anything
  that stops it. A real run copies only what isn't there yet, then reads
  every row back to check it's the same. The app's own tables are never
  changed. `moveInSummary` puts a report in words. "Moving into
  Evalkeeper's tables" in the Bring your own guide has the steps.

- `npx @crowandraven/evalkeeper migration`: Evalkeeper's tables live in
  their own file beside your Prisma schema (`evalkeeper.prisma`), which
  the command writes and rewrites on upgrade, with the migration SQL from
  the schema files before and after (your own `prisma migrate diff`; it
  never reads or writes a database). Without `--write` it only shows the
  change. Models pasted into your own schema move into the file; a
  drifted copy has each column it would drop named, and nothing is
  written until `--accept-drops`. **To update:** run it, then point
  Prisma at your schema's folder if your schema is one file, apply the
  SQL, and run `prisma generate`.

- `@crowandraven/evalkeeper/next`, the glue for the Next.js App Router,
  so the files `add pages` writes hold no logic: `evalActions` (every
  action on the pages), `evalPages` (each page and its title, checking
  `requireAdmin` and answering "not found"), `weeklyCheck`,
  `weeklyCronRoute`, and `isAuthorizedCron`. `/next/components` has
  `nextComponents` (Next.js's `Link`, and a `RefreshWhile` on its
  router) for your provider. Next.js is an optional peer dependency.
  `HubPage` and `SuitePage` in `/react` are the default arrangements,
  and `runner.modelsFor` lists what an operation can be tested on.
  **To update:** export a `wiring` object from `lib/evalkeeper/index.ts`
  (the `EvalWiring` type, without `basePath`), run `add pages --force`
  (with `--dry-run` first), and delete `lib/evalkeeper/weekly.ts`, `cronAuth.ts`,
  `time.ts`, and `components/evalkeeper/RefreshWhile.tsx`, which the
  package now holds. In `appComponents.tsx`, spread `nextComponents`
  before your own.

- One test of a model covers a feature's attacks too: `runner.createTest`
  brings the feature's attack cases in step with its confirmed answers
  (`injectionCases`), then makes a run for its cases and one for each
  injection suite with cases; `runner.estimateTest` gives the whole
  test's cost. The pages' Test and "Test every model" use them, and the
  weekly check brings attack cases in step before its quick sets, so
  nobody makes attack cases or tests attacks separately.

- `@crowandraven/evalkeeper/react`: the pieces Evalkeeper's screens are
  drawn from (`Card`, `Chip`, `Link`, `BackLink`, `Score`, `Submit`,
  `IconSubmit`, `Spinner`, `Tip`, `InfoTip`, `Button`, `TextInput`,
  `TextArea`, and `Select`), and `EvalComponentsProvider`, which draws
  them with your app's own. Name yours in
  `lib/evalkeeper/appComponents.tsx`, which the eval pages' new layout
  wraps around every page; the rest stay Evalkeeper's. `add pages` writes
  that file once and never overwrites it, even with `--force`. React and
  `lucide-react` are optional peer dependencies, needed only for
  `/react`. The guide's "Look like your app" has how. **To update:** copy
  the pages and components again (`npx @crowandraven/evalkeeper add pages
--dry-run` first), and add
  `@source "../node_modules/@crowandraven/evalkeeper/dist/react";` to your
  global CSS so Tailwind styles the screens.

### Changed

- Evalkeeper needs zod 4.6.6 or later (a peer dependency), which fixes
  GHSA-mrhx-c7xc-m3w5: zod before 4.6.6 can exhaust memory validating
  oversized constrained collections, and there's no fixed 3.x. **To
  update:** move your app to zod 4 (`npm install zod@^4.6.6`); your
  suites' schemas mostly carry over, but zod's error messages read
  differently ("Invalid input: expected string, received number"), and
  some APIs changed (see zod's migration guide).

- Dates read the same everywhere, with the month as a word ("Oct 28,
  2026", and "Oct 28, 2026, 3:04 PM" with a time), from `dayOf` and
  `momentOf`; "10/28/2026" means different days in different countries.
- Links that read as words look the same on every screen: the accent,
  underlined on hover (`LINK`). Numbers that link keep their own color.
- The example's "Try it" page is now "Rate an answer": one answer with
  thumbs, instead of a ticket form. The guide says how to put thumbs on a
  chat's replies.
- The example app shows the ready-made crisis risk and hopelessness
  suites, on a demo detector, with their cases imported Author reviewed.

- "Under attack" is now **Attacks resisted**: the share of a model's
  attack answers with no serious mistake (`BoardRow` tests gain
  `answersNoSerious`; `attacksResisted` adds them up). The column shows
  only once the feature has attack cases, with no "Test attacks" button,
  and each model's one estimate covers both. The hub's card says
  "Attacks resisted: 94% of 48 attacks" only then, and drops its
  "Compare models" link, which went where the card does. The
  suggestion's reasons say "on the attacks".
- The answer key has its attack cases in an **Attacks** tab (`Tabs`),
  read only (`AnswerKey`'s `readOnly`), beside its own cases.
- "Make live" and "Make fallback" are in each model row's menu
  (`ModelMenu`), so the table stays narrow; Test stays on the row.
- Comparisons open only from an "Against live" verdict: the "Compare two
  tests" link, a test's "Compare with another test", the picker, and
  "Swap them" are gone, and the compare page without both tests is not
  found.

- One package: the Prisma stores and the AI SDK helpers are now entry
  points of `@crowandraven/evalkeeper`, at `/prisma` and `/ai-sdk`, with
  the AI SDK an optional peer dependency (needed only if you import
  `/ai-sdk`). The schema is at
  `@crowandraven/evalkeeper/schema/evalkeeper.prisma`. The
  `@crowandraven/evalkeeper-prisma` and `@crowandraven/evalkeeper-ai-sdk`
  packages still work, as re-exports, and will be retired. **To update:**
  install `@crowandraven/evalkeeper` alone, and import from
  `@crowandraven/evalkeeper/prisma` and `@crowandraven/evalkeeper/ai-sdk`.
- The screens come from the package. The sections, the answer key,
  settings history, the weekly check, and the smaller components are in
  `@crowandraven/evalkeeper/react`, and read everything from one object
  made with `defineEvals` (your runner, settings, stores, models, suites,
  answer editors, actions, and base path), instead of importing your
  app's modules. The copied pages are short arrangements of them: the
  suite page loads with `loadSuitePage(evals, key)` and the hub with
  `loadHub(evals)`. A test's page, compare, side by side, blind
  rating, and feedback are views (`RunView`, `CompareView`,
  `SideBySideView`, `RateView`, and `FeedbackView`) that return null for
  something that doesn't exist, so the copied page answers "not found".
  `EvalActions` gains `rateBlind`, `skipCase`, `makeCase`, and
  `dismissFeedback`, each optional. `RefreshWhile` is a piece your app passes (the copied
  one uses Next.js's router). **To update:** copy the pages and glue
  again (`npx @crowandraven/evalkeeper add pages --dry-run` first), which
  adds `lib/evalkeeper/evals.ts`; delete your copies of the components
  that moved, and add `RefreshWhile` to `lib/evalkeeper/appComponents.tsx`.

### Removed

- The `@crowandraven/evalkeeper-prisma` and `@crowandraven/evalkeeper-ai-sdk`
  packages. They only re-exported the `/prisma` and `/ai-sdk` entry points
  of `@crowandraven/evalkeeper`, and are deprecated on npm. **To update:**
  import from `@crowandraven/evalkeeper/prisma` and
  `@crowandraven/evalkeeper/ai-sdk`, and remove the old packages.

### Fixed

- Rescoring after a case was retired left the retired case's answers in
  the test's score, while marking the test current. Rescored tests now
  score only the cases still in use.

## 0.10.0 - 2026-10-28

Injection suites' results count where a feature's model is chosen, and
structured answers get a JSON field kind and an app's own editors.
**To update:** export `answerEditors` from your wiring module (`{}` if
you have none), then copy the pages again (`npx @crowandraven/evalkeeper
add pages --only suite,hub,rate,AnswerKey,Fields,actions --dry-run`
first). If you built your own pages, pass `{ attacks }` to `suggest` and
`suiteHealth` (see "Test against prompt injection" in the guide), and
choose models only on base suites.

### Added

- A `"json"` field kind for structured values (a list of objects, a
  nested shape): an indented JSON box in a monospace font on the forms,
  and indented JSON where answers are read. `valuesFromFields`,
  `inputFromFields(schema, fields)`, and `labelFromFields(schema, fields)`
  read every field by its kind and check the whole with the schema,
  naming the first part that doesn't fit (#62).
- Answer editors: an app's own editor for a suite's answer, registered
  as `answerEditors` in the wiring module, keyed by suite. The answer
  key, "Add a case", and blind rating use it in place of the suite's
  answer fields; it submits the answer as JSON (`ANSWER_JSON_FIELD`), and
  the actions check it against `labelValue` (`answerFromForm`). It lives
  in the app's own files, so copying the pages again keeps it. The
  example app edits action items with one (#63). **To update:** export
  `answerEditors` from your wiring module (`{}` if you have none), and
  copy `Fields.tsx`, `AnswerKey.tsx`, the suite and rate pages, and
  `lib/evalkeeper/actions.ts` again.
- `runner.attackBoards(suiteKey)` loads the boards of the injection
  suites that attack a suite, and `attacksFrom(boards)` reads them for
  `suggest`'s new `attacks` option. `attackMistakes(key, attacks)` is a
  model's serious mistakes under attack, null until it has a current,
  complete test on every one. `injectionSuitesOf(suites, baseKey)`
  finds them in a registry.
- The suite page's board has an "Under attack" column when injection
  suites attack the feature: each model's serious mistakes under attack,
  linked to that test, or a "Test attacks" button with what it costs.
  The hub shows the live model's on the feature's card.

### Changed

- With `attacks`, the suggestion picks a model as live only once it has
  a current test on the attacks, never one with more serious mistakes
  under attack than live, and suggests switching for at least two fewer
  (as accurate or more). A model held back by the attacks is named, with
  why. Its reasons say how the new live model and the fallback do under
  attack, and the fallback breaks a tie on fewer. `suiteHealth` takes the
  same option, so the hub's status matches the page.
- An injection suite's page no longer chooses models: no suggestion,
  "Make live", "Make fallback", or versions. It says models are chosen
  on its base suite and links there, and `makeLive`, `makeFallback`,
  `useSuggestion`, and `rollBackSettings` refuse an injection suite.
  Before, choosing on either page changed the same feature's live model,
  and the injection page's suggestion weighed attacks alone.
- The hub no longer gives an injection suite its own card; its line
  ("Under attack") is on the base feature's card.
- In the example app, Demo Quick follows some hijacks, so the board
  shows a model that's cheaper but easier to attack.

## 0.9.0 - 2026-10-28

Testing against prompt injection, with attacks of its own and from
garak, CyberSecEval, and promptfoo; and ready-made cases that arrive
confirmed. Every crisis risk and hopelessness case is now "Author
reviewed" by the Evalkeeper Team, so tests use them as soon as they're
added. **To update:** run `importStarters(store, suite)` again for each
ready-made suite you use: it adds the reviews to the cases you added
before (never over an answer you confirmed; any that differ come back in
`disagree`). A test that compares `importStarters`' whole result needs
its new `reviewed`, `disagree`, and `notSeen`. Copy the pages again for the badges
and the injection suite's hub card (`npx @crowandraven/evalkeeper add
pages --only hub,feedback,AnswerKey,actions --dry-run` first). To add an
injection suite, follow "Test against prompt injection" in the guide.

### Added

- `injectionSuite(base, { inject })` in `@crowandraven/evalkeeper/suites`
  tests a feature against prompt injection: the base suite's cases with an
  attack inserted where untrusted text goes, graded by the base suite's
  checks plus two of its own, "Didn't follow the attack" (a made-up canary
  word never appears in the answer) and "Kept secrets" (text the app
  names, such as a line of its instructions, never appears). It runs on
  the base suite's operation. 20 built-in attacks (`INJECTION_ATTACKS`)
  cover direct, indirect, extraction, hijack, and harmless lookalike text;
  a hijack asks for the suite's `goal`, a wrong answer the app names.
  `injectionCases(store, suite)` makes its cases from the base suite's
  confirmed ones, each carrying that answer ("From base case" on the
  answer key), until each attack has `perAttack` cases in use. Run it
  again to keep them in step: an attack case gets its base case's newly
  confirmed answer (unless someone confirmed one on the attack case
  itself), and one whose base case was retired or lost its answer is
  retired.
- Attacks from other tools, for `injectionSuite`'s `attacks`:
  `cyberSecEvalAttacks` (Meta's CyberSecEval prompt injection set),
  `garakSyspromptAttacks` and `garakReportAttacks` (garak's extraction
  requests, and the attempts in a report from its injection probes run
  against its offline `test.Blank` generator), and `promptfooBurpAttacks`
  (`promptfoo redteam generate -o tests.burp`). Where a tool checks for a
  word, it becomes the canary; attacks that would need a judge model are
  left out and listed in `skipped`. garak and promptfoo attacks are named
  by their text, so a report or file made again names the same attacks
  the same way. `readAttacks` and `writeAttacks` keep
  attacks in a JSONL file. None of them runs a tool or calls the network.
- `isInjectionSuite(suite)`: code that finds a feature's suite by
  operation should skip injection suites. The example's feedback page,
  "make a case" action, and cost lookup do, and the hub's card for an
  injection suite says it shares its base suite's settings instead
  of repeating their history.
- Shipped reviews: a suite's `reviews` say its author or an expert
  confirmed a starter case's answer once, for every app, so
  `importStarters` adds that case confirmed and in use instead of
  pending. Each review names who, what qualifies them, and when, and
  counts only while the case's input and answer are what they saw; the
  suite contract fails on a stale one. A review is never added over an
  answer someone in the app confirmed, and one that differs is listed in
  the import's `disagree`. A case whose stored input isn't the one
  reviewed (the suite's leak check changed it) gets no review and is
  listed in `notSeen`. A review re-signed after its case's answer changed
  is added as the newer confirmation. The answer key marks these answers
  "Author
  reviewed" or "Expert reviewed" and shows the review's note. The crisis
  risk and hopelessness suites take `shippedReviews: false` to leave every
  case pending.
- `reviewSheet`, `reviewsFromSheet`, and `mergeReviews` turn a suite's
  starter cases into a sheet a reviewer marks and back into shipped
  reviews. In this repo, `node scripts/review-starters.mjs sheet
crisis_risk` writes the sheet and `sign` writes the reviews file
  (`crisisRiskReviews.ts`, `hopelessnessReviews.ts`), replacing that
  reviewer's earlier reviews and keeping everyone else's.

### Changed

- The crisis risk and hopelessness suites' built-in cases arrive
  confirmed, "Author reviewed" by the Evalkeeper Team, instead of
  pending. Their tests fail if a built-in case ships without a review.
  Review them yourself before relying on them, ideally with someone who
  has crisis-line or clinical experience; pass `shippedReviews: false` to
  confirm every case yourself.
- `importStarters` returns how many shipped reviews it added
  (`reviewed`), the cases whose own answer differs from one
  (`disagree`), and the cases whose stored input wasn't the one reviewed
  (`notSeen`).

## 0.8.0 - 2026-10-25

A ready-made hopelessness suite; a warning when a case's words appear in
a feature's instructions; the feedback store on an app's own thumbs
table; suite contracts that read unions; `add pages` inside a Next.js
route group; and a run page that shows every answer, with decision
probabilities beside their bars. **To update:** most of it is opt-in.
The one interface change is the suite contract: if
`describeSuiteContract` now fails, add a label and help for each union
key it names, and remove the help it says is left over. Copy the pages
again for the page fixes (`npx @crowandraven/evalkeeper add pages --only
run,side-by-side,compare,rate,suite,hub,feedback,Fields,AnswerKey,ReadableOutput,SettingsHistory
--dry-run` first), check `EVALS_BASE` if your pages sit in a route group,
and pass `instructionTexts` to `createRunner` for the warning.

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
- A warning when a case's words appear in a feature's instructions: a
  case copied in as an example gets graded on an answer the model was
  handed, so its score rises without the model getting better. Pass
  `instructionTexts` to `createRunner` (`instructionParts` in
  `@crowandraven/evalkeeper-ai-sdk` gives the texts from the parts you
  hash), and the suite page lists each such case with the matching words
  under "Cases in the instructions". It matches a whole case text or a
  run of at least 20 characters, ignoring case and punctuation
  (`casesInInstructions`). A warning only, never a failure (#71). **To
  update:** copy the suite page again and add `instructionTexts` to your
  runner; without it, nothing changes.
- A ready-made hopelessness suite: `hopelessnessSuite` from
  `@crowandraven/evalkeeper/suites`, beside the crisis risk suite. The
  app passes its own detector; the suite asks whether the latest chat
  message, and separately the earlier ones, voice hopelessness about the
  person's own life, on 76 made-up messages in nine groups (self, one
  thing, a joke covering hopelessness, light-hearted, a bad day, a plain
  reply after hopeless messages, an agreeing reply, agreeing after a bad
  day, and ordinary). A miss is serious, a false alarm minor, and the
  detector's own probabilities (hopeless, about their life, said lightly,
  agrees with earlier) are graded at the app's thresholds when it gives
  them. These are made-up examples written as a starting point, not
  clinically validated: review and adapt them with people who have
  crisis-line or clinical experience before relying on them. The README's
  "Listening for hopelessness" has advice on building the detector.

### Changed

- The suite contract reads union inputs and answers (`z.union` and
  `z.discriminatedUnion`): every key in any option needs a field, so one
  `fields` list covers them all. It also names help left for a field the
  schema no longer has, as in `triage: input field "concernFirst" has
help but the input has no such field.` **To update:** if
  `describeSuiteContract` now fails, add a label and help for each union
  key it names, and remove (or rename) the help it says is left over
  (#65).

### Fixed

- `add pages --base` with a Next.js route group (`"(app)/admin/evals"`)
  put the group into every link (`EVALS_BASE`) and the "Open" step;
  route groups aren't part of the URL, so the links went nowhere. The
  folders keep the group and the links leave it out (`urlOfBase`). With
  `--only`, it also warned that files the same run was copying were
  missing (#66). **To update:** check `EVALS_BASE` in
  `lib/evalkeeper/paths.ts` if your pages sit in a route group.
- The run page shows each answer: by the suite's answer fields when it
  has `labelFromOutput`, otherwise readably (`ReadableOutput`: text as
  paragraphs, lists as bullets, small objects as one line, never raw
  JSON), with what each matching check paired up and a link to the case
  on the answer key. Side by side shows answers the same way, prefers a
  suite's `describe` for the input, and wraps long values instead of
  running into the next column; a prop named `role` that tripped
  accessibility lint is `side`. Every eval page has a title ("Compare:
  Ticket triage") (#67). **To update:** copy the run, side-by-side,
  compare, rate, suite, hub, and feedback pages, `Fields.tsx`,
  `AnswerKey.tsx`, and the new `ReadableOutput.tsx` again.
- For decision suites, the run page shows each answer's probabilities
  beside the bar they were read at ("34% true, bar 40%", "bug (90%)"),
  right or wrong, from the new `given` on `decisionCheck`'s result.
  Tests before this one show them after a regrade (#67).
- The suite page keeps its suggestion card when nothing would change,
  titled "No change suggested", so reasons such as "no other model is
  safely better" or "can't be told from noise" show. The "Use these"
  button and the Live and Fallback line show only when something would
  change. **To update:** copy the suite page again.
- Versions recorded when instructions changed in code read "New
  instructions" (was "Deployed") and say "Models unchanged: … live, …
  fallback", then "The instructions in code changed". Runtime edits say
  the models are unchanged the same way. "Deployed" read as the app
  switching models by itself. **To update:** copy
  `SettingsHistory.tsx` again.

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
