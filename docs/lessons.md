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

**When no model clears the bar after the grader is right, stop tuning.**
_So:_ say so, and leave the decision to a person rather than tuning the
grader toward a pass.

## Answers

**History isn't a verdict.** Answers taken from what someone did
(saved means yes, dismissed means no) were mostly reasonless dismissals,
and many of those items fit on paper. _So:_ imported answers are drafts;
a person rates them, with a reason.

**Cases a model writes need a person's eye.** Agents wrote about 250 cases
in minutes and flagged their own doubtful ones. _So:_ drafts arrive
pending, the doubtful ones are reviewed first, and drafts put to use
before review are provisional, never confirmed on anyone's behalf.

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

**Rules accumulate.** Each rule is reasonable; together they get harder to
explain. _So:_ add a rule only when a real case needs one, and give every
suggestion its one reason.

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

**Analysis outside the harness used the wrong tests.** A hand-written
review picked up tests from before a fix. _So:_ take numbers from the same
code the pages use, and say which tests a number comes from.

## On screen

**Jargon means nothing to the person deciding.** Early pages said "smoke
set", "label accuracy", and "champion". _So:_ plain words, accuracy,
speed, and cost on one screen, and one suggestion with its reason.

**A score without a case count misleads.** _So:_ every page says how many
cases and how far a score could be off.

**Fields nobody remembers.** People confirming answers weeks later forgot
what a field meant. _So:_ every case and answer field gets a plain label
and help.
