# Concepts

What Evalkeeper means by each word, and the rules it follows. If you're
new to evals, read this top to bottom; it's short.

## The pieces

**Operation.** One AI feature in your app, by name: `ticket_triage`,
`summarize_call`. Your app decides which model each operation runs on
(its _route_). Evalkeeper reads the route; it never changes it on its own.

**Suite.** The test for one operation: the shape of its input and of a
good answer, the checks, how to call the operation on a given model
(`run`), and how to grade one answer (`grade`). A suite is code, so it's
reviewed and versioned like the rest of your app. Two come ready made in
`@crowandraven/evalkeeper/suites`, for apps that watch chat messages:
`crisisRiskSuite` (suicide or self-harm risk) and `hopelessnessSuite`.
Your app passes its own detector as `run`. Their cases are made-up
examples written as a starting point, not clinically validated: review
and adapt them with people who have crisis-line or clinical experience
before relying on them.

**Injection suite.** A suite made from another one (`injectionSuite`) to
test the same feature against prompt injection: the base suite's
confirmed cases, each with an attack inserted where text the model can't
trust goes. It runs on the base suite's operation, keeps its checks, and
adds two: the answer never contains the attack's canary (a made-up word
it asks for) and never contains secrets the app names. An attack case's
answer is its base case's, marked "From base case," since an attack
shouldn't change the right answer. Code that finds a feature's suite by
operation skips injection suites (`isInjectionSuite`).

**Case.** One frozen input, copied rather than referenced, so later
changes to your app's data don't move the test. Cases are DRAFT, ACTIVE,
or RETIRED, and split into DEV (what you tune against) and TEST (what you
check, and never tune against). Tags say what a case tests. A case frozen from your app's data
leaves out anything learned from that same case (its answer would leak);
a suite's leak check removes it on the way in and says what it removed.
The other way round matters too: a case copied into the instructions as
an example gets graded on an answer the model was handed. When the app
passes its instructions' text (`instructionTexts`), the suite page lists
any case whose words appear in them, under "Cases in the instructions".
It's a warning, not a failure.

**Answer.** What a good answer to a case looks like, in the suite's
answer shape. Every answer has a status:

- **PENDING:** proposed (by a model, or imported) and not reviewed. Never
  graded against.
- **CONFIRMED:** a person said it's right, on the pages or in the system
  the answer was imported from (which records who and when). Tests grade
  against the newest one. A suite can ship confirmations of its own
  starter cases (its `reviews`): the suite's author or an expert checked
  each once, for every app, and the answer key marks them "Author
  reviewed" or "Expert reviewed." A review counts only while the case is
  what they saw, and never replaces an answer someone in your app
  confirmed.
- **PROVISIONAL:** put to use before review, by the owner's choice. Tests
  use it, and every score says it rests on unreviewed answers.

A case is _in use_ when it isn't retired and has a confirmed or
provisional answer. Nothing is ever confirmed on someone's behalf.

**Rating blind.** For a suite whose cases are imported from your app's
data (`caseKind: "imported"`), what someone did with an item isn't its
answer, and seeing what the app decided anchors a rating. The answer
key's "Rate blind" page shows one person the oldest case they haven't
rated or skipped (`rateQueue`), with its input only: never the app's
output or what anyone did with it. They give the answer and a reason, or
skip it. A rating is their own confirmed answer (rater role
`BLIND_RATER`), added beside other people's, never over them. A skip is
kept as a SKIPPED mark with no value: it's never graded against and only
keeps the case out of that person's queue.

**Check.** One thing a good answer gets right. A check passes, fails, or
doesn't apply (null). It's either _serious_ (a mistake that changes what
your product does: the wrong queue, a missed urgent ticket) or _minor_ (a
fair difference of judgment). Serious checks should pass 95% of the time
and minor ones 75%, unless a check sets its own bar.

**Partial credit.** When an answer has parts (action items, facts), a
check can report `units`: parts right of parts expected. The headline
then counts parts, because getting 9 of 10 items isn't the same as 0.

**Checks across answers.** Some judgments only make sense across a test:
ranking (did the model score every "yes" above every "no"?). A suite's
`gradeTogether` gets all of a test's answers and adds checks to each.
Compare only answers about the same subject; ranking one person's items
against another's says nothing.

**Test.** Every case in use, through one model at one reasoning setting,
with today's instructions. A test stores each answer, its grades, its
cost, and its time, plus what it ran with: the instructions hash, the
dataset version (cases and answers), and the grader version.

**Board.** For one suite, every model your app can use, with its latest
test: score, serious mistakes, time and cost per answer, and how it
compares with the live model. A _baseline_ (code the app runs instead of a
model, such as a matcher) can sit on the board too, for comparison; it's
never suggested. A retiring model is on the board unless the runner
says `retiringOnBoard: "inUse"`; then it's listed only while a feature
still runs on it.

**Decision suite.** A suite for a feature that uses a decision model
(the AI SDK's `experimental_decide`): typed questions about a state, each
answered with a probability instead of text. Set `decisions: true` and
grade each question with `decisionCheck`. A decision is graded twice:

- **The pick.** Did the top choice, or the side of 50% for a true-or-false
  question, match the answer key? That's the check's pass or fail, as in
  any suite.
- **The probabilities.** Each check also records measures: the Brier
  score (squared error, 0 to 1), log loss, and how sure the model was.
  The board shows **probability quality** (1 minus the mean Brier; 100%
  is all probability on the right answers) and **calibration error**
  (how far "how sure" sits from "how often right", in 10 bins; 0 is
  perfect). Calibration needs more cases than accuracy to be trusted.

Two models that pick right equally often can differ a lot here, and that
difference matters when your code acts on the probability (route only
above 80%, ask a person below). **Native** decision models return a
probability for every option; **prompted** ones are a text model asked to
decide, which gives a pick with no distribution for choices, so
probability quality counts only their true-or-false answers. A catalog
entry's `decisions` field says which.

## Rules

**Reuse.** An identical request (same suite, model, setting,
instructions, input, and repeat) from the last 7 days is reused instead
of paid for twice. Testing with `fresh` calls every time, to measure how
much answers move between identical requests.

**Out of date.** A test is current when its instructions, dataset
version, temperature, and output cap match today's. Edit a prompt, an
output schema's description, an answer, or the feature's temperature or
output cap, and older tests say so. Rescoring regrades stored answers for
free and brings a test up to today's answers, but never up to inputs
that changed after it ran.

**Comparison.** Two tests on the same cases are compared case by case
with a paired bootstrap. The verdict is _more accurate_, _about as
accurate_, _less accurate_, or _too few cases to tell_ (under 5 in common).
A test with failed answers is incomplete and never compared. The compare
page puts any two finished tests next to each other: the verdict, each
check's pass rate, and the cases they graded differently (broke, fixed,
or missed differently), each opened side by side with both answers and
what each check found. "About as accurate" means little until you've
read where the two disagree.

**How sure.** Under 20 cases, a score is mostly noise; under 50, rough;
under 100, good. Aim for 50 cases a suite.

**Priority.** After accuracy, each suite cares about one thing:

- **speed:** someone waits on it.
- **cost:** it runs in the background, often.
- **quality:** people read and act on it, so only accuracy counts.

A suite may also set `maxSeconds`; slower models are never suggested.

**The suggestion.** Fixed rules, so the reason given is always the real
one:

1. Ruled out: out-of-date or incomplete tests, retiring models, models
   over the time limit, baselines, and anything clearly less accurate
   than live. If live's own current test has failed answers (a timeout,
   say), the suggestion is to test live again: it can't be compared yet,
   and that isn't a reason to switch.
2. A switch scores at least as high as live with no more serious
   mistakes, and needs a real reason: clearly more accurate, at least two
   fewer serious mistakes, or 30% faster or cheaper when the suite favors
   speed or cost.
3. Trade-off, for cost and speed suites only: a model within 10 points
   (no clear difference) with no more serious mistakes qualifies at half
   the cost or time.
4. Otherwise live stays, and the best other model is named as one to
   watch. The page still shows the card, titled "No change suggested",
   with the reasons ("no other model is safely better", or a higher
   score that can't be told from noise).
5. The fallback is the most accurate model from another provider. It
   needn't beat live: it only runs when live's provider is down.

There's no blended score. A weighted sum can rank a model first while it's
worse at the job.

**Health.** A suite's card says where it stands: not tested, test again,
needs more cases, room to improve, fair, or good, with the reasons.

**Versioned settings (optional).** A feature's settings (its live model,
fallback, reasoning setting, output limit, and temperature, with the
instructions they ran with) are numbered versions that never change. Each switch is logged
with who, when, why, and its evidence: a _change_ by a person, a
_promotion_ from a test (the test is the evidence), a _rollback_ to an
earlier version, _new instructions_ (the instructions changed in code
and were recorded under the same models; no model was switched), a change made _outside_ the settings (the app's
own settings row changed by a script, SQL, or another page, recorded as
found before the next save), or _instructions edited_ at runtime (an
admin override or guidance added at call time, dated when noticed). Only
settings roll back; instructions stay as they are now. A feature never changed runs on its default
from code; the first change records that default as version 1, so
there's always something to roll back to. An app that chooses models in
an admin page, with no defaults in code, records each feature's current
choice as version 1 instead (_seeding_); until then the feature has no
settings, and reading them is an error. A switch decided against a
version that's no longer live is refused, so two people saving at once
can't overwrite each other.

**Weekly check.** Once a week, each suite's quick set runs again on its
live model at its live reasoning setting, with fresh answers. A provider
can change a model under the same name; this is how you find out. A drop
of 15 points or more against last week's check of the same model,
instructions, temperature, output cap, and grading is _drift_. A
different model, prompt, temperature, output cap, or grader isn't
compared, since that change has a known reason. The check
also lists quick sets that didn't finish, live and fallback models
retiring within 60 days, features with a high thumbs-down share, and
how many cases each suite drafted from activity. It only reports; a
person decides what to change.

**Drafts from activity.** An answer key only grows when someone adds
cases, so it can fall behind what the feature sees. A suite with
`draftFromActivity` lets the weekly check draft cases from your app's
real activity (inputs people rated, inputs admins flagged) since last
week. Each arrives as a draft with a pending answer, or none, so a person
reviews it before any test grades against it; nothing is confirmed on
anyone's behalf. Each draft names what it came from (its `sourceRef`), so
the same thing is never drafted twice, even weeks later or after the case
is retired. A suite drafts at most 5 a week (you can set another limit),
so upkeep stays cheap and the review queue stays short. The method is
your app's code: it strips names, contact details, and anything
identifying from each input, and uses only inputs people agreed to share.

**Feedback.** People rate the feature's answers in your product, thumbs
up or down, with a reason after a thumbs down. One rating per person per
answer; rating again replaces it, and clicking the same thumb takes it
back. A feature is flagged when it has at least 5 ratings in a week and at
least 20% are thumbs down. When your app keeps the input behind an answer
(de-identified, and only with the person's consent), a rating can become a
draft case on that real input. From a thumbs down, the case has no answer:
a person writes what a good one is. From a thumbs up, the model's answer is
proposed as a pending answer for a person to confirm. Either way, nothing
is confirmed on anyone's behalf, and a draft is left out of tests until it
has an answer.

**Long tests.** Each answer times out (60 seconds by default). On a
platform with a request limit, a test answers what fits, then hands the
rest to a fresh request (a _leg_), up to 6 legs, and only when the leg
made progress. A test with no new answer for 6 minutes is marked failed.
A provider out of credits stops the test instead of failing every answer.
