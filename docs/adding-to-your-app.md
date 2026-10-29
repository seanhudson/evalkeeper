# Adding Evalkeeper to your app

These steps add Evalkeeper to a TypeScript app, one at a time. Stop after
each step and check it works. Check [Before you start](before-you-start.md)
first for what it needs.

> [!TIP]
> **Let your coding agent do it.** Evalkeeper ships instructions written
> for coding agents (Claude Code, Cursor, Codex, and others). Paste this
> into yours, and it works through the setup one step at a time, stopping
> after each so you can check it:
>
> ```text wrap
> Add Evalkeeper to this app. Follow
> https://github.com/seanhudson/evalkeeper/blob/main/AGENTS.md#adding-evalkeeper-to-an-app
> one step at a time, and stop after each step so I can check it.
> ```

Already have eval tables, a model router, or eval pages? Read [Bring
your own](bring-your-own.md) before step 1.

## Install

```bash
npm install @crowandraven/evalkeeper
```

## 1. Route every AI call through named operations

To compare models on a feature, Evalkeeper has to run that feature on a
model it picks, and know which model your app has live. This step gives
each AI feature a name and one place that says which model it runs on.

**Do this**

Give each AI feature a name (an "operation"), and let it take the model
as an argument:

```ts
triage(input, { model });
```

Then choose where your app says which model each operation runs on. There
are two ways:

| Way                                                                                                   | Who owns the choice | You get                                                    |
| ----------------------------------------------------------------------------------------------------- | ------------------- | ---------------------------------------------------------- |
| [Your own place](#keep-the-choice-in-your-own-place) (a table, config, or env vars)                   | Your app            | The simplest setup                                         |
| [Evalkeeper's versioned settings](#if-you-want-evalkeeper-to-keep-versions-of-each-features-settings) | Evalkeeper          | A history of every change, and rollback to any earlier one |

Whichever you pick, [record what each call
costs](#record-what-each-call-costs).

**Check it works:** your feature still answers when you pass it a model
by name.

### Keep the choice in your own place

If feature code picks its model inline today, move that choice to one
place: a table, config, or env vars.

That place says two things for each operation:

- which model it runs on
- its fallback

Evalkeeper reads that route for its board. Your app keeps owning it.

### If you want Evalkeeper to keep versions of each feature's settings

Evalkeeper can keep each feature's settings for you, as versions with a
history and rollback. Use `createSettings({ store, defaults })` with
`prismaSettingsStore(prisma)`. That store uses the optional
`EvalSettings*` tables.

Then wire it in three places:

- Its `settings.route` is the runner's `route`.
- Your AI calls read `settings.route(operation)` too.
- Where your AI calls read it, they also call
  `settings.syncPrompt(operation)`.

`syncPrompt` keeps the history honest when instructions change under the
same settings. It records the change, dated when it's noticed, as one of
two kinds:

- **DEPLOY**: a deploy changed the instructions in code.
- **INSTRUCTIONS**: a runtime edit changed them.

To tell the two apart, hash the instructions as in
[step 4](#4-hash-each-operations-instructions).

#### If something else can change your settings row

Your call sites may read a settings row of your own. A script, SQL, or an
older admin page can change that row without making a version.

In that case, pass `readActual` to `createSettings`. Then:

- Reading or saving settings first compares that row with the live
  version.
- A mismatch is recorded as found (**OUTSIDE**), so a rollback can always
  get back to it.

Your save must call `update` or `rollBack` first, and write the row
after. Otherwise the new settings read as changed outside.

#### If your models are chosen in an admin page

Your models may be chosen in an admin page and stored in your own table.
In that case:

1. Return null from `defaults`.
2. Record each row once with
   `settings.seed(operation, settings, { by: null, reason })`.

`seed` does nothing for a feature that already has a version, so the
import can run again.

#### If your app already keeps versions

If your app keeps versions with a history already, point
`prismaSettingsStore` at your tables instead. See [Bring your
own](bring-your-own.md#your-own-versions).

### Record what each call costs

Tests show the real cost of each answer when you report it. Price the AI
SDK's `usage` with your catalog, using `costOf` from
`@crowandraven/evalkeeper/ai-sdk`. Pass the result to the suite's
`onCost`.

## 2. Describe your models and their prices

Evalkeeper shows what every answer costs, and what a test will cost
before you start it. It never looks prices up itself: it uses the ones
you list.

**Do this**

List the models your app can use in a `ModelCatalog`. For each one, give:

- its label
- its provider
- its price per million tokens, with where the price came from
- the reasoning settings it accepts
- when the provider retires it

[Models and prices](models.md) has the fields, where prices come from,
and how costs are counted.

**Check it works:** your catalog type-checks as a `ModelCatalog`, with
every model your app calls in it.

### If you want to compare models with code

You may want to see whether a model beats the code it backs up, such as
a matcher or a rules engine. Add that code as a catalog entry with:

- `baseline: true`
- a `run` that calls it

The board compares it like any model. It's never suggested as live or as
the fallback.

## 3. Add the tables

Evalkeeper keeps your cases, tests, and answers in its own tables. This
step adds them to your database.

**Do this**

See what it would write:

```bash
npx @crowandraven/evalkeeper migration
```

When it looks right, write it:

```bash
npx @crowandraven/evalkeeper migration --write --out prisma/migrations/20261029000000_evalkeeper/migration.sql
```

This writes `evalkeeper.prisma` and the SQL. Then:

1. If your schema is one file, point Prisma at its folder so it reads
   both: `schema: "prisma"` in `prisma.config.ts`, or
   `"prisma": { "schema": "prisma" }` in `package.json`.
2. Apply the SQL with your migration tool (`prisma migrate deploy` for a
   file in your migrations folder), on a copy of your data first.
3. Run `prisma generate`.

Then make the store:

```ts
const store = prismaStore(prisma);
```

**Check it works:** run `npx @crowandraven/evalkeeper migration` again.
It says "Already up to date: nothing to change."

### Details

- Evalkeeper's tables live in their own file beside your Prisma schema,
  `evalkeeper.prisma`. Evalkeeper writes it and rewrites it on upgrade;
  you never edit it.
- The tables work on PostgreSQL, MySQL, and SQLite.
- They relate to your own models by id only, so the file needs nothing
  from your schema.
- The first command shows what it would write and the migration SQL. The
  SQL is worked out by your own `prisma migrate diff`, from the schema
  files before and after.
- The command never reads or writes a database.

### After each upgrade

Run the same command after each upgrade. It rewrites the file and writes
only what changed.

If you pasted Evalkeeper's models into your own schema before, it moves
them into `evalkeeper.prisma`.

If your copy drifted, it names every column it would drop, with its
data. It writes nothing until you pass `--accept-drops`.

### If you have your own tables or another database

- **Already have eval tables of your own?** Keep them, and map
  Evalkeeper onto them (see [Bring your own](bring-your-own.md)).
- **Not on Prisma?** Implement `EvalStore` (see
  `packages/core/src/store.ts`) on your database. `memoryStore.ts` is a
  complete example.

## 4. Hash each operation's instructions

A test is only current while the instructions it tested are. Hashing
them lets Evalkeeper tell when a test has gone out of date.

**Do this**

```ts
export const triageVersion = instructionsHash({
  texts: [SYSTEM, prompt({ subject: slot("subject"), body: slot("body") })],
  schemas: [outputSchema],
});
```

Include everything the model is told besides its settings:

- the system text
- prompt templates, with placeholders instead of data
- output schemas
- tool descriptions

**Check it works:** change a word of the system text, and the hash
changes.

### If instructions can change at runtime

`promptVersion` must hash everything the model receives, including what's
added or replaced at runtime, such as:

- an admin override of the prompt
- edited guidance injected at call time

Otherwise a test looks current after what it tested changed.

Hash the runtime part on its own, and join the two with
`promptVersionOf`. Then versioned settings can tell a runtime edit
(INSTRUCTIONS) from a deploy (DEPLOY):

```ts
promptVersion: async (op) =>
  promptVersionOf({
    code: PROMPT_VERSIONS[op],
    runtime: await guidanceHash(op), // null when there's none
  }),
```

## 5. Write your first suite

A suite is how one feature gets tested: its cases, and how an answer is
graded. Start with one, so you see a real result soon.

**Do this**

Pick the AI feature people would notice most if it got worse. Then write:

- its input and answer shapes, with zod
- two or three checks, at least one of them serious
- `run`
- `grade`

Give every field of the input and answer a plain label and help
(`fields`). Give every check a description.

Add `describeSuiteContract("our suites", SUITES)` from
`@crowandraven/evalkeeper/testing` to your tests. It fails until the
labels, help, and descriptions are there. It also checks that your
starter cases fit their schemas.

Start with 10 to 20 real cases, with personal details removed. Confirm
each answer yourself. Grow toward 50.

**Check it works:** your suite contract test passes.

### Details

- Keep grading pure where you can, and unit test it. A low score is often
  the grader's fault.
- A union input or answer (`z.union`, `z.discriminatedUnion`) needs one
  field for every key in any of its options.
- Cases you already have (test data in files, an old harness, or your
  app's own data) come in with `importCases`. [Write suites](suites.md)
  has how, and everything else a suite can do.

## 6. Create the runner

The runner is what tests your models: it runs a suite's cases on each
model and grades the answers.

**Do this**

```ts
export const runner = createRunner({
  store,
  suites: [ticketTriage],
  models: MODELS,
  promptVersion: (op) => PROMPT_VERSIONS[op],
  // What the model is told, as text (instructionParts on the parts you
  // hash), so the suite page warns when a case was copied into it:
  instructionTexts: (op) => INSTRUCTION_TEXTS[op] ?? [],
  route: routeFor,
  candidates: (op) => ({ models: modelsFor(op) }),
  // On a platform with a request limit (Vercel: 300s), hand off long tests:
  requestLimitMs: 270_000,
  continueRun: (runId, opts) => postToYourContinueRoute(runId, opts),
});
```

**Check it works:** your app compiles with the runner in it. You'll see
it work in [step 7](#7-add-the-pages).

### If your platform limits how long a request runs

The last two options hand a long test off to a fresh request. Your
continue route:

1. checks a secret
2. answers at once
3. calls `runner.runEval(runId, opts)` in the background (`after()` in
   Next.js)

## 7. Add the pages

The pages are where you and your team see results, confirm answers, and
choose models.

**Do this**

```bash
npx @crowandraven/evalkeeper add pages --base admin/evals
```

Then:

1. Import the colors into your global CSS, right after Tailwind, and have
   Tailwind scan Evalkeeper's screens, which come from the package:
   `@import "../components/evalkeeper/evalkeeper.css";` and
   `@source "../node_modules/@crowandraven/evalkeeper/dist/react";`
   (both relative to that CSS file).
2. Fill in `lib/evalkeeper/index.ts`: your Prisma client, models, suites,
   and `requireAdmin`, gathered into the `wiring` it exports. Every page
   and action calls `requireAdmin` first, and the starter's refuses
   everyone until you write yours.
3. Make them look like your app with your own components ([Make the
   screens your own](screens.md)).

**Check it works:** signed in as an admin, open `/admin/evals`. The hub
lists your suite.

### What it writes

It reads your `tsconfig.json` import alias (`@/*`, `~/*`, and code under
`src/` all work) and writes a few short files.

The screens, their actions, and the weekly check all come from the
package. So these files hold no logic of their own, and they're what
upgrades leave alone:

- a route file per page, at the base you choose (`app/admin/evals/…`),
  each a few lines exporting one of `pages` (see [the
  example](#a-route-file))
- `lib/evalkeeper/actions.ts`: the server actions, one line each. Next.js
  takes server actions only from a `"use server"` module of your app, so
  each calls Evalkeeper's (`evalActions` from
  `@crowandraven/evalkeeper/next`)
- `lib/evalkeeper/evals.ts`, which makes `evals` (what the screens read)
  and `pages` from your wiring
- `lib/evalkeeper/paths.ts`, with your base path
- the weekly check's cron route (`--no-cron` to leave it out), which
  answers only `Authorization: Bearer $CRON_SECRET`
- `components/evalkeeper/evalkeeper.css`, the colors the screens use
- a starter `lib/evalkeeper/index.ts` (your wiring) and
  `lib/evalkeeper/appComponents.tsx` (your components), only if you
  don't have them

### Options

| Option      | What it does                                                                                             |
| ----------- | -------------------------------------------------------------------------------------------------------- |
| `--force`   | Overwrites existing files. It still never touches your `lib/evalkeeper/index.ts` or `appComponents.tsx`. |
| `--dry-run` | Shows the plan and writes nothing.                                                                       |
| `--only`    | Writes just the files you name (see [Your own pages](bring-your-own.md#your-own-pages)).                 |
| `--no-cron` | Leaves out the weekly check's cron route.                                                                |

Without `--force`, existing files stay as they are.

### A route file

A route file is this short:

```tsx
// app/admin/evals/[suite]/page.tsx
import { pages } from "@/lib/evalkeeper/evals";

export const dynamic = "force-dynamic";
export const generateMetadata = pages.suite.generateMetadata;
export default pages.suite.Page;
```

Each page checks `requireAdmin`, reads the URL, and answers "not found"
for a suite or test you don't have.

To make the screens look like your app, or rearrange a page, see [Make
the screens your own](screens.md).

## 8. Schedule the weekly check

Providers sometimes change a model quietly. Each week, each suite's quick
set runs again on its live model, so that change shows up as drift.

**Do this**

`npx @crowandraven/evalkeeper add pages` writes the cron route for you
(`examples/next/app/api/cron/evals-weekly`, scheduled in
`examples/next/vercel.json`). Schedule it with your platform's cron.

Show `weeklySummary(...)` on your hub. It flags:

- drift
- unfinished checks
- retiring models
- thumbs down

**Check it works:** call the route with
`Authorization: Bearer $CRON_SECRET`. It answers that the check started,
and the hub shows it running.

### If you write the route yourself

From a cron route that checks a secret:

1. Call `runner.startDriftCheck(suite.key)` for each suite. It records the
   test, so a page can show it running.
2. Call `runner.runEval(id, { fresh: true })` for each.

### If you want suites to draft cases from real use

This is optional. It turns what your feature saw this week into draft
cases for you to confirm.

Give a suite `draftFromActivity({ since, existing, limit, known })`. It
returns up to `limit` inputs your feature saw since `since`, each with:

- a proposed answer, or `null`
- a note for the reviewer
- a `sourceRef`: the id in your app it came from

Skip any `sourceRef` in `known`.

Keep people's details out:

- From each input, remove names, contact details, account numbers, and
  anything identifying.
- Use only inputs people agreed to share.

The weekly job calls `runner.draftFromActivity(suite.key)` for each
suite (default 5 a week). Then:

- Drafts arrive pending.
- They're never added twice.
- The hub links to them.

Pass `cases` to `weeklySummary` so it counts them.

`examples/next/lib/suites/ticketTriage.ts` drafts from tickets people
tried and agreed to keep.

### Keep the results honest

The habits that keep the results honest (when to retest, when to
rescore, reading failures before changing a prompt) are in
[Best practices](best-practices.md).

## Optional

- [Thumbs on your AI answers](thumbs.md#set-it-up), so ratings can
  become cases.
- [Decision models](suites.md#test-decision-models), graded on their
  probabilities.
- [Prompt injection](suites.md#test-against-prompt-injection), for
  features that read text they can't trust.
