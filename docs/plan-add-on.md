# Plan: Evalkeeper as an add-on that stays in step

A plan for building Evalkeeper into an add-on. The decisions at the end
are settled.

## The goal

Evalkeeper is an add-on for TypeScript and React apps, Next.js first. It
brings the evals screens and logic, looks like the app it's added to,
finds what the app already has to evaluate, and upgrades by a version
bump.

## Why this is needed

Evalkeeper hands an app three things to copy: its pages (`add pages`),
its Prisma models ("copy these models into your schema"), and, for an
app that had evals before, a map onto the app's own tables. Each copy is
a fork:

- **Pages drift.** An app copies them at one version, edits a few lines
  (a layout, a missing feature, its own form style), and stops
  re-copying, because every upgrade is now a merge. New features arrive
  in the example app and never reach it, and fixes made in the app never
  reach Evalkeeper.
- **Tables drift.** An app that pasted the models changes them with its
  own migrations, and one that kept its own tables keeps its own names,
  types, and missing values. The mapped stores bend to each, so an app
  can be a release behind in its data without knowing it: a status it
  can't store, a column it maps to nothing.
- **Fixes don't travel.** Everything an app adds beside the copied pages
  is written once, for that app, even when every app needs it.

## Principles

1. An app never edits Evalkeeper's code, its pages, or its tables.
2. What an app needs that Evalkeeper lacks is either general, so it goes
   into Evalkeeper, or the app's own, so it goes in a slot.
3. Everything Evalkeeper ships upgrades with the package version: logic,
   screens, and schema.
4. Nothing is changed in an app without showing what will change first.

## Screens: four layers

1. **Defaults that work with no setup.** Evalkeeper ships basic
   components (buttons, cards, inputs, tables, chips, tooltips, and
   toasts), styled with color tokens as today, and complete default
   pages: the hub, a suite, a test, compare, side by side, blind rating,
   and feedback. An app with nothing gets working screens on day one.
2. **The app's own components.** An app hands Evalkeeper its own button,
   card, input, table, or toast in one provider, one at a time or all at
   once. The pages are then built from the app's parts, so they look and
   behave like the rest of the app, conventions included.
3. **The app's own arrangement.** Each default page is a short
   arrangement of sections: the model table, the suggestion, attack
   results, checks, versions, the answer key, and the weekly check. An
   app that wants another layout arranges the same sections, and adds
   its own beside them. A guide shows how, and the default pages are the
   worked examples. **The sections hold all the logic; apps only arrange
   them,** so a custom page still upgrades.
4. **Copying as a last resort.** `add pages` stays for an app that needs
   total control, and the docs say a copied page no longer upgrades.

## Data: one schema, owned by Evalkeeper

- **The schema ships as its own file, never pasted.** With Prisma, it's
  a file beside the app's schema (`prisma/evalkeeper.prisma`, with Prisma
  pointed at that folder) that the CLI writes and rewrites on upgrade, with
  a header saying not to edit it. Relations to the app's own models (a
  user who confirmed an answer) are ids, not foreign keys, so the file
  needs nothing from the app's schema.
- **Each release says what its schema changed,** and the CLI writes the
  migration SQL from the old schema file to the new one, never from a
  database: `evalkeeper migration` prints it for the app's own migration
  tool. A release with no schema change says so.
- **Evalkeeper's tables hold everything it keeps:** cases, answers,
  tests, answers to tests, judgments, versions of each feature's
  settings, and thumbs. An app's model router reads the live settings
  from Evalkeeper (`settings.route`), as the guide already recommends.
- **Moving in from an app's own tables.** For an app whose eval data
  lives in tables of its own, a guided move, run once:
  1. `moveIn` with `dryRun`, from a short script of the app's (only
     its code knows how its tables map), reads the app's tables through its
     current map (today's mapped store, kept for this alone) and says
     what it would copy, row by row and table by table, and what doesn't
     fit: a status Evalkeeper lacks, a column with no home, rows that
     don't parse (the read-only check that exists today).
  2. The app adds Evalkeeper's schema and migrates, on a copy of its
     data first.
  3. `moveIn` for real copies everything into Evalkeeper's tables,
     keeping ids, who confirmed each answer and when, and every test's
     results, then checks the counts and that each table reads back the
     same. It's safe to run again: rows already moved are skipped.
  4. The app switches its stores to Evalkeeper's and keeps its old
     tables, unread, until a person decides to drop them.

  Values with no home in Evalkeeper (a column only one app used) stay in
  the app's own tables, which the move never changes, so nothing is
  lost. Carrying them across as JSON on each row is left until an app
  needs them in Evalkeeper's screens.

- **Mapped stores retire** once the move-in exists: they stay only to
  read an app's old tables during the move, and new apps are never
  pointed at them.

## One package, optional parts

Everything ships in one package, `@crowandraven/evalkeeper`, with one
version and one changelog, so its parts can't fall out of step. Each
part is an entry point an app imports only if it wants it:

| Import                              | What it is                                                 | Needs       |
| ----------------------------------- | ---------------------------------------------------------- | ----------- |
| `@crowandraven/evalkeeper`          | the core: types, checks, statistics, suggestions           | nothing     |
| `…/runner`, `…/suites`, `…/testing` | as today                                                   | nothing new |
| `…/react`                           | screens, sections, default components, and the provider    | React       |
| `…/next`                            | route and server action glue                               | Next.js     |
| `…/prisma`                          | the stores and the schema file                             | Prisma      |
| `…/ai-sdk`                          | instructions hashing, pricing, judging, and the AI Gateway | the AI SDK  |

React, Next.js, Prisma, and the AI SDK are optional peer dependencies:
an app installs the ones its entry points need, and an entry point it
never imports is never loaded. The root entry stays as pure as the core
is today, which becomes the rule in AGENTS.md.

The Prisma and AI SDK packages published today stay for a while as thin
re-exports of their entry points, so apps using them keep working until
they switch.

**The AI Gateway, when it comes, is an option in `…/ai-sdk`,** not a
package: model names as the gateway knows them in the model catalog,
prices from the gateway, and calls routed through it. An app that
doesn't use the gateway is unaffected.

## Framework glue

- **React components, framework-free.** Screens take their data and
  actions through the provider and props, so they work in any React
  app.
- **Next.js first.** `…/next` and the CLI generate the route files and
  one server actions file, each a few lines with no logic, written once
  and rewritten only when their shape changes.
- **Other frameworks later**, as more entry points doing the same job.

## `init`: adding it to an app that already has things to evaluate

`npx @crowandraven/evalkeeper init` looks at the project before writing
anything, and proposes:

- **What to evaluate:** the app's AI calls, found by their SDK calls,
  each as a suggested operation and a suite to start from.
- **Where models are chosen:** an existing router or settings, to wire
  as the runner's `route` and `candidates`, or Evalkeeper's settings if
  there's none.
- **Existing eval data:** tables or files to move in.
- **Who's an admin:** the app's own auth check, for `requireAdmin`.
- **Its components:** the app's buttons, cards, inputs, and so on, for
  the provider.

It shows the plan, writes only what the person accepts, and leaves the
rest as next steps.

## Upgrades

`npm install @crowandraven/evalkeeper@latest`, then `npx
@crowandraven/evalkeeper upgrade`, which rewrites the schema file and
generated glue, prints any migration SQL, and lists what the release
changed. An app owns only its wiring, its provider, its slots, and its
suites, so there's nothing to merge.

## Docs

Full docs, published with each release on the GitHub Pages site that
already hosts the API reference, built from `docs/` in the repo, so
every change to code changes its docs in the same pull request:

- **Start here:** what Evalkeeper is, and adding it to a new app or one
  that already has AI features, eval data, or a model router (`init`).
- **Screens:** the default pages, swapping in the app's components (the
  provider's shape, piece by piece), and building your own pages from
  sections, with a recipe per page.
- **Data:** the schema, upgrading it, and moving in from an app's own
  tables, step by step.
- **Suites:** writing one, checks, ready-made suites, and testing
  against prompt injection.
- **Upgrading:** what each release changed and what to run, from the
  changelog.
- **The API reference,** as today.

The docs for each released version stay online, so an app reads the
docs for the version it's on.

## Order of work

1. **Sections.** Split today's pages into sections that hold the logic,
   with the example app's pages rebuilt from them, its browser tests
   passing unchanged.
2. **Components and the provider.** Default components, and the provider
   that swaps them, proved by a second theme in the example.
3. **The entry points and glue.** `…/react` and `…/next`, and `…/prisma`
   and `…/ai-sdk` moved in from their packages. The example app moves
   off copied pages onto them.
4. **One schema file and `evalkeeper migration`.** Then `moveIn`, tried
   on a copy of an app's real data before any production move.
5. **`init` and `upgrade`.**
6. **Docs,** written alongside steps 1 through 5 and published with each
   release.
7. **Features apps built for themselves, done once here:** testing a
   reasoning setting, each check per model, answer-key health, buttons
   for starter cases and drafts, a suite's answer guide, operations
   with no suite, code as the fallback, and attack cases kept in step
   automatically, with one Test for a model's cases and attacks.

Each step is a release. Apps move when they choose, and an app on copied
pages and mapped tables keeps working until it does.

## Risks

- **Server actions from a package.** The generated actions file is the
  plain pattern that works today, and needs proving in step 3 first.
- **Components from the app.** Apps' buttons and inputs take different
  props, so the provider needs a small, documented shape for each, and
  a test page in the example that renders every section with a swapped
  set.
- **Moving data.** Every move-in runs on a copy first, says what it will
  do before doing it, keeps the old tables, and never touches a
  production database without the person's go-ahead at the time.
- **Peer versions.** React and Next.js become peer dependencies, so an
  app on an older version waits until it upgrades.

## Decisions (settled)

1. **One package with entry points** for every part, each optional
   (replacing separate packages for the screens and the glue). The AI
   Gateway, when added, is an option in `…/ai-sdk`.
2. **Settings and thumbs live in Evalkeeper's tables too,** not only the
   eval data. An app's model router reads the live settings from
   Evalkeeper.
3. **Mapped stores are kept only for moving in.** New apps are never
   pointed at them.
4. **One Test** runs a model on a feature's cases and its attack cases
   together, with one estimate.
5. **Copying pages stays as a documented last resort,** and a copied
   page no longer upgrades.
6. **The docs live in the repo's `docs/`,** published on GitHub Pages
   with each release, rather than the GitHub wiki.
