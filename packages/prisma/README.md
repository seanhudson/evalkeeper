# @crowandraven/evalkeeper-prisma

Prisma storage for [Evalkeeper](https://github.com/seanhudson/evalkeeper), the eval harness: its tables (`schema/evalkeeper.prisma`, for
PostgreSQL, MySQL, or SQLite), a store on your Prisma client
(`prismaStore(prisma)`), and a judgment cache (`prismaJudgmentCache`).

Already have eval or versions tables of your own? Keep your rows where
they are: `prismaStore(prisma, map)` and `prismaSettingsStore(prisma, map)`
map onto them, with other model and column names, Decimal costs, Prisma
enums, `String[]` or `Json` tags, and `null` for columns you lack. Check a
mapped store with `describeStoreContract` on a copy of your data. See
"Bring your own" in
[Adding Evalkeeper to your app](https://github.com/seanhudson/evalkeeper/blob/main/docs/adding-to-your-app.md#bring-your-own).
