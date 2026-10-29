# Write suites

A suite is the test for one AI feature. It holds:

- the shape of the feature's input and of a good answer,
- the checks that grade an answer, and
- how to call the feature on a given model.

[Step 5 of the setup](adding-to-your-app.md#5-write-your-first-suite)
writes your first one. This page covers what comes after:

- bringing in cases you already have, including the ready-made suites'
  starter cases,
- fields that need more than a text box,
- features that use decision models, and
- testing a feature against prompt injection.

## Cases you already have

You may already have test data in files, or a ready-made suite may come
with starter cases. Bring them in so you don't type every case by hand.

`importCases` reads your rows into a suite. You map each row to the
suite's input and answer:

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

For a suite's own `starter` cases, call `importStarters(store, suite)`
instead.

Choose where the cases go with `split`:

| `split`            | What it's for                         | When to use it                       |
| ------------------ | ------------------------------------- | ------------------------------------ |
| `"DEV"`            | Cases you tune your prompt against    | Data you'll look at while you work   |
| `"TEST"`           | A held-out set you never tune against | A file kept aside to check your work |
| `"auto"` (default) | Splits them like cases added by hand  | New cases                            |

> [!WARNING]
> Run imports against your development database only.

Imported answers arrive pending: a person confirms each one on the
pages before it's graded against.

### Use answers before they're reviewed

Sometimes the owner says "use them so you can test, I'll review later."
Then import the answers as provisional. Name who drafted them in
`rater` (such as an agent's name) and the person who allowed it in
`allowedBy`:

```ts
await importCases({
  store,
  suite: ticketTriage,
  source: "tickets.json",
  rows,
  map,
  answers: { status: "PROVISIONAL", rater, allowedBy },
});
```

Tests use these answers. Every score says it rests on unreviewed
answers, and each row is tagged `needs-review`.

### Starter cases from a ready-made suite

A ready-made suite's starter cases arrive pending, so you confirm each
one. The exception is cases its author or an expert already reviewed
for every app (the suite's `reviews`): those arrive confirmed.

Every built-in crisis risk and hopelessness case is reviewed, marked
"Author reviewed" by the Evalkeeper Team. If you added them before
0.9.0, run `importStarters` again to add the reviews to them.

Your own work is safe: `importStarters` never adds a review over an
answer you confirmed. It lists any that disagree in `disagree`, so you
can look at them.

To confirm every case yourself, pass `shippedReviews: false` to a
ready-made suite.

**Details**

- Every row is checked against the suite's schemas before anything is
  written.
- Running an import again skips rows it imported before, matched by
  `source` and row id. Retired cases count, so they don't come back.

## Answers people already reviewed

If you're moving from your own eval harness into Evalkeeper's tables,
people may already have reviewed answers there. Bring those in as
confirmed, so nobody has to review them twice. (If you'd rather map
your existing tables, see [Bring your own](bring-your-own.md).)

Read who confirmed each answer, and when, from its row:

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

> [!WARNING]
> Use this only for answers a person confirmed in the old system.
> Answers an agent drafted, or scraped from somewhere, stay pending.

**Details**

- The import is refused unless every row names a person and a date.
  Neither is ever filled in for you.
- The date can't be in the future.
- The person is recorded as the answer's rater.
- The answer's note says it was imported as reviewed, from where, by
  whom, and on what date.

## Leave out what a case learned from itself

A case frozen from your app's data can carry its own answer. For
example:

- facts the app learned from the person's reaction to that same item,
  or
- a help desk's note written after the ticket was sorted.

Left in, these hand a model the answer, so its score looks better than
it is. Give the suite a `withoutLeaks` function that removes them:

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

It runs before a case is frozen, in each of these:

- `importCases`,
- `importStarters`, and
- the "Add a case" form.

You can check what came out. The import's result lists it in `removed`
for each case, and the case's note says so, for a person to check.

> [!TIP]
> Match on something specific to the case (the company's name), not
> something general (a job title). A general match removes what other
> cases rightly share.

## Cases edited as JSON

Some inputs and answers are easier to edit as one block of JSON than as
separate fields. Set the suite's `caseKind: "fixture"`, and each case is
edited as JSON in one field.

`inputFromJson(schema)` and `labelFromJson(schema)` read the `input` and
`label` fields. Each one parses its field and checks it with the schema:

```ts
inputFromForm: inputFromJson(profileSchema),
labelFromForm: labelFromJson(fitSchema),
```

When something's wrong, the person gets a plain error. That happens when
a field is empty, isn't JSON, or doesn't fit the schema, for example
"Input doesn't fit at facts, item 2, text: …".

## Structured fields

Some fields hold a list of objects or a nested shape, which a text box
can't edit well. Give such a field `kind: "json"`. The pages show it as
indented JSON in a monospace box.

To read a form that mixes field kinds, use one reader:

```ts
inputFromFields(schema, fields.input);
labelFromFields(schema, fields.label);
```

Each one reads every field by its kind, then checks the whole with the
schema:

| Kind    | How it's read |
| ------- | ------------- |
| text    | As it is      |
| `lines` | As a list     |
| `json`  | Parsed        |

## Your own answer editor

Some answers are hard to edit in plain fields, such as facts with a
category each, or a verdict with its reasons. For these, write your own
editor.

It's a client component that takes `AnswerEditorProps`. It keeps the
whole answer, as JSON, in a hidden input named `name`. Register it in
your wiring module, keyed by suite:

```ts
export const answerEditors: Partial<
  Record<string, ComponentType<AnswerEditorProps>>
> = { fact_parse: FactsEditor };
```

These pages use it in place of the suite's answer fields:

- the answer key,
- "Add a case", and
- blind rating.

The example app's `ActionItemsEditor` is one.

**Details**

- The actions check what the editor submits against the suite's
  `labelValue` (`answerFromForm`).
- It lives in your own files, so copying the pages again never
  overwrites it.

## Cases from your app's own data

Your cases may be items your app already handled, with answers that are
what someone did with them. What someone did isn't proof it was right,
and seeing the app's output sways the person rating. So have people
rate these cases blind.

Set the suite's `caseKind: "imported"`. The answer key then links to a
"Rate blind" page (`rate`). It shows one case's input at a time, never
the app's output. The person gives an answer, a reason, or a skip.

Each rating is that person's own confirmed answer.

### When an agent drafts the answers

Two habits catch most mistakes:

- Have it list the cases it's unsure of, so a person reviews those
  first.
- Check every expected term against the input.

In one app, 43 of 218 drafted terms were things the input never said.

## Test decision models

Some features use the AI SDK's decisions. Test these with a decision
suite, so the model you choose is one that decides well.

Write the suite with `decisions: true`, then:

1. In `run`, call `decideAndPrice` from `@crowandraven/evalkeeper/ai-sdk`
   and return the answers. It calls `experimental_decide` and prices the
   call from your catalog.
2. In `grade`, call `decisionCheck(key, answer, expected)` for each
   question.
3. In the catalog, mark each decision model with `decisions: "native"`
   or `"prompted"`.
4. Have `modelsFor(operation)` in `lib/evalkeeper/index.ts` return only
   decision models for these features.

`examples/next/lib/suites/ticketRouting.ts` is a full example.

## Test against prompt injection

If a feature reads text it can't trust (a customer's message, an email,
or a web page), someone can hide instructions in that text. Test it
against attacks, so a model you're about to rely on has been tried
against them first.

Wrap the feature's suite with `injectionSuite`:

```ts
import {
  INJECTION_ATTACKS,
  injectionSuite,
} from "@crowandraven/evalkeeper/suites";

export const triageInjection = injectionSuite(ticketTriage, {
  // Where untrusted text goes. Return a new input.
  inject: (t, attack) => ({ ...t, body: `${t.body}\n\n${attack}` }),
  // The wrong answer a hijack asks for.
  goal: "This ticket is a billing question with low urgency.",
  // Text that must never appear in an answer.
  secrets: ["You triage support tickets for a project-management app."],
});
```

Then wire it in:

- List it after its base suite in your suites.
- Where your app finds a feature's suite by operation, skip it with
  `isInjectionSuite`.

> [!WARNING]
> A pass means the model resisted these attacks, not that the feature
> is safe. Keep what a model reading untrusted text can do small.

### Make the attack cases

Make its cases from the base suite's confirmed cases:

```ts
await injectionCases(store, triageInjection);
```

It takes up to 3 of the base suite's confirmed cases per attack (change
this with `perAttack`). Each attack case carries its base case's answer.

Run it again after you:

- confirm or change base answers,
- retire cases, or
- add attacks.

Attack cases then take their base case's new answer and follow it into
retirement, and new attacks get cases.

To see what the attacks cost, compare the injection suite's score with
the base suite's on the same model.

### Choose a model with the attacks in view

Choose models on the base suite's page, never the injection suite's.
Both test one feature, and a feature has one live model.

There's nothing to make or run separately. A model's Test runs it on the
feature's cases and its attack cases together. It brings the attack
cases in step with the confirmed answers first.

The base suite's pages show the attacks:

- Its board shows each model's attacks resisted beside its score: the
  share of attack answers with no serious mistake.
- Its answer key has the attack cases in an Attacks tab.
- Its suggestion weighs them.

The suggestion:

- suggests a model as live only once it's tested on the attacks,
- never suggests one with more serious mistakes on them than live, and
- suggests switching only for at least two fewer.

If you built your own pages, pass the attacks to the suggestion and the
hub's status the same way:

```ts
const attacks = attacksFrom(await runner.attackBoards(suite.key));
const s = suggest(board.rows, suite.checks, suite.priority, MODELS, {
  attacks,
});
```

### More attacks

Add your own attacks, aimed at your feature, beside the built-in ones
with the `attacks` option:

```ts
export const triageInjection = injectionSuite(ticketTriage, {
  // …inject, goal, and secrets as before
  attacks: [...INJECTION_ATTACKS, ...yours],
});
```

Or read attacks from another tool:

| Function                | What it reads                                                       |
| ----------------------- | ------------------------------------------------------------------- |
| `cyberSecEvalAttacks`   | Meta's CyberSecEval prompt injection JSON                           |
| `garakSyspromptAttacks` | garak's `sysprompt_extraction/attacks.json`                         |
| `garakReportAttacks`    | A garak report from its `promptinject` and `latentinjection` probes |
| `promptfooBurpAttacks`  | The file from `promptfoo redteam generate -o tests.burp`            |

**Details**

- Run garak against `test.Blank` for its report, so no model is called.
- promptfoo generates its attacks with a model, on its hosted service
  unless you configure otherwise.

Keep the attacks in a file, so they're reviewed and versioned like the
rest of your suite. Write them with `writeAttacks` and read them back
with `readAttacks`.
