# @crowandraven/evalkeeper-prisma

Prisma storage for [Evalkeeper](https://github.com/seanhudson/evalkeeper), the eval harness: its tables (`schema/evalkeeper.prisma`, for
PostgreSQL, MySQL, or SQLite), a store on your Prisma client
(`prismaStore(prisma)`), and a judgment cache (`prismaJudgmentCache`).

Already have eval or versions tables of your own? `prismaStore(prisma, map)`
and `prismaSettingsStore(prisma, map)` map onto them; see "Bring your own"
in [Adding Evalkeeper to your app](https://github.com/seanhudson/evalkeeper/blob/main/docs/adding-to-your-app.md).
