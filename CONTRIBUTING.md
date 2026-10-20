# Contributing

Thanks for helping. Issues, questions, and pull requests are welcome.
The rules for changes are in [AGENTS.md](AGENTS.md) (they apply to
people too), and [docs/architecture.md](docs/architecture.md) says where
each kind of change goes.

## Setup

```bash
npm install
npm run build
npm run check
```

`npm install` also sets up two git hooks:

- **pre-commit:** formats and lints the files you staged, and runs the
  scrub check.
- **pre-push:** builds, typechecks, and runs the unit tests.

CI runs everything again on Node 20 and 22, plus the browser tests,
`npm audit`, and CodeQL. Please don't skip the hooks with `--no-verify`.

## Tests

| Command                                    | What it runs                                    |
| ------------------------------------------ | ----------------------------------------------- |
| `npm test`                                 | Unit, contract, and grader tests, with coverage |
| `npm run e2e` (in `examples/next`)         | The pages in a real browser, on demo models     |
| `npm run check`                            | Everything CI checks except the browser tests   |
| `npm run screenshots` (in `examples/next`) | Retakes the README screenshots, light and dark  |

Every change ships with its tests; AGENTS.md has the table of which kind.
Coverage limits never go down.

## Pull requests

- Fill in the template: what changed, why, and the checklist.
- Add a line to CHANGELOG.md under "Unreleased".
- Use made-up names and data in examples and tests.
- Write in plain words, US English, with the Oxford comma.

## Ideas

The roadmap in the README lists what's planned. A store for another
database or ORM is a great first contribution: implement `EvalStore` and
run `describeStoreContract` against it.
