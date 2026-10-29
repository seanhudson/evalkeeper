# Roadmap

What's coming, in plain words. There are no dates: each item ships when
it's ready, in its own release, and [What changed](../CHANGELOG.md) says
when it lands. Have a need that isn't here? [Open an
issue](https://github.com/seanhudson/evalkeeper/issues).

## Next

Already planned, and the next to be built:

- **One command to add it, one to upgrade.** `init` looks at your app
  (its AI features, eval data, and model router) and sets Evalkeeper up
  around them. `upgrade` brings an app to a new release: the tables, the
  generated files, and a list of what changed.
- **More from apps already using it.** Testing a reasoning setting, each
  check per model, buttons for starter cases and drafts, a suite's answer
  guide, AI features with no suite yet, and code as the fallback.
- **AI gateway support.** Test models from many providers with one key,
  through Vercel's AI Gateway or another gateway. A command checks your
  [catalog](models.md)'s prices against the gateway's and writes the
  differences for you to review; the weekly check warns when a price is
  old or a model you use leaves the gateway's list, so you can look for
  its retirement date.
- **A live demo,** so you can press every button before installing
  anything.
- **Docs for every release,** so you read the docs for the version
  you're on.

## Later

Ideas worth building, each borrowed from a tool that does it well:

- **Stores for Drizzle and plain Postgres,** and Prisma 7.
- **Judge agreement.** Run the meaning judge over confirmed answers and
  see how often it agrees, so you know whether a judge-graded score can
  be trusted. (Phoenix, LangSmith's Align Evals)
- **A CI gate.** `evalkeeper check` runs the quick set and fails when a
  change makes a feature worse, so a prompt change merges only behind a
  passing check. (Braintrust, Promptfoo, DeepEval)
- **Drafts from live calls.** A small share of a feature's real calls
  become draft cases, checked on what needs no answer, so the answer key
  grows from real inputs. (Datadog, Braintrust, Phoenix)
- **Pairwise review.** Read two tests' answers side by side and record
  which is better, for writing with no single right answer. (LangSmith)
- **The commit on each test,** so a score change traces to the change
  that caused it. (Braintrust)
- **Attacks you add on the page.** Type an attack, pick its kind, and
  Evalkeeper plants it in every confirmed case, beside the built-in and
  imported ones.
- **Canary leak checks.** Plant unique markers in the instructions and
  in other people's data, and fail any answer that contains one, so
  leaked instructions or data mixed between users show up. Opt-in per
  suite. (Promptfoo)
