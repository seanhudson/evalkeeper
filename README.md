# Evalkeeper

**Evals for the AI features in your app.** Write down what a good answer
looks like, test every model against it, and choose the live model on
evidence instead of vibes, then keep that choice honest as models change.

[![CI](https://github.com/seanhudson/evalkeeper/actions/workflows/ci.yml/badge.svg)](https://github.com/seanhudson/evalkeeper/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

<!-- Screenshot: docs/screenshot.png, the suite page with its model board. -->

---

## Why

An AI feature in production changes under you. Providers retire models,
quietly update them under the same name, and change prices. Someone edits
a prompt. A cheaper model ships that might be good enough. Most teams find
out what broke from a user.

Evalkeeper turns each AI feature into a **suite**: real inputs, answers a
person confirmed, and checks that grade any model's output against them.
Run a suite on every model your app can use, and you get a board that
says, in plain words, which model to make live, which to keep as the
fallback, and why.

It was extracted from a production app where it chose models for 20
AI features. The [lessons](docs/lessons.md) from that work are part of the
design.

## What you get

- **Answer keys people own.** A model can draft cases and answers, but
  nothing is graded against an answer until a person confirms it. Answers
  put to use before review are marked provisional, and every score says so.
- **Tests per model.** Every case, on any model, with time and cost per
  answer. Identical requests are reused for a week, so retesting is free.
- **Checks that say what matters.** Each check is serious (it changes what
  your product does) or minor (a fair difference of judgment), with its
  own bar. Partial credit where an answer has parts.
- **A model board.** Every model's latest test, its serious mistakes, speed,
  and cost, and a bootstrap comparison with the live model: _more accurate_,
  _about as accurate_, _less accurate_, or _too few cases to tell_.
- **A suggestion with its reason.** Accuracy is the floor. A switch needs a
  real reason: clearly more accurate, fewer serious mistakes, or, for a
  suite that favors cost or speed, the same results at half the cost or
  time. Retiring models are never suggested. The fallback comes from
  another provider.
- **Honest staleness.** Tests record the instructions (prompt, output
  schema, and tool descriptions), the cases, and the grader they ran
  with. Change any of them and older tests say they're out of date.
  Regrading stored answers is free and never pretends an old test ran on
  new inputs.
- **Built for real platforms.** Answers time out, long tests continue in a
  fresh request instead of dying at the platform's limit, stuck tests are
  marked failed, and a provider out of credits stops a test instead of
  failing every answer.

## Quick start

The example app runs with demo models, so it needs no API keys.

```bash
git clone https://github.com/seanhudson/evalkeeper.git
cd evalkeeper
npm install
npm run build
cd examples/next
cp .env.example .env
npm run setup
npm run dev
```

Open <http://localhost:3000/evals> and press **Test every model** on a
suite. Add `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` to `.env` to test real
models next to the demo ones; action items are then matched by meaning
with a judge model instead of by shared words.

## Add it to your app

Evalkeeper is a small core with adapters, not a platform. Your app keeps
its own routing, auth, and pages.

**1. Install.**

```bash
npm install evalkeeper @evalkeeper/prisma @evalkeeper/ai-sdk
```

**2. Add the tables.** Copy the models from
[`packages/prisma/schema/evalkeeper.prisma`](packages/prisma/schema/evalkeeper.prisma)
into your schema. They work on PostgreSQL, MySQL, and SQLite.

**3. Write a suite** for one AI feature: its input, what a good answer is,
how to call the feature on a given model, and how to grade the output.

```ts
import type { Suite } from "evalkeeper";
import { z } from "zod";

export const ticketTriage: Suite<Input, Output, Label> = {
  key: "ticket_triage",
  operation: "ticket_triage",
  label: "Ticket triage",
  description: "Sorting a support ticket into a queue and an urgency.",
  priority: { favor: "cost" }, // runs often, in the background
  graderVersion: "1",
  input: z.object({ subject: z.string(), body: z.string() }),
  labelValue: z.object({ category: z.string(), urgency: z.string() }),
  checks: [
    {
      key: "category",
      label: "Right category",
      kind: "label",
      severity: "serious",
      description: "The ticket lands in the right queue.",
    },
  ],
  run: (input, { model, onCost }) => triage(input, model, onCost), // your code
  grade: async (_input, out, want) => [
    { key: "category", pass: want ? out.category === want.category : null },
  ],
  inputFromForm: (form) => ({ subject: String(form.get("subject")), body: "" }),
  title: (input) => input.subject,
};
```

**4. Create the runner** with your store, suites, model catalog, and
routing.

```ts
import { createRunner } from "evalkeeper/runner";
import { prismaStore } from "@evalkeeper/prisma";

export const runner = createRunner({
  store: prismaStore(prisma),
  suites: [ticketTriage],
  models: MODELS, // labels, providers, prices, retirement dates
  promptVersion: (operation) => PROMPT_VERSIONS[operation],
  route: (operation) => routeFor(operation), // what's live now
  candidates: () => ({ models: Object.keys(MODELS) }),
});

const { run } = await runner.createRun({
  suite: "ticket_triage",
  model: "claude-haiku-5-5",
});
await runner.runEval(run.id);
const board = await runner.board("ticket_triage");
```

**5. Copy the pages.** The admin pages in
[`examples/next/app/evals`](examples/next/app/evals) and their components
in [`examples/next/components/evalkeeper`](examples/next/components/evalkeeper)
are meant to be copied into your app and restyled, the way shadcn/ui
components are. Put them behind your admin check.

[Adding Evalkeeper to your app](docs/adding-to-your-app.md) has the full
steps, and [AGENTS.md](AGENTS.md) gives a coding agent what it needs to do
them for you.

## Packages

| Package                                 | What it is                                                                                      |
| --------------------------------------- | ----------------------------------------------------------------------------------------------- |
| [`evalkeeper`](packages/core)           | The core: suite types, stats, comparisons, suggestions, health, grader helpers, and the runner. |
| [`@evalkeeper/prisma`](packages/prisma) | The tables, a store on your Prisma client, and a judgment cache.                                |
| [`@evalkeeper/ai-sdk`](packages/ai-sdk) | For the Vercel AI SDK: instruction hashes, call pricing, and a cached meaning judge.            |
| [`examples/next`](examples/next)        | A Next.js app with two suites, demo models, and the eval pages.                                 |

Bring another database by implementing `EvalStore` (eleven plain reads and
writes); `memoryStore()` is a complete one to copy.

## Concepts

[Concepts](docs/concepts.md) explains suites, cases, answers, checks,
tests, the board, and the rules behind suggestions, in plain words. If
you're new to evals, start there.

## Principles

- **People own the answer key.** A model's draft never becomes a confirmed
  answer on someone's behalf.
- **Accuracy is the floor.** Cost and speed only count between models that
  are about as accurate.
- **One reason per suggestion,** in words the person deciding understands.
- **Read failures before changing prompts.** A low score is often the
  grader's fault; the checks are code you can test.
- **Fewer rules.** Each rule here exists because a real case needed it.

## Roadmap

- A CLI that copies the pages into your app (`npx evalkeeper add pages`).
- Versioned model settings with rollback, as an optional package.
- A scheduled drift check: each suite's quick set on its live model, weekly.
- Thumbs up and down on AI answers, turned into draft cases.
- Stores for Drizzle and plain Postgres; Prisma 7.
- Count reusable answers in cost estimates.

## Docs

[Concepts](docs/concepts.md), [adding it to your app](docs/adding-to-your-app.md),
[architecture](docs/architecture.md), and [lessons](docs/lessons.md).
Changes are in the [changelog](CHANGELOG.md).

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md),
the [code of conduct](CODE_OF_CONDUCT.md), and, for security issues,
[SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) © 2026 Sean Hudson
