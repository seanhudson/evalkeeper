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

## 2. Describe your models

A `ModelCatalog` lists each model's label, provider, price per million
tokens (with its source, and cached-input prices where the provider has
them), the reasoning settings it accepts, and when the
provider retires it (`retiring: "2027-01"`). Retiring models are never
suggested.

## 3. Add the tables

Copy the models from `packages/prisma/schema/evalkeeper.prisma` into your
Prisma schema and write a migration from the schema file. Then:

```ts
const store = prismaStore(prisma);
```

Not on Prisma? Implement `EvalStore` (see `packages/core/src/store.ts`)
on your database; `memoryStore.ts` is a complete example.

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
and writes nothing.

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
