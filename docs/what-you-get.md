# What you get

Everything that comes with the package, before you write a line of your
own: the screens, the weekly check, and suites you can use as they are.

![The evals hub: stat cards for room to improve, the slowest and costliest live models, and thumbs down this week; the weekly check; and a card per feature.](screenshots/hub-light.png "The hub, the first of the seven screens.")

## Seven screens

**Seven screens** in your admin, from the package, drawn with your app's
own components ([Make the screens your own](screens.md)):

| Screen           | What it's for                                                                 |
| ---------------- | ----------------------------------------------------------------------------- |
| Hub              | Where every feature stands, what needs a look, and the weekly check           |
| A feature's page | Its model board, the suggestion, its versions, its checks, and its answer key |
| A test           | Every answer one model gave, graded, with its cost and time                   |
| Compare          | Two tests: a verdict in plain words and the cases they graded differently     |
| Side by side     | Two tests' answers to each case, next to the expected one                     |
| Rate blind       | One case at a time, input only, for cases taken from your app's own data      |
| Feedback         | Thumbs from people using your product, ready to become cases                  |

## The weekly check

**The weekly check:** a cron route that tests each feature's live model
again, and drafts new cases from real use if you let it ([step 8 of the setup](adding-to-your-app.md#8-schedule-the-weekly-check)).

## Ready-made suites

Three starter suites, so you don't start from an empty answer key.
They're a place to start, not complete or expert-verified tests. You supply how to call your own feature; they bring the
cases, the answers, and the checks.

- **Prompt injection:** 20 attacks on each of your feature's confirmed
  cases, for any feature that reads text it can't trust.
- **Crisis risk:** 91 starter chat messages, reviewed by their author, for
  noticing suicide or self-harm risk without false alarms.
- **Hopelessness:** 76 starter chat messages, reviewed by their author, for
  noticing when someone sounds hopeless about their life.

[Ready-made suites](ready-made-suites.md) has each one in full: what it
tests, its cases, its checks, and how to add it.
