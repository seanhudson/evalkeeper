# Keep the answer key useful

An answer key isn't written once. Models get better, your feature
changes, and new kinds of input show up. A little upkeep each week keeps
the tests telling you something: new cases for what's new, and fewer
cases that every model already gets right.

## The weekly check

Once a week, Evalkeeper tests each feature's live model again on its
quick set, and the hub's **Weekly check** reports:

- **Drift:** a live model scoring lower than it did, often a provider
  changing a model under the same name.
- **Retiring:** live models the provider is about to retire.
- **Thumbs down:** features whose share of thumbs down climbed.
- **Drafted:** new draft cases from real use, waiting for a person.
- **Didn't finish:** checks that stopped partway.

**Run it now** runs it at once; while it runs, the button shows a
spinner and each feature's line reflects its newest check, so one that
failed earlier and passed when run again no longer shows. Scheduling it is step 8 of the
[setup](adding-to-your-app.md#8-schedule-the-weekly-check).

When it flags a feature, open it, test every model, and read what
changed before you switch anything.

## Review new drafts

If your suites draft cases from real use, a few arrive each week as
drafts. Confirm or fix their answers ([Build your answer
key](answer-key.md)); a draft nobody confirms is never graded against.

## Retire cases nobody misses any more

A case every model gets right, test after test, no longer tells models
apart. It still costs money each time it runs, and it makes every score
look closer than it is. Each case in the answer key shows how many of
the models tested on it got it right (`4/4`).

### Answer key health

Once three or more models have current tests, each feature's page shows
**Answer key health** above the answer key, when something needs a
look:

![The answer key health panel: cases models split on, and tags with a single case.](screenshots/health-light.png "Answer key health on the ticket triage feature.")

It lists what to do, in order:

1. **Answers worth a second look.** Cases models split about evenly on: some give
   the answer key's answer and some don't, and each case lists which. That
   usually means the answer is wrong or the case has no clear answer.
   Decide who's right, then press one of:
   - **The answer is right:** it's confirmed again, and leaves the list
     until a newer test splits on it.
   - **Fix the answer:** opens the case to edit it.
   - **Retire it:** for a case with no right answer.

   Once it's right, a split case is the most useful kind you have. Pairs
   of near-duplicates are here too: keep the clearer one.

2. **Add cases here.** Topics (tags) with only one case, so the score on
   each rests on a single example. On a suite with `draftMore`, pick
   topics and press **Draft cases for the topics you picked** (two each;
   pick none for all). Otherwise, a topic opens **Add a case** with it
   already tagged, and **Add a case** beside them opens it untagged. **Show all topics** lists every tag and its count.
3. **Retire these.** Cases every model got fully right in four rounds of
   testing, on a suite past its target number of cases (50 unless it
   sets one): **Retire N easy cases** retires as many as keep it at its
   target or more, then rescores recent tests. And drafts nobody reviewed in 30 days, which the
   weekly check retires on its own, or **Retire N old drafts now**.

### When a case counts as easy

The point of the answer key is to keep adding cases that tell models
apart, so retiring is slow and rare by design:

- **A floor at the target.** Nothing is suggested while a suite has
  its target number of cases in use or fewer (50 unless it sets
  `targetCases` or someone changed it in **Suite settings**), and
  retiring never takes it below that. With 52 and a target of 50, at
  most 2 go; the quick set's and the oldest stay longest.
- **Four rounds.** A case qualifies only after four rounds of testing:
  days on which three or more models were tested on it and every one got
  it fully right, each model counted once and right only if every repeat
  was. One good round can be luck: a case models get right nine times in
  ten passes four rounds only about a quarter of the time.
- **Since its answer last changed.** Edit or reconfirm an answer and its
  rounds start over: passes against an old answer don't count.

A case a ranking compares with others (a suite's `gradeTogether`, like
"a role you'd apply to scores above one you'd skip") is never easy, even
when every model gets it right. Other cases' results depend on it:
retiring the clear-cut ones would leave only the close calls, and the
ranking score would drop without any model getting worse.

### Retire one case by hand

Retire a case for another reason too: its input no longer happens in
your product, or it nearly repeats another case. Open the case, open its
menu, and press **Retire case**. It leaves every future test and every
score, and its answers and past results stay in your database. Press
**Rescore tests** afterwards (free) so recent tests leave it out too.

![A case open in the answer key, with its menu showing Retire case.](screenshots/retire-light.png "Retiring one case by hand.")

## Test again when something changes

| What changed                                      | What to do                         | Costs            |
| ------------------------------------------------- | ---------------------------------- | ---------------- |
| A prompt, an output schema, or a tool description | Test again                         | A test per model |
| A provider shipped a new model                    | Add it to your catalog and test it | One test         |
| An answer or a check                              | Rescore tests                      | Free             |
| The weekly check flagged drift                    | Test every model, then decide      | A test per model |
