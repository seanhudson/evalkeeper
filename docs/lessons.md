# Lessons

Evalkeeper was built inside a production app, choosing models for about
20 AI features, and then ported to a second app. These are the things
that went wrong, what they taught, and what changed in the design. Each
one is why a rule exists.

## Grading

**A low score was more often the grader than the model.** Across three
suites under 90%, most failures were check bugs: a number check that read
"16 weeks" but not "sixteen weeks", a check that failed a model for
asking before saving (which its instructions required), and a judge that
couldn't see a field the model could. _So:_ read every failure before
changing a prompt, grade what the instructions ask for, and give a judge
exactly what the model saw.

**The answer key fought the instructions.** A feature's instructions said
to score companies the model didn't recognize low, while drafted cases
used made-up names and expected high scores. The model that followed the
instructions scored worst. _So:_ when the best instruction-follower fails
a check, read the instruction and the answer side by side, decide which
is right for the product, and make both say it.

**A fixed cutoff measured each model's scale, not its judgment.** On a fit
score, every model put most items between 66 and 88, so "70 or more means
yes" failed models that ranked well. One model ranked best and looked
worst. _So:_ where an answer is a score, the headline is ranking (pairs in
the right order), and cutoff checks are minor.

**Checks across answers mixed people.** A ranking check compared every
"yes" with every "no" in the suite. Once drafted personas joined one
person's history, it ranked an executive's items against a nurse's, and
those easy pairs lifted two models by 7 to 9 points. _So:_ checks across
answers compare only answers about the same subject.

**Cases leaked their own answers.** Profiles frozen into cases held facts
the app had learned from the person's reaction to that same item.
Removing them lowered every model's ranking by about 8 points. _So:_ when
freezing a case, leave out anything learned from the case itself.

**Standard phrasing isn't an invented number.** A check for made-up
figures flagged "a 30-60-90 day plan", "2 to 3 minutes", reference ids
like "[f9]", and list markers like "(1)". _So:_ strip stock phrasing and
references before checking, and catch counted words ("a decade", "five
reports") as numbers.

**A prompt rule can trade a minor miss for a serious one.** One rule cut
keyword misses from 8 to 5 and raised embellishments from 4 to 7. _So:_
compare serious mistakes before keeping a prompt change.

**A case nearly became an example in the instructions.** While tuning a
hopelessness question, cases from the app's own suite ("the Broncos are
hopeless", "this printer is hopeless") were about to go into the model's
instructions as examples. The score would have risen on those cases
without the model getting any better, with nothing on the page to say
why. _So:_ the runner takes each feature's instructions as text, and the
suite page warns about any case whose words appear in them.

**When no model clears the bar after the grader is right, stop tuning.**
_So:_ say so, and leave the decision to a person rather than tuning the
grader toward a pass.

**Most of another tool's attacks are graded by its judge.** Of
CyberSecEval's 251 prompt injection cases, 164 are checked by asking a
judge model about the answer ("Is the response in Spanish?"); only 87
name a word to look for. Guessing a check for the rest would grade them
on something the tool never asked. _So:_ the readers turn a checked word
into the suite's canary, leave the rest out, and list each one skipped
with its question, so nothing is graded on a check nobody wrote.

## Answers

**History isn't a verdict.** Answers taken from what someone did
(saved means yes, dismissed means no) were mostly reasonless dismissals,
and many of those items fit on paper. _So:_ imported answers are drafts;
a person rates them, with a reason, on the "Rate blind" page, which shows
the input only: seeing what the app decided anchors the rating.

**Cases a model writes need a person's eye.** Agents wrote about 250 cases
in minutes and flagged their own doubtful ones. _So:_ drafts arrive
pending, the doubtful ones are reviewed first, and drafts put to use
before review are provisional, never confirmed on anyone's behalf.

**Every app confirmed the same cases again.** The crisis risk and
hopelessness suites ship made-up cases written to work in any app, and
each arrived pending, so every app's people had to confirm the same
answers before a single test counted. Confirming them on the apps' behalf
would break the rule above. _So:_ a suite can ship reviews: a named
person, the suite's author or an expert, confirms a case once for every
app, with what qualifies them and when. A review counts only for the
exact input and answer they saw, never replaces an app's own answer, and
the pages say whose review it was.

**Cases confirmed early stayed drafts,** so tests ran on 2 cases instead
of 25. _So:_ a case is in use when it isn't retired and has a confirmed
answer, whatever its status says.

**Cases you tuned against aren't a test set.** _So:_ imported cases go to
DEV; new ones fill TEST.

## Choosing models

**Ranking by serious mistakes first picked a far worse model.** It
suggested a model at 29% over the live one at 45%, because it had one
fewer serious mistake. _So:_ accuracy is the floor, and a switch needs a
real reason.

**Never accepting a lower score kept an expensive model.** For a
background feature, a model 18 times cheaper scored 6 points lower, within
the noise. _So:_ suites that favor cost or speed allow a small, unclear
drop for at least half the cost or time.

**Retiring models kept being suggested.** _So:_ the catalog says when a
model retires, and suggestions skip it.

**A fallback doesn't need to beat live.** Requiring it left features with
no fallback. _So:_ the fallback is the most accurate model from another
provider.

**A hidden button looked like a broken system.** "Make fallback" showed
only for a model with a current, complete test from another provider. An
owner saw no fallback button at all, with no reason given, and wanted to
choose one anyway. _So:_ every model the operation allows can be made the
fallback; the board shows how it did and the suggestion recommends one.
The evidence informs the person deciding; it doesn't decide for them.

**A model that rejects a setting scores 0, not "bad".** Two models scored
0 of 44 because a hard-coded reasoning setting was below their minimum.
_So:_ the catalog lists each model's settings, and a 0 means reading the
errors before the scores.

**Eval calls fell back silently.** A timed-out call answered from the
feature's fallback under the tested model's name. _So:_ eval calls run on
the chosen model only, and a failure is a failed answer.

**A fallback can be a different kind of model.** One feature ran live on
a calibrated decision model and fell back to a chat model asked the same
questions, which can't run on the live model's settings and has its own
scores. A board that only listed models fit for live had nowhere to show
it. _So:_ the board marks models that can only be live or only be the
fallback, and each kind is tested and scored on its own.

**Rules accumulate.** Each rule is reasonable; together they get harder to
explain. _So:_ add a rule only when a real case needs one, and give every
suggestion its one reason.

**One feature, one place to choose its model.** An app added injection
suites for two features and saw each as its own card on the hub, each
page with its own suggestion and "Make live." Both pages changed the same
feature's live model, and the injection page's suggestion weighed only
attacks, so it could pick a model less accurate on the feature itself.
_So:_ an injection suite's results show on its base suite's page as
attacks resisted, the suggestion there weighs both, and one Test runs a
model on the cases and the attacks together. A separate "Test attacks"
step, and attack cases someone had to make, were the same split again.

## Settings

**The live settings stayed a row, not a pointer.** The app's call sites
each read one settings row, so making versions the source of truth would
have meant changing every one of them. _So:_ an app like that keeps the
row live and saves versions beside it, both written in one transaction,
and a row edited outside the page is recorded as a version before the
next save, so history never skips a change.

**Two changes in one save tied on time.** Recording the old and new
settings together gave both the same timestamp, so "the latest by time"
could pick either. _So:_ write them a millisecond apart, or order by a
number rather than a time.

## Running tests

**The platform's time limit stopped long tests silently.** Slow models on
50 cases ran past 300 seconds and showed "Testing…" forever. _So:_ answers
time out, long tests continue in a fresh request, and stuck tests are
marked failed.

**A provider out of credits failed every answer.** _So:_ a billing error
stops the test, says which provider, and retesting reuses what was
answered.

**Regrading marked old tests as current.** _So:_ regrading updates a test
for changed answers, never for inputs that changed after it ran.

**The comparison averaged per answer while the headline counted parts.**
They disagreed about which model was better. _So:_ both use the same
partial credit.

**Instructions aren't only the prompt.** Editing an output schema's field
description changes answers as surely as editing the system text. _So:_
the instructions hash covers schemas and tool descriptions, and anything
injected at call time.

**An open page can run the previous deploy's code.** A test started from a
page loaded before a deploy graded on the old checks, because the
platform sends an old page's server actions to the deployment that served
it. _So:_ reload the page after a deploy that changes grading, and check a
test's grader version before trusting its score.

**A suite and a command-line eval ran the same feature two ways.** A fix
to one call left the other answering differently. _So:_ the exact call
lives in the suite module, and any script imports it from there, so a fix
to one is a fix to both.

**Analysis outside the harness used the wrong tests.** A hand-written
review picked up tests from before a fix. _So:_ take numbers from the same
code the pages use, and say which tests a number comes from.

**Proving a map meant emptying a database.** Moving an app onto a mapped
store, the natural first check was the store contract, which needs an
empty store, so it had to run on a second, throwaway database (built from
the schema file, since the app's migrations started from a restored
dump), and the person watching was alarmed to read "empty database"
mid-task. The check that mattered most, whether the store read the
existing answer key as the app did, didn't exist, and the store quietly
read an unknown status as a known one. _So:_ a read-only check comes
first and reports rows as the table holds them; the contracts can run
scoped, deleting only the rows they wrote; and the guide says to check
the database's name and say so before emptying anything.

**The contracts only ran under Vitest.** An app on `node:test` copied
them with a hand-written `expect`. _So:_ every contract takes its test
functions, `assertExpect` covers the matchers they use, and the testing
entry loads without Vitest.

## On screen

**Jargon means nothing to the person deciding.** Early pages said "smoke
set", "label accuracy", and "champion". _So:_ plain words, accuracy,
speed, and cost on one screen, and one suggestion with its reason.

**A score without a case count misleads.** _So:_ every page says how many
cases and how far a score could be off.

**Fields nobody remembers.** People confirming answers weeks later forgot
what a field meant. _So:_ every case and answer field gets a plain label
and help.

## Adopting it with your own setup

**Contract tests empty their tables.** The store contract writes and
deletes rows as it checks each method, so pointed at a database with real
rows it would wipe them. _So:_ run contract tests only on a throwaway
database built from the schema file, and say which database before
running them.

**Reasoning settings are open strings in Evalkeeper.** The app had a
fixed set of reasoning levels, and a test could hand its router one it
didn't know. _So:_ an app with a fixed set narrows the value where an
eval enters its own router, and an unknown one runs on the model's
default, as an unsupported one already does.

**Request hashes differ from an older harness's.** After the move, the
first test of each model paid for its answers again instead of reusing
the old ones. Matching the old hashes would have tied Evalkeeper to one
app's format. _So:_ the cost is paid once per model, and the person hears
about it before running the first test.

**Route groups aren't part of the URL.** An app whose admin pages sit in
a Next.js route group copied the pages with `--base "(app)/admin/evals"`,
and every link pointed at `/(app)/admin/evals`, a path that doesn't
exist. The same run also warned that files it had just copied were
missing. _So:_ the folders keep the group, the links leave it out, and
files the run writes count as present.

## Releasing

**npm shows a package's README as of its last publish.** A release went
out before the README updates merged, so the package page showed the old
docs until a docs-only release followed. _So:_ merge docs before
publishing, and follow the release checklist in CONTRIBUTING.md.

**An advisory with no fix to take turned every pull request red.** A
high advisory for zod below 4.6.6 arrived while every Evalkeeper app was
on zod 3, and only zod 4, a planned major, fixes it. `npm audit` failed
CI on unrelated work, and the choice was to merge red or rush the
upgrade. _So:_ the audit runs through `scripts/audit.mjs`, which still
fails on every other high or critical advisory, allows a named one with
its reason, and says when it's no longer reported so it comes out.
