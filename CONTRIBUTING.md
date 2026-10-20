# Contributing

Thanks for helping. Issues, questions, and pull requests are welcome.

## Setup

```bash
npm install
npm run build
npm run check
```

`npm run check` runs the scrub check, typechecks every package, and runs
the tests. The example app runs with `npm run setup` and `npm run dev` in
`examples/next`.

## Pull requests

- Keep the core pure: no database, framework, or provider imports in
  `packages/core` (the runner may use `node:crypto`).
- Add a test for every rule you add or change. If a real case taught the
  rule, add it to [docs/lessons.md](docs/lessons.md).
- Use made-up names and data in examples and tests.
- Write in plain words, US English, with the Oxford comma.

## Ideas

The roadmap in the README lists what's planned. A store for another
database or ORM is a great first contribution: implement `EvalStore`, and
run the runner tests against it.
