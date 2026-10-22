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
where they do, so a deploy that changed the instructions is recorded.
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
schemas and tool descriptions. Anything else that shapes an answer (an
admin-edited rule injected at call time) belongs in the hash too.

## 5. Write your first suite

Pick the AI feature people would notice most if it got worse. Write its
input and answer shapes with zod, two or three checks (at least one
serious), `run`, and `grade`. Keep grading pure where you can, and unit
test it: a low score is often the grader's fault.

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
`needs-review`. Nothing is imported confirmed.

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
`prismaFeedbackStore(prisma)`. Put a thumbs up and down on each AI answer
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
- Read failures before changing a prompt.

## Bring your own

An app that had evals before Evalkeeper (its own tables full of reviewed
answers, its own router, versions, or pages) keeps them. Each piece below
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
  (an answer can be REJECTED). If your enum lacks one, add the value, or
  that write fails.
- **Check it.** Run the contract against the mapped store on a copy of
  your data, with `without` naming any setting you mapped to `null`:

  ```ts
  describeStoreContract("our tables", () => prismaStore(prisma, map), {
    without: ["temperature", "maxOutputTokens"],
  });
  ```

**Costs:** a map, and nullable columns for what you want to keep that you
don't have. The request hash that reuses identical answers may differ from
your old harness's, so the first test of each model after the move pays
for its answers again, once.

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
or DEPLOY; an enum is fine). `by` converts who made a change both ways
when your table keeps a user id instead of a name. Check it with
`describeSettingsStoreContract(name, make, { without: ["temperature"] })`.

**Costs:** a map, and the `by` callbacks if you keep user ids. Saving a
version with a setting you have no column for fails, so leave that
setting out of your forms.

### Your own pages

Copy only the pages and components you're replacing, and keep your own:

```bash
npx @crowandraven/evalkeeper add pages --base admin/evals --only suite,run,AnswerKey --dry-run
```

`--only` takes pages by name (hub, suite, run, feedback, cron),
components and glue by name (AnswerKey, actions, evalkeeper.css, …), the
groups `pages` and `components`, and `index` for a starter wiring module
(left out otherwise). `--dry-run` lists what would be written, skipped,
or overwritten, and names anything the chosen files import that your app
doesn't have yet.

**Costs:** restyling what you copy, and keeping the copied files' imports
pointed at what you have.
