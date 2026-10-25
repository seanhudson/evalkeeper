# Adding Evalkeeper to your app

These steps assume TypeScript, a server that can run background work, and
a database. The adapters cover Prisma and the Vercel AI SDK; anything else
means writing a small store or a few lines of glue. Stop after each step
and check it works.

## 1. Route every AI call through named operations

Each AI feature needs a name and a way to run on a model you choose:
`triage(input, { model })`. If feature code picks its model inline today,
move that choice to one place (a table, config, or env vars) that says
which model each operation runs on and its fallback. Evalkeeper reads
that route for its board; your app keeps owning it.

Record what each call costs (the AI SDK's `usage` priced with your
catalog: `costOf` in `@crowandraven/evalkeeper-ai-sdk`) and pass it to the suite's
`onCost`, so tests show real cost per answer.

Or let Evalkeeper keep it: `createSettings({ store, defaults })` with
`prismaSettingsStore(prisma)` (the optional `EvalSettings*` tables) keeps
each feature's settings as versions with a history and rollback, and its
`settings.route` is the runner's `route`. Your AI calls read
`settings.route(operation)` too, and call `settings.syncPrompt(operation)`
where they do, so a deploy (DEPLOY) or a runtime edit (INSTRUCTIONS) that
changed the instructions is recorded, dated when it's noticed.
If your call sites read a settings row of your own, which a script, SQL,
or an older admin page can change without a version, pass `readActual`
to `createSettings`: reading or saving settings compares that row with the
live version first, and records a mismatch as found (OUTSIDE), so a
rollback can always get back to it. Your save calls `update` or `rollBack`
first and writes the row after, or the new settings read as changed
outside.
If your models are chosen in an admin page and stored in your own table,
return null from `defaults` and record each row once with
`settings.seed(operation, settings, { by: null, reason })`; it does
nothing for a feature that already has a version, so the import can run
again. If your app keeps versions with a history already, point
`prismaSettingsStore` at your tables instead (see "Bring your own"
below).

## 2. Describe your models

A `ModelCatalog` lists each model's label, provider, price per million
tokens (with its source, and cached-input prices where the provider has
them), the reasoning settings it accepts, and when the
provider retires it (`retiring: "2027-01"`). Retiring models are never
suggested.

To see whether a model beats the code it backs up (a matcher, a rules
engine), add that code as a catalog entry with `baseline: true` and a
`run` that calls it. The board compares it like any model, but it's never
suggested as live or as the fallback.

## 3. Add the tables

Copy the models from `packages/prisma/schema/evalkeeper.prisma` into your
Prisma schema and write a migration from the schema file. Then:

```ts
const store = prismaStore(prisma);
```

Already have eval tables of your own? Keep them, and map Evalkeeper onto
them (see "Bring your own" below). Not on Prisma? Implement `EvalStore`
(see `packages/core/src/store.ts`) on your database; `memoryStore.ts` is
a complete example.

## 4. Hash each operation's instructions

```ts
export const triageVersion = instructionsHash({
  texts: [SYSTEM, prompt({ subject: slot("subject"), body: slot("body") })],
  schemas: [outputSchema],
});
```

Include everything the model is told besides its settings: the system
text, prompt templates with placeholders instead of data, and output
schemas and tool descriptions. `promptVersion` must hash everything the
model receives, including what's added or replaced at runtime: an admin
override of the prompt, or edited guidance injected at call time.
Otherwise a test looks current after what it tested changed. Hash the
runtime part on its own and join the two with `promptVersionOf`, so
versioned settings can tell a runtime edit (INSTRUCTIONS) from a deploy
(DEPLOY):

```ts
promptVersion: async (op) =>
  promptVersionOf({
    code: PROMPT_VERSIONS[op],
    runtime: await guidanceHash(op), // null when there's none
  }),
```

## 5. Write your first suite

Pick the AI feature people would notice most if it got worse. Write its
input and answer shapes with zod, two or three checks (at least one
serious), `run`, and `grade`. Keep grading pure where you can, and unit
test it: a low score is often the grader's fault. Give every field of the
input and answer a plain label and help (`fields`), and every check a
description; `describeSuiteContract("our suites", SUITES)` from
`@crowandraven/evalkeeper/testing` fails until they're there, and checks
your starter cases fit their schemas.

Start with 10 to 20 real cases, with personal details removed. Confirm
each answer yourself. Grow toward 50.

**Cases you already have.** Test data in files, or a suite's `starter`
cases, comes in with `importCases` (or `importStarters(store, suite)`).
Map each row to the suite's input and answer; every row is checked
against the suite's schemas before anything is written, and a rerun skips
rows it imported before (by `source` and row id), retired ones included.
Use `split: "DEV"` for the cases you tune against, `"TEST"` for a
held-out file, and the default `"auto"` for new cases. Run it against your
development database only.

```ts
await importCases({
  store,
  suite: ticketTriage,
  source: "tickets-heldout.json",
  rows,
  map: (r) => ({
    id: r.id,
    input: { body: r.text },
    label: { queue: r.queue },
  }),
  split: "TEST",
});
```

Answers arrive pending: a person confirms each on the pages. If the owner
says "use them so you can test, I'll review later", pass
`answers: { status: "PROVISIONAL", rater, allowedBy }`. Tests use them,
every score says it rests on unreviewed answers, and each row is tagged
`needs-review`.

**Answers people already reviewed.** An app moving from its own harness
into Evalkeeper's tables (rather than mapping its tables, see "Bring your
own") may have an answer key people reviewed there. Import those answers
confirmed, reading who confirmed each one and when from its row:

```ts
await importCases({
  store,
  suite: ticketTriage,
  source: "old-harness",
  rows,
  map,
  answers: {
    status: "CONFIRMED",
    confirmedBy: (r) => r.reviewer,
    at: (r) => r.reviewedAt,
  },
});
```

The import is refused unless every row names a person and a date (never
one in the future); neither is ever filled in for you. The person is
recorded as the answer's rater, and its note says it was imported as
reviewed, from where, by whom, and on what date. Use this only for answers
a person confirmed in the old system: answers an agent drafted or scraped
from somewhere stay pending.

**Leave out what a case learned from itself.** A case frozen from your
app's data can carry its own answer: facts the app learned from the
person's reaction to that same item, or a help desk's note written after
the ticket was sorted. Give the suite a `withoutLeaks` that removes them;
`importCases`, `importStarters`, and the "Add a case" form run it before
freezing, `removed` in the import's result lists what came out of each
case, and the case's note says so, for a person to check. Match on
something specific to the case (the company's name), not something
general (a job title), or it removes what other cases rightly share.

```ts
export const ticketTriage: Suite<Ticket, Triage, Triage> = {
  // …
  withoutLeaks(input) {
    const lines = input.body.split("\n");
    const leaked = (l: string) => l.startsWith("Internal note:");
    return {
      input: { ...input, body: lines.filter((l) => !leaked(l)).join("\n") },
      removed: lines.filter(leaked),
    };
  },
};
```

**Cases edited as JSON.** A fixture suite (`caseKind: "fixture"`) edits
each case as JSON in one field. `inputFromJson(schema)` and
`labelFromJson(schema)` read the `input` and `label` fields, parse them,
and check them with the schema, with a plain error when a field is empty,
isn't JSON, or doesn't fit ("Input doesn't fit at facts, item 2, text:
…"):

```ts
inputFromForm: inputFromJson(profileSchema),
labelFromForm: labelFromJson(fitSchema),
```

**Cases from your app's own data.** When the cases are items your app
already handled (and the answers are what someone did with them), set
the suite's `caseKind: "imported"` and have people rate them blind: the
answer key then links to a "Rate blind" page (`rate`) that shows one
case's input at a time, never the app's output, and takes an answer, a
reason, or a skip. Each rating is that person's own confirmed answer.

When an agent drafts the answers, two habits catch most mistakes: have it
list the cases it's unsure of, so a person reviews those first, and check
every expected term against the input. In one app, 43 of 218 drafted terms
were things the input never said.

## 6. Create the runner

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

The continue route checks a secret, answers at once, and calls
`runner.runEval(runId, opts)` in the background (`after()` in Next.js).

## 7. Add the pages

```bash
npx @crowandraven/evalkeeper add pages --base admin/evals
```

It reads your `tsconfig.json` import alias (`@/*`, `~/*`, and code under
`src/` all work) and copies:

- the pages, at the base you choose (`app/admin/evals/…`)
- their components (`components/evalkeeper/…`), including
  `evalkeeper.css` with the colors the pages use
- their glue (`lib/evalkeeper/actions.ts`, `weekly.ts`, `cronAuth.ts`,
  `time.ts`, and `paths.ts` with your base path)
- the weekly check's cron route (`--no-cron` to leave it out)
- a starter `lib/evalkeeper/index.ts`, only if you don't have one

Existing files stay as they are unless you pass `--force`, which still
never touches your `lib/evalkeeper/index.ts`. `--dry-run` shows the plan
and writes nothing. `--only` copies just the pages and components you
name, for an app that keeps its own (see "Bring your own" below).

Then:

1. Import the colors into your global CSS, right after Tailwind:
   `@import "../components/evalkeeper/evalkeeper.css";`
2. Fill in `lib/evalkeeper/index.ts`: your Prisma client, models, suites,
   and `requireAdmin`. Every page and action calls `requireAdmin` first,
   and the starter's refuses everyone until you write yours.
3. Restyle the pages as you like; they're yours now.

## 8. Add thumbs to your AI answers (optional)

Add the `EvalFeedback` model from the schema and create
`prismaFeedbackStore(prisma)`. If your app already records thumbs in its
own table, map it instead ("Your own thumbs table" under "Bring your
own"). Put a thumbs up and down on each AI answer
(`examples/next/components/evalkeeper/Thumbs.tsx`), with a server action
that looks the answer up by its id, never trusting what the browser sends,
and calls `feedbackStore.rate(...)` with the person's id.

To let ratings become cases, keep the input behind each answer, in the
suite's input shape, with names and contact details removed, and only
when the person agreed. Pass it as `input`, and the answer as `output`.
Give suites whose outputs look like answers a `labelFromOutput`, so a
thumbs up can propose the model's answer. The feedback page
(`examples/next/app/evals/feedback`) lists ratings and makes cases with
`caseFromFeedback`.

## 9. Test decision models (optional)

For a feature that uses the AI SDK's decisions, write a suite with
`decisions: true`. In `run`, call `decideAndPrice` from
`@crowandraven/evalkeeper-ai-sdk` (it calls `experimental_decide` and prices the call
from your catalog) and return the answers. In `grade`, call
`decisionCheck(key, answer, expected)` for each question. Mark each
model in the catalog with `decisions: "native"` or `"prompted"`, and have
`modelsFor(operation)` in `lib/evalkeeper/index.ts` return only decision
models for these features. `examples/next/lib/suites/ticketRouting.ts` is
a full example.

## 10. Keep it honest

- Retest after you change a prompt or a model ships; rescore after you
  change an answer or a check (free).
- Schedule the weekly check. Call `runner.startDriftCheck(suite)` for
  each suite (it records the test, so a page can show it running), then
  `runner.runEval(id, { fresh: true })` for each, from a cron route that
  checks a secret (`examples/next/app/api/cron/evals-weekly`, scheduled in
  `examples/next/vercel.json`). Show `weeklySummary(...)` on your hub; it
  flags drift, unfinished checks, retiring models, and thumbs-down.
- Let suites draft cases from real use (optional). Give a suite
  `draftFromActivity({ since, existing, limit, known })` that returns up
  to `limit` inputs your feature saw since `since`, each with a proposed
  answer or `null`, a note for the reviewer, and a `sourceRef` (the id in
  your app it came from); skip any `sourceRef` in `known`. Remove names,
  contact details, account numbers, and anything identifying from each
  input, and use only inputs people agreed to share. The weekly job calls
  `runner.draftFromActivity(suite.key)` for each suite (default 5 a week);
  drafts arrive pending, are never added twice, and the hub links to
  them. Pass `cases` to `weeklySummary` so it counts them.
  `examples/next/lib/suites/ticketTriage.ts` drafts from tickets people
  tried and agreed to keep.
- Read failures before changing a prompt.

## Bring your own

An app that had evals before Evalkeeper (its own tables full of reviewed
answers, its own router, versions, thumbs, or pages) keeps them. Each piece below
is chosen on its own.

### Your own eval tables

Keep your rows where they are, and give `prismaStore` a map of where your
tables differ from Evalkeeper's. Leave out anything named the same.

```ts
import {
  prismaStore,
  prismaJudgmentCache,
} from "@crowandraven/evalkeeper-prisma";

const map = {
  // models: { evalCase: "goldCase" }, // if your models are named differently
  fields: {
    evalCaseLabel: { note: "rationale" },
    evalRun: { set: "split", startedBy: "startedById" },
  },
};
export const store = prismaStore(prisma, map);
export const judgmentCache = prismaJudgmentCache(prisma, map);
```

- **Names.** `models` gives each table's model as your client spells it
  (`prisma.goldCase` is `"goldCase"`). `fields` gives column names per
  table, keyed by Evalkeeper's field; on cases, `labels` is the relation
  to their answers.
- **Types convert on their own.** Decimal columns (costs) read as
  numbers, Prisma enums as their names, and `tags` may be a `String[]` or
  a `Json` column. A run whose set is null reads as ALL, and a missing
  grader version as empty, so rows your old harness wrote still read.
- **Columns you lack.** Map a field to `null` when your table has no
  column for it (nullable fields only): it reads as null, and writing a
  value fails instead of losing it. Run temperature and output cap are
  the usual ones; add them as nullable columns if you'll test those
  settings, or map them to `null` if you won't.
- **Columns Evalkeeper lacks** (a creator, a quick-set flag, legacy
  results) are left alone, so they need a default or to be nullable.
- **Statuses your enum lacks.** Evalkeeper writes its own status names
  (an answer can be REJECTED, and rating blind writes SKIPPED). If your
  enum lacks one, add the value, or that write fails.
- **Check it.** Two checks, read-only first:

  1. **Does it read what's there?** `prismaReadCheck` reads each suite's
     cases, answers, tests, and outputs through your map, without writing
     anything, and lists every value that doesn't parse (an unknown
     status, a cost that isn't a number, a missing column), with counts.
     The store itself reads such a value as a default, so this is where
     you see it. Pass your suites (not just their keys) to also check
     each input and answer against the suite's own schemas, the way your
     code reads them. It's safe on a copy of real data:

     ```ts
     import { prismaReadCheck } from "@crowandraven/evalkeeper-prisma";
     import { describeMappedReadCheck } from "@crowandraven/evalkeeper/testing";

     describeMappedReadCheck(
       "our answer key",
       () => prismaReadCheck(prisma, map, { suites: SUITES }),
       { suites: SUITES.map((s) => s.key) },
     );
     ```

     Or print it once: `readCheckSummary(await prismaReadCheck(...))`
     gives a line per suite with its counts, and each problem once with
     how many rows have it.

  2. **Does it write and read back?** The store contract writes and
     reads back cases, answers, tests, and outputs, with `without` naming
     any setting you mapped to `null`. It needs an empty store each time,
     so `make` empties the tables: run it only on a throwaway local
     database made from your schema file (`prisma db push` to a new
     local database, since an app's migrations may not build from
     empty), never on development or production data. Before emptying
     anything, check the database's name in the URL `make` uses, and
     tell whoever's watching which database it is and that it will be
     emptied, before running it:

     ```ts
     const url = process.env.CONTRACT_DATABASE_URL ?? "";
     // Stop before emptying anything but the throwaway database.
     const name = new URL(url).pathname.slice(1);
     if (name !== "evals_throwaway")
       throw new Error(`Won't empty ${name}: it isn't the throwaway database.`);
     const throwaway = new PrismaClient({ datasources: { db: { url } } });

     describeStoreContract(
       "our tables",
       async () => {
         await emptyEvalTables(throwaway); // your deleteMany calls, children first
         return prismaStore(throwaway, map);
       },
       { without: ["temperature", "maxOutputTokens"] },
     );
     ```

     To run it on a database that holds other rows (a shared development
     database), scope it instead: every suite and feature it writes
     starts with the scope, its tests never look past their own rows, and
     `deleteScopedRows` deletes only rows whose names start with the
     scope (compared exactly, whatever the database's pattern matching
     does). `make` then returns the store as it is, emptying nothing:

     ```ts
     import { deleteScopedRows } from "@crowandraven/evalkeeper-prisma";

     describeStoreContract("our tables", () => prismaStore(prisma, map), {
       without: ["temperature", "maxOutputTokens"],
       scope: "contract-",
       cleanup: (scope) => deleteScopedRows(prisma, scope, { map }),
     });
     ```

     Pick a scope none of your own suites or features start with.

  Not on Vitest? Every contract takes your test functions:
  `{ test: { describe, it, expect: assertExpect, afterAll: after } }`
  with `describe`, `it`, and `after` from `node:test` and `assertExpect`
  from `@crowandraven/evalkeeper/testing`. Vitest stays optional.

**Costs:** a map, and nullable columns for what you want to keep that you
don't have. The request hash that reuses identical answers may differ from
your old harness's, so the first test of each model after the move pays
for its answers again, once.

If you'd rather move your rows into Evalkeeper's tables, import them with
`importCases` (step 5), and bring answers people reviewed in as confirmed
with who and when from each row.

### Your own router

The runner never calls a model or picks one for your app; it asks your
code. Pass your router's functions as callbacks: `route` (what's live for
an operation), `candidates` (which models may be tested), `promptVersion`
(your instructions' hash), and, on a platform with a request limit,
`continueRun` (step 6). Each suite's `run` calls your own AI function with
the model it's given and reports its cost through `onCost`.

**Costs:** a few lines of glue. Your failover, usage records, and
billing stay as they are; mark eval calls so they aren't billed to a user.

### Your own versions

If your app already keeps versions of each feature's settings with a
history (an admin page that changes models, say), point
`prismaSettingsStore` at those tables, so Evalkeeper's rollback and
history read the same record as your page:

```ts
export const settingsStore = prismaSettingsStore(prisma, {
  models: {
    evalSettingsVersion: "operationVersion",
    evalSettingsLive: "operationLive",
    evalSettingsChange: "operationChange",
  },
  fields: {
    evalSettingsVersion: { temperature: null }, // no column for it
    evalSettingsChange: { by: "userId" },
  },
  by: {
    toColumn: (by) => by, // the pages pass the admin's id as `by`
    fromColumn: async (id) =>
      (await prisma.user.findUnique({ where: { id } }))?.name ?? null,
  },
});
```

Your tables need a number per version unique per feature, a live pointer
per feature, and a change log with its kind (CHANGE, PROMOTE, ROLLBACK,
DEPLOY, OUTSIDE, or INSTRUCTIONS; an enum is fine). An enum made before
OUTSIDE and INSTRUCTIONS existed can't hold them: add both to it with a
migration, or list what it holds in the map's `kinds` (say `kinds:
["CHANGE", "PROMOTE", "ROLLBACK", "DEPLOY"]`), and a kind it can't hold is
stored as CHANGE with the real kind in the evidence column, and read back
as itself. Without either, saving one fails with a message saying so.
`by` converts who made a change both ways
when your table keeps a user id instead of a name. Check it with
`describeSettingsStoreContract(name, make, { without: ["temperature"] })`,
on a throwaway database or scoped as above (pass `{ map, settingsMap }`
to `deleteScopedRows`).

**Costs:** a map, and the `by` callbacks if you keep user ids. Saving a
version with a setting you have no column for fails, so leave that
setting out of your forms.

### Your own thumbs table

If your app already records thumbs up and down, point
`prismaFeedbackStore` at that table, so the weekly summary's alerts and
the hub's counts read the ratings you already have. A typical table is
`{ id, userId, operation, targetId, rating (an enum UP/DOWN), reason,
excerpt, createdAt, updatedAt }`, with no inputs:

```ts
export const feedbackStore = prismaFeedbackStore(prisma, {
  models: { evalFeedback: "aiFeedback" },
  fields: {
    evalFeedback: {
      raterId: "userId",
      // Columns the table doesn't have.
      input: null,
      output: null,
      status: null,
      caseId: null,
    },
  },
  // ratings: { UP: "up", DOWN: "down" }, // if your values differ
});
```

What a thumbs table needs depends on what you want from it:

- **Alerts and counts** (the weekly summary's thumbs-down alerts, the
  hub's counts) need only the rating, the feature (`operation`), and the
  time (`updatedAt`), plus who rated which answer (`raterId` and
  `targetId`), so each person has one rating per answer.
- **Turning ratings into cases** needs the input behind each answer,
  kept only with the person's consent, with names and contact details
  removed. Without an `input` column, each rating reads with
  `keepsInputs: false`, and the feedback page says "This app doesn't keep
  inputs with ratings, so a rating can't become a case."
- **Marking ratings looked at** (dismissed, or made into a case) needs a
  `status` column (text, default "OPEN") and a nullable `caseId`. Without
  `status`, every rating reads as OPEN, and marking one fails with a
  message saying what to add.

Map a column to `null` only when the table lacks it: it reads as null,
and writing a value fails instead of losing it, so leave that field out
of your rating action (`reason` and `excerpt` can be `null` too). An app
table without a unique key on (`raterId`, `operation`, `targetId`) still
keeps one rating per person per answer: a mapped store finds the rating
before writing it. Check it with `describeFeedbackStoreContract(name,
make, { without: ["input", "output", "status", "caseId"] })`, on a
throwaway database or scoped as above (pass `{ feedbackMap }` to
`deleteScopedRows`).

**Costs:** a map. Ratings without inputs can't become cases; add a
nullable `Json` column for inputs (and ask for consent) when you want
them to.

### Your own pages

Copy only the pages and components you're replacing, and keep your own:

```bash
npx @crowandraven/evalkeeper add pages --base admin/evals --only suite,run,AnswerKey --dry-run
```

`--only` takes pages by name (hub, suite, run, rate, compare,
side-by-side, feedback, cron), components and glue by name (AnswerKey,
actions, evalkeeper.css, …), the groups `pages` and `components`, and
`index` for a starter wiring module (left out otherwise). `--dry-run` lists what would be written, skipped,
or overwritten, and names anything the chosen files import that your app
doesn't have yet.

**Costs:** restyling what you copy, and keeping the copied files' imports
pointed at what you have.
