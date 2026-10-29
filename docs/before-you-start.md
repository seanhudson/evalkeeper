# Before you start

What Evalkeeper needs, which parts your app will use, and whether it's
the right tool for what you're building.

> [!TIP]
> **Let your coding agent do it.** Evalkeeper ships instructions written
> for coding agents (Claude Code, Cursor, Codex, and others). Paste this
> into yours, and it works through the setup one step at a time, stopping
> after each so you can check it:
>
> ```text wrap
> Add Evalkeeper to this app. Follow
> https://github.com/seanhudson/evalkeeper/blob/main/AGENTS.md#adding-evalkeeper-to-an-app
> one step at a time, and stop after each step so I can check it.
> ```

## What it needs

- **TypeScript on Node 20 or later**, and a server that can run work in
  the background (a test of every model takes minutes, not one request).
- **zod 4.6.6 or later.** Suites describe their inputs and answers with
  zod.
- **A database.** Evalkeeper keeps cases, answers, tests, and versions in
  tables of its own.
- **The AI providers your app already uses,** with their API keys.

## Which parts you use

It's one package, `@crowandraven/evalkeeper`,
with optional parts. Install only the peers of the parts you use:

| Your app                              | Use                                                                             | Needs                             |
| ------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------- |
| Any TypeScript server                 | The core and the runner                                                         | zod                               |
| Prisma (PostgreSQL, MySQL, or SQLite) | `/prisma`: the tables and stores                                                | Prisma 6                          |
| Another database or ORM               | Your own store (`EvalStore`); `memoryStore.ts` is a full example                | Nothing more                      |
| Vercel AI SDK                         | `/ai-sdk`: instruction hashes, pricing, the meaning judge, decisions            | `ai` 7                            |
| Another AI client                     | Call it from each suite's `run`                                                 | Nothing more                      |
| Next.js (App Router)                  | `/next`: pages, server actions, the weekly cron route                           | Next.js 15+, React 19, Tailwind 4 |
| Another React app                     | `/react`: the screens' sections and views, wired to your own router and actions | React 19, Tailwind 4              |
| No React                              | The core only, with your own pages                                              | Nothing more                      |

## AI providers and gateways

Evalkeeper works with any provider your code can call,
because it never calls one itself: each suite's `run` calls your own AI
function with the model it's given. That includes models built only
for typed judgments, such as TypeSafe's System One models (Jev), which a
decision suite tests next to general models. The AI SDK adapter is a shortcut,
not a requirement. If your app reaches models through a gateway, the
suite calls through it like any other request.

## Who it's for

teams with AI features in production (or about to be)
whose output can be checked against a right answer, or graded by checks
you can write: sorting, extracting, routing, scoring, drafting with
must-have parts, flagging risk.

## Who it isn't for, yet

- Apps that aren't TypeScript. The suites are TypeScript code.
- Open-ended writing with no right answer, where only a person's taste
  decides. A meaning judge helps with some, but pairwise review isn't
  built yet.
- Watching every live call in production (tracing, latency dashboards).
  Evalkeeper tests on a set of cases; pair it with an observability tool
  for live traffic.
- Teams that want a hosted platform. It runs inside your app, on your
  database, behind your own admin login.

## API keys and what tests cost

Evalkeeper never holds API keys or calls a provider itself. A suite's
`run` calls your own AI function, so tests use the keys your app already
has (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or whatever your providers
need), from the same environment. To test a provider you don't use yet,
add its key and its models to your [catalog](models.md); a model whose key
is missing should stay out of `candidates`, so it isn't offered.

Tests spend real money. Before a test starts, the board shows its
estimated cost (`~$0.16`), from your catalog's prices. Identical requests
are reused for a week, so testing a model again after a grading fix is
free, and rescoring stored answers never calls a model. Mark eval calls
in your usage records so they aren't billed to a user.

The example app needs no keys: it runs on demo models, and adds real
ones when you set a key in its `.env`.
