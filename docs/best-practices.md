# Best practices

Habits that keep your tests telling the truth. Each one comes from
something that went wrong while Evalkeeper chose models for about 20 AI
features in production apps. The full record, with what changed in the
design each time, is in the repo's
[lessons](https://github.com/seanhudson/evalkeeper/blob/main/docs/lessons.md).

## Read failures before changing anything

**A low score is more often the grader than the model.** Across three
features scoring under 90%, most failures were bugs in the checks: a
number check that read "16 weeks" but not "sixteen weeks", a check that
failed a model for asking before saving (which its instructions
required), and a judge that couldn't see a field the model could. Open
the test, read every failure, and fix the check before the prompt.

**When the model that best follows instructions fails, read both.** One
feature's instructions said to score unknown companies low, while its
cases expected high scores for made-up names. The model that followed
the instructions scored worst. Put the instruction and the answer side
by side, decide which is right for your product, and make both say it.

**When no model meets the aim and the checks are right, stop tuning.**
Say so, and leave the decision to a person, rather than loosening the
checks until something passes.

## Choose check levels

Each check has a level, and the level decides what a miss costs:

- **Must pass** (`severity: "serious"`): a miss changes what your
  product does, or misleads or harms the person. The wrong queue, a
  missed urgent ticket, an invented salary, a crisis message treated as
  ordinary. Models are compared on these first, and the suggestion
  never trades one away for cost or speed.
- **Should pass** (`"moderate"`): it matters, but a person reading the
  answer would shrug and move on. A summary a sentence too long, a
  missing detail that's easy to find.
- **Nice to have** (`"minor"`): style, wording, and fair differences of
  judgment. A category a fact could fairly take two ways, a tone a
  little off. Its miss never fails an answer.

**Keep must-pass for the few that matter.** Most suites need one to
three must-pass checks. When most of a suite's checks must pass, every
model misses some, the must-pass count stops telling models apart, and
real mistakes hide among style misses. Ask of each check: "If a model
missed this on one answer in ten, would I switch models?" Only a yes is
must-pass. The suite's to-do list flags a suite where more than half
the checks must pass.

A level you set in code is a starting point: anyone can change it in the
suite's **Suite settings**, and the page rescores recent tests. A coding
agent proposes levels and lists them for you to review; it doesn't
decide them for you.

## Write checks that measure the right thing

**Compare must-pass misses before you keep a prompt change.** In one app, a rule cut nice-to-have misses from 8 to 5
and raised made-up details, a must-pass miss, from 4 to 7.

**Grade rankings, not cutoffs, when the answer is a score.** Every model
put most items between 66 and 88, so "70 or more means yes" measured
each model's scale, not its judgment, and the model that ranked best
looked worst. Make "are the pairs in the right order" the headline, and
cutoffs nice to have.

**Compare answers only about the same subject.** A ranking check that
compared every person's items with every other person's lifted two
models by 7 to 9 points on easy pairs that meant nothing.

**Don't count stock phrasing as invented facts.** A check for made-up
numbers flagged "a 30-60-90 day plan", "2 to 3 minutes", shorthand like
"24/7", and list markers like "(1)". Strip stock phrases and references
before checking, and catch numbers written as words ("a decade", "five
reports").

## Keep the answer key honest

**A person confirms every answer.** Models can draft hundreds of cases
in minutes, and some will be wrong. Have the drafting model flag the
cases it's unsure of, review those first, and check every term in its
answers against the input.

**What someone did isn't the right answer.** Answers taken from history
(saved means yes, dismissed means no) were mostly dismissals with no
reason, and many of those items were fine. Rate cases taken from your
app's data blind, from the input alone.

**Leave out what a case learned from itself.** Profiles frozen into
cases held facts the app had learned from the person's reaction to that
same item, and removing them lowered every model's ranking by about 8
points. Give the suite a leak check (`withoutLeaks`).

**Never copy a case into the instructions as an example.** Its score
rises without the model getting any better. Pass your instructions' text
to the runner, and the feature's page warns about any case whose words
appear in them.

**Label every field.** People confirming answers weeks later forgot what
a field meant. Give every input and answer field a plain label and help.

## Test at the right moments

- **Test again** after you change a prompt, an output schema, or a tool
  description, and when a provider ships a model you might use. The
  instructions hash covers all of them, so the board marks old tests out
  of date.
- **Rescore** after you change an answer or a check. It calls no
  model, only an AI judge for checks that use one.
- **Schedule the weekly check**, so drift shows up before your users
  notice it.
- **Reload the page after a deploy that changes grading.** A page loaded
  before the deploy can run the old checks.
- **Keep the call in one place.** If a script and a suite both call a
  feature, the script imports the call from the suite, so a fix to one is
  a fix to both.
- **Take numbers from the pages.** A hand-written analysis once used
  tests from before a fix. Quote the board, and say which tests a number
  comes from.

## Plan for a provider going down

**Make the fallback another provider's model.** A fallback answers when
the live model can't: an outage, a rate limit, credits running out. If
both come from the same provider, the event that stops one stops the
other. Evalkeeper only suggests a fallback from a different provider
than live.

**Start with at least two providers.** List models from two or more
providers in your catalog from the first day, with a key for each, and
test models from both. With one provider, no fallback can be suggested,
and the first outage takes the feature down.

## Say plainly what a score means

Every score shows how many cases it rests on and how far off it could
be. Read **Similar** as just that: on these cases, the two can't be
told apart. Add cases before you trust a small difference.
