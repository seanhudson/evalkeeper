# Instructions for coding agents

Two jobs: adding Evalkeeper to someone's app, and working on this repo.

## Adding Evalkeeper to an app

Follow [docs/adding-to-your-app.md](docs/adding-to-your-app.md) one step
at a time, and stop after each step for the person to check it. Read
[docs/concepts.md](docs/concepts.md) first.

Rules:

- **Never confirm an answer on the person's behalf.** Cases and answers
  you draft are PENDING. If the person wants drafts used before review,
  they're PROVISIONAL, and you say so. Only a person makes an answer
  CONFIRMED.
- **List the drafts you're unsure of,** so the person reviews those first.
- **No personal data in cases.** When freezing real inputs into cases,
  remove names, contact details, and anything identifying, and leave out
  anything the app learned from the case itself (its answer would leak).
- **Don't change which model is live.** Suggestions are for the person;
  the app's routing changes only when they say so.
- **Don't run paid tests without asking.** A test calls a model on every
  case. Say which suite, which models, and the estimate first.
- **Never point a migration tool at a production database.** Write
  migration SQL from schema files; never pass a real database's URL as a
  shadow database.
- **Read failures before changing a prompt or a check.** A low score is
  often the grader's fault. Fix the grader with a unit test that shows
  the bug, and bump the suite's `graderVersion`.
- **Hash every instruction a model gets** (`instructionsHash`): system
  text, prompt templates, output schemas, and tool descriptions.

## Working on this repo

- `npm run check` runs the scrub check, typechecks, and tests. It must
  pass before a commit.
- The core (`packages/core`) stays pure: no database, framework, or
  provider imports, except `runner.ts`, which may use `node:crypto`.
  Anything that talks to a service is an adapter.
- Every rule in the suggestion, health, or comparison code has a test,
  and a lesson in [docs/lessons.md](docs/lessons.md) when a real case
  caused it.
- Examples use made-up companies, people, and data only. The scrub check
  (`scripts/scrub-check.mjs`) fails on names that must never appear.
- Copy: plain words, US English, and the Oxford comma. Prose in pages gets
  the `readable` class (about 65 characters a line).
