# Changelog

Notable changes, newest first. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions
follow [semantic versioning](https://semver.org/): until 1.0, a minor
version may change an interface, and its entry says how to update.

## Unreleased

### Added

- Answer key: open a case to see its input, answer, and each model's
  result; add a case, edit an answer, or retire a case.
- `fields` and `labelFromForm` on suites, so pages render forms for any
  suite, with help on every field.
- `GLOSSARY`: plain definitions for every term on the pages, shown as
  tooltips.
- `describeStoreContract` (`evalkeeper/testing`): the tests every
  `EvalStore` must pass.
- `addLabel`, `setLabelStatus`, and `setCaseStatus` on `EvalStore`.
- Live, Fallback, Retires, and Out of date chips on the model board.

### Changed

- `AnySuite` is `Suite<unknown, unknown, unknown>` instead of `any`.
- The Prisma adapter is typed by its rows; no `any`.
- Stricter compiler and lint settings across the repo.

### Fixed

- A high-severity advisory in the Prisma CLI's `deepmerge-ts`, through an
  npm override.

## 0.1.0 - 2026-10-20

- First release: the core, the Prisma and AI SDK adapters, and the
  example Next.js app.
