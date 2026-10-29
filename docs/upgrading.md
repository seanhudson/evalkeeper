# How to upgrade

Evalkeeper is built so an upgrade is a version bump: your app owns only
its wiring, its components, and its suites, and everything else comes
from the package. Until 1.0, a minor version (0.10 to 0.11) may change an
interface; its changelog entry says how to update.

## Each upgrade

1. **Read what changed.** Open [What changed](../CHANGELOG.md) and read
   every version between yours and the new one. Entries marked **To
   update** need a step from you.
2. **Install it:**

   ```bash
   npm install @crowandraven/evalkeeper@latest
   ```

   Install any peer the release asks for (the changelog says), such as a
   newer zod.

3. **Update the tables:**

   ```bash
   npx @crowandraven/evalkeeper migration
   ```

   It shows whether this release changes Evalkeeper's tables, and the
   migration SQL, without touching a database. When there's a change,
   write it and apply it as you would any migration, on a copy of your
   data first:

   ```bash
   npx @crowandraven/evalkeeper migration --write --out prisma/migrations/20261101000000_evalkeeper_0_11_0/migration.sql
   npx prisma migrate deploy
   npx prisma generate
   ```

   If the change would drop a column with data in it, the command names
   it and writes nothing until you pass `--accept-drops`.

4. **Check it.** Run your tests: `describeSuiteContract` catches a suite
   that no longer fits, and the store contracts catch a store that
   doesn't. Then open the hub, and test one feature.
5. **Test again if grading changed.** A release that changes how answers
   are graded says so; earlier tests are then marked out of date. Rescore
   (free), or test again where the changelog says to.

## If you copied pages

Pages written by `add pages` since 0.11 are a few lines that export
Evalkeeper's own, so they upgrade with the package. Pages copied whole
from an earlier version don't: they keep the code they were copied with.
To move one onto the package, rewrite it as a route file (see [Add the
pages](adding-to-your-app.md#7-add-the-pages)), and keep any section of
your own beside Evalkeeper's.

## If you map your own tables

A mapped table can fall behind: a release may add a column or a status
your tables can't hold. After each upgrade, run `prismaReadCheck` on a
copy of your data, and read the changelog for new columns. To stop
checking, move into Evalkeeper's tables once ([Bring your
own](bring-your-own.md#moving-into-evalkeepers-tables)).

## Docs for your version

This site follows the latest release. For an older version, read the
docs in the repo at that version's tag (for example,
`https://github.com/seanhudson/evalkeeper/tree/v0.9.0/docs`).
