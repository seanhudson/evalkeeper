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
`npm audit` (through `scripts/audit.mjs`, which lists the few advisories
allowed for now and why), and CodeQL. Please don't skip the hooks with `--no-verify`.

## Tests

| Command                                    | What it runs                                                                              |
| ------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `npm test`                                 | Unit, contract, and grader tests, with coverage                                           |
| `npm run e2e` (in `examples/next`)         | The pages in a real browser, on demo models                                               |
| `npm run docs:api`                         | Builds the API reference into `docs/api`                                                  |
| `npm run docs:site`                        | Builds the docs site, guides and API, into `site/dist`; `npm run dev -w site` previews it |
| `npm run check`                            | Everything CI checks except the browser tests                                             |
| `npm run screenshots` (in `examples/next`) | Retakes the README screenshots, light and dark                                            |

Every change ships with its tests; AGENTS.md has the table of which kind.
Coverage limits never go down.

## Pull requests

- Fill in the template: what changed, why, and the checklist.
- Add a line to CHANGELOG.md under "Unreleased".
- Use made-up names and data in examples and tests.
- Write in plain words, US English, with the Oxford comma.

## Releasing

1. Merge every pull request meant for the release, docs included. npm
   shows each package's README as of its last publish, so docs merged
   afterward wait for the next release.
2. Move the "Unreleased" entries in CHANGELOG.md under a new
   `## X.Y.Z - date` heading, bump the package and the example to that
   version, and commit.
3. Tag it (`git tag vX.Y.Z`) and push the tag. The Release workflow writes
   the GitHub release from that changelog section
   (`scripts/release-notes.mjs`); rerun it from the Actions tab with a tag
   to rewrite an older release.
4. Build from the tagged commit: `npm run build`.
5. Publish: `npm publish -w packages/core`. npm stages the publish for
   the owner to approve. It's the only package: the old
   `@crowandraven/evalkeeper-prisma` and `-ai-sdk` packages are deprecated
   on npm in favor of its `/prisma` and `/ai-sdk` entry points.

## Ideas

The roadmap in the README lists what's planned. A store for another
database or ORM is a great first contribution: implement `EvalStore` and
run `describeStoreContract` against it.
