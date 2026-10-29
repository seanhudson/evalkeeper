# Already have evals? Bring your own

Maybe your app had evals before Evalkeeper. You might already have:

- tables full of answers people reviewed,
- your own model router,
- a history of model changes,
- a table of thumbs up and down, or
- admin pages.

You don't have to throw any of it away. Choose each piece on its own:

- [Choosing a path for your eval data](#choosing-a-path-for-your-eval-data)
- [Moving into Evalkeeper's tables](#moving-into-evalkeepers-tables)
- [Your own eval tables](#your-own-eval-tables)
- [Your own router](#your-own-router)
- [Your own versions](#your-own-versions)
- [Your own thumbs table](#your-own-thumbs-table)
- [Your own pages](#your-own-pages)

## Choosing a path for your eval data

You've built an answer key and want to keep it. There are two ways:

|                 | Move in                                            | Map your tables                                                   |
| --------------- | -------------------------------------------------- | ----------------------------------------------------------------- |
| What happens    | Your rows are copied into Evalkeeper's tables once | Evalkeeper reads and writes your tables through a map             |
| Your old tables | Kept, unchanged, until you drop them               | Stay the live record                                              |
| Upgrades        | Bump the version and run `evalkeeper migration`    | Check each release for columns or statuses your tables can't hold |
| Best for        | Most apps                                          | An app that can't change where its data lives yet                 |

**Move in if you can.** A mapped table drifts. Each release can add a
column or a status yours can't hold. Then you're a release behind
without knowing it.

Moving in is a one-time copy. It keeps every id, date, and person, so
upgrades are routine from then on.

Most apps do both, in order: map first, to read their old data through
Evalkeeper, then move in.

Either way, start on a copy of your data, never production. Keep your
own tables until you've checked the result.

## Moving into Evalkeeper's tables

You want upgrades to be routine, not a hunt for columns your tables
can't hold. Move your eval data into Evalkeeper's tables once. From
then on, an upgrade is a version bump and `evalkeeper migration`.

The move keeps:

- every id and date,
- who confirmed each answer,
- every test's answers and grades,
- your thumbs, and
- your settings history.

It works in two halves. Your stores, mapped onto your tables as in
[Your own eval tables](#your-own-eval-tables), read everything. Then
`moveIn` writes it.

### Steps

1. **See what would move.** Add a short script and run it as a dry run
   against a copy of your data. A dry run writes nothing.

   ```ts
   // scripts/move-in.ts: npx tsx scripts/move-in.ts [--for-real]
   import { moveIn, moveInSummary } from "@crowandraven/evalkeeper/prisma";
   import { prisma } from "@/lib/prisma";
   import { SUITES } from "@/lib/suites";
   import { map, oldStore, oldThumbs, oldSettings } from "./oldStores";

   const report = await moveIn(
     {
       store: oldStore, // prismaStore(prisma, map): your tables, mapped
       feedbackStore: oldThumbs,
       settingsStore: oldSettings,
       suites: SUITES.map((s) => s.key),
       operations: [...new Set(SUITES.map((s) => s.operation))],
       tables: { db: prisma, map }, // so the check sees raw values
     },
     prisma,
     { dryRun: !process.argv.includes("--for-real") },
   );
   console.log(moveInSummary(report).join("\n"));
   ```

   The summary goes table by table. For each, it says:
   - how many rows it would copy, and how many already moved;
   - which values Evalkeeper reads differently, such as a status it
     doesn't have or a cost that isn't a number; and
   - anything that stops the move.

   Two things stop a move: a row pointing at one that isn't moving, and
   a settings history already in Evalkeeper's tables. Histories aren't
   merged.

2. **Add Evalkeeper's tables.** Run `evalkeeper migration`, and migrate
   the copy.

3. **Move, on the copy first.** Run the script with `--for-real`:

   ```bash
   npx tsx scripts/move-in.ts --for-real
   ```

   It copies only what isn't there yet, so it's safe to run again. Then
   it reads every row back and says whether each is the same.

4. **Switch your stores to Evalkeeper's.** Use `prismaStore(prisma)`
   with no map, and do the same for thumbs and settings.

### Details

- The move won't run while anything stops it.
- It also won't run while some values read differently, until you pass
  `acceptReadProblems: true`. Those values then move as Evalkeeper reads
  them.
- Your own tables are never changed. Keep them, unread, until you decide
  to drop them.
- Columns your map never read, such as a confidence score or a legacy
  flag, stay in your old tables.

## Your own eval tables

Your answer key lives in your own tables, and you can't move it yet?
Keep your rows where they are. Give `prismaStore` a map of where your
tables differ from Evalkeeper's, and Evalkeeper reads and writes your
rows.

Leave out anything named the same.

```ts
import {
  prismaStore,
  prismaJudgmentCache,
} from "@crowandraven/evalkeeper/prisma";

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

### What the map holds

- **`models`** gives each table's model as your client spells it.
  `prisma.goldCase` is `"goldCase"`.
- **`fields`** gives column names per table, keyed by Evalkeeper's
  field. On cases, `labels` is the relation to their answers.

### Where your tables differ

Most differences are handled for you. Types convert on their own:

- Decimal columns (costs) read as numbers.
- Prisma enums read as their names.
- `tags` may be a `String[]` or a `Json` column.
- A run whose set is null reads as ALL.
- A missing grader version reads as empty.

So rows your old harness wrote still read.

Some differences need a decision from you:

| Your table                                                                 | What to do                                                                                 |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Lacks a column for one of Evalkeeper's nullable fields                     | Map the field to `null`. It reads as null, and writing a value fails instead of losing it. |
| Has columns Evalkeeper lacks (a creator, a quick-set flag, legacy results) | Nothing reads or writes them, so they need a default or to be nullable.                    |
| Has a status enum missing one of Evalkeeper's statuses                     | Add the value, or that write fails.                                                        |

Only nullable fields can be mapped to `null`. The usual ones are run
temperature and output cap. Add them as nullable columns if you'll test
those settings. Map them to `null` if you won't.

Evalkeeper writes its own status names. For example, an answer can be
REJECTED, and rating blind writes SKIPPED.

### Checking a mapped store

You want to know your map is right before you trust it. There are two
checks. Run the read-only one first.

1. **Does it read what's there?** `prismaReadCheck` reads each suite's
   cases, answers, tests, and outputs through your map. It writes
   nothing, so it's safe on a copy of real data.

   It lists every value that doesn't parse, with counts. For example:
   an unknown status, a cost that isn't a number, or a missing column.
   The store itself reads such a value as a default, so this check is
   where you see it.

   Pass your suites, not just their keys, to also check each input and
   answer against the suite's own schemas, the way your code reads them.

   ```ts
   import { prismaReadCheck } from "@crowandraven/evalkeeper/prisma";
   import { describeMappedReadCheck } from "@crowandraven/evalkeeper/testing";

   describeMappedReadCheck(
     "our answer key",
     () => prismaReadCheck(prisma, map, { suites: SUITES }),
     { suites: SUITES.map((s) => s.key) },
   );
   ```

   Or print it once with `readCheckSummary(await prismaReadCheck(...))`.
   It gives a line per suite with its counts, and each problem once with
   how many rows have it.

2. **Does it write and read back?** The store contract writes cases,
   answers, tests, and outputs, then reads them back. Use `without` to
   name any setting you mapped to `null`.

   > [!WARNING]
   > The contract tests empty your tables. They need an empty store each
   > time, so `make` empties the tables. Run them only on a throwaway
   > local database made from your schema file, never on development or
   > production data. Or run them scoped (step 3).
   >
   > Before emptying anything:
   >
   > - check the database's name in the URL `make` uses, and
   > - tell whoever's watching which database it is, and that it will
   >   be emptied, before running it.

   Make the throwaway database with `prisma db push` to a new local
   database, since an app's migrations may not build from empty.

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

3. **Or run the contract scoped.** Use this on a database that holds
   other rows, such as a shared development database. With a scope:
   - every suite and feature it writes starts with the scope;
   - its tests never look past their own rows;
   - `deleteScopedRows` deletes only rows whose names start with the
     scope, compared exactly, whatever the database's pattern matching
     does; and
   - `make` returns the store as it is, emptying nothing.

   ```ts
   import { deleteScopedRows } from "@crowandraven/evalkeeper/prisma";

   describeStoreContract("our tables", () => prismaStore(prisma, map), {
     without: ["temperature", "maxOutputTokens"],
     scope: "contract-",
     cleanup: (scope) => deleteScopedRows(prisma, scope, { map }),
   });
   ```

   Pick a scope none of your own suites or features start with.

### Details

- **Not on Vitest?** Every contract takes your test functions:
  `{ test: { describe, it, expect: assertExpect, afterAll: after } }`.
  Take `describe`, `it`, and `after` from `node:test`, and
  `assertExpect` from `@crowandraven/evalkeeper/testing`. Vitest stays
  optional.
- **Importing instead.** If you'd rather move your rows into
  Evalkeeper's tables by import, use `importCases` ([step 5 of the
  setup](adding-to-your-app.md#5-write-your-first-suite)). Bring answers
  people reviewed in as confirmed, with who and when from each row.

> **Costs**
>
> - A map.
> - Nullable columns for what you want to keep that you don't have.
> - The request hash that reuses identical answers may differ from your
>   old harness's. So the first test of each model after the move pays
>   for its answers again, once.

## Your own router

Your app already decides which model answers each feature? Keep it.
Evalkeeper's runner never calls a model or picks one for your app; it
asks your code.

Pass your router's functions as callbacks:

| Callback        | What it answers                                                                                                   |
| --------------- | ----------------------------------------------------------------------------------------------------------------- |
| `route`         | What's live for an operation                                                                                      |
| `candidates`    | Which models may be tested                                                                                        |
| `promptVersion` | Your instructions' hash                                                                                           |
| `continueRun`   | Needed only on a platform with a request limit ([step 6 of the setup](adding-to-your-app.md#6-create-the-runner)) |

Each suite's `run` calls your own AI function with the model it's given.
It reports its cost through `onCost`.

> **Costs**
>
> - A few lines of glue.
> - Your failover, usage records, and billing stay as they are. Mark
>   eval calls so they aren't billed to a user.

## Your own versions

Your app already keeps a history of each feature's settings, such as an
admin page that changes models? Point `prismaSettingsStore` at those
tables. Evalkeeper's rollback and history then read the same record as
your page.

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

### What your tables need

- A number per version, unique per feature.
- A live pointer per feature.
- A change log with its kind: CHANGE, PROMOTE, ROLLBACK, DEPLOY,
  OUTSIDE, or INSTRUCTIONS. An enum is fine.
- Who made each change. The actions record the admin's `name` from
  `requireAdmin`. If your log keeps a user id there instead (a foreign
  key to your users), set `changedBy: "id"` in your wiring, and have the
  settings store's `by` map turn ids back into names for the history.

### An older kind enum

An enum made before OUTSIDE and INSTRUCTIONS existed can't hold them.
Choose one fix:

- **Add both to the enum** with a migration.
- **List what it holds** in the map's `kinds`, such as
  `kinds: ["CHANGE", "PROMOTE", "ROLLBACK", "DEPLOY"]`. A kind it can't
  hold is stored as CHANGE, with the real kind in the evidence column,
  and read back as itself.

Without either, saving one of those kinds fails with a message saying
so.

### Details

- `by` converts who made a change, both ways, when your table keeps a
  user id instead of a name.
- Check it with
  `describeSettingsStoreContract(name, make, { without: ["temperature"] })`.
  Run it on a throwaway database or scoped, with the same care as in
  [Checking a mapped store](#checking-a-mapped-store). For a scoped run,
  pass `{ map, settingsMap }` to `deleteScopedRows`.

> **Costs**
>
> - A map.
> - The `by` callbacks, if you keep user ids.
> - Saving a version with a setting you have no column for fails, so
>   leave that setting out of your forms.

## Your own thumbs table

Your app already records thumbs up and down? Point `prismaFeedbackStore`
at that table. The weekly summary's alerts and the hub's counts then
read the ratings you already have.

A typical table has these columns, and no inputs:

```text
id, userId, operation, targetId, rating (an enum UP/DOWN), reason,
excerpt, createdAt, updatedAt
```

Map it like this:

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

### What your table needs

It depends on what you want from your ratings.

**Alerts and counts** (the weekly summary's thumbs-down alerts, the
hub's counts) need only:

- the rating,
- the feature (`operation`),
- the time (`updatedAt`), and
- who rated which answer (`raterId` and `targetId`), so each person has
  one rating per answer.

**Turning ratings into cases** needs the input behind each answer. Keep
it only with the person's consent, with names and contact details
removed. Without an `input` column, each rating reads with
`keepsInputs: false`, and the feedback page says "This app doesn't keep
inputs with ratings, so a rating can't become a case."

**Marking ratings looked at** (dismissed, or made into a case) needs a
`status` column (text, default "OPEN") and a nullable `caseId`. Without
`status`, every rating reads as OPEN, and marking one fails with a
message saying what to add.

### Details

- **Missing columns.** Map a column to `null` only when the table lacks
  it. It reads as null, and writing a value fails instead of losing it.
  So leave that field out of your rating action. `reason` and `excerpt`
  can be `null` too.
- **One rating per answer.** Your table may have no unique key on
  (`raterId`, `operation`, `targetId`). It still keeps one rating per
  person per answer: a mapped store finds the rating before writing it.
- **Checking it.** Use
  `describeFeedbackStoreContract(name, make, { without: ["input", "output", "status", "caseId"] })`.
  Run it on a throwaway database or scoped, with the same care as in
  [Checking a mapped store](#checking-a-mapped-store). For a scoped run,
  pass `{ feedbackMap }` to `deleteScopedRows`.

> **Costs**
>
> - A map.
> - Ratings without inputs can't become cases. When you want them to,
>   add a nullable `Json` column for inputs, and ask for consent.

## Your own pages

You already have admin pages, or want only some of Evalkeeper's? Write
only the pages you want, and keep your own.

```bash
npx @crowandraven/evalkeeper add pages --base admin/evals --only suite,run,actions,evals,paths --dry-run
```

### Options

| Option      | What it does                                                                                                                    |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `--only`    | Picks what to write, by name                                                                                                    |
| `--base`    | Where the pages go. Inside a route group (`"(app)/admin/evals"`), the pages go in that folder and their links at `/admin/evals` |
| `--dry-run` | Lists what would be written, skipped, or overwritten, and names anything the chosen files import that your app doesn't have yet |

`--only` takes:

- **Pages:** hub, suite, run, rate, compare, side-by-side, feedback, and
  cron.
- **Other files:** actions, evals, paths, appComponents, and
  evalkeeper.css.
- **Groups:** `pages` and `components`.
- **`index`:** a starter wiring module. It's left out unless you name
  it.

> **Costs**
>
> - Restyling what you copy.
> - Keeping the copied files' imports pointed at what you have.
