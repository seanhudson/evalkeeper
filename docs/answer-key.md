# Build your answer key

A feature's answer key is its set of cases: real inputs, each with the
answer a person on your team confirmed. It's what every model is graded
against, so a test is only as good as its answer key. This guide covers
adding cases, confirming their answers, and keeping a model's guesses
from becoming the truth.

Every feature's answer key is at the bottom of its page in your admin.

## How many cases

Start with 10 to 20 real inputs, with names and personal details
removed, and grow toward 50. Pick the inputs that matter: the common
ones, the ones that went wrong before, and the edge cases a person would
argue about. A score on a handful of cases can be off by a lot; every
score says how many cases it rests on and how far off it could be.

Keep a few cases aside as a held-out set (`TEST`) that you never tune
your prompt against, and tune against the rest (`DEV`).

## Add a case by hand

Press **Add a case** at the top of the answer key. Fill in the input as
your feature would see it, then the right answer, and save. A case you
add with its answer is confirmed: you're the person who said it's right.

![The "Add a case" form on a feature's page: the ticket's subject and message, its category and urgency, and a button to add it.](screenshots/add-case-light.png "Adding a case to the ticket triage feature.")

Each field has a label and a short help text from the suite, so a
teammate confirming answers weeks later knows what each one means.

## Confirm drafted answers

Cases also arrive as drafts, with an answer someone or something
proposed but nobody has checked:

- **A model drafted it**, from your app's real activity (the weekly
  check can draft a few a week; see [Keep the answer key
  useful](upkeep.md)).
- **A thumbs down** was turned into a case ([Thumbs from your
  users](thumbs.md)).
- **An import** brought in test data you already had ([Cases you
  already have](suites.md#cases-you-already-have)).

A draft's answer is **Pending**: it's never graded against. Open the
case, read the input and the proposed answer, and either press **Confirm
this answer** or fix it first with **Edit answer**. Confirming one opens
the next draft waiting, so you can work through them in a row.

![A drafted case open in the answer key: the ticket, the model's proposed category and urgency marked pending, and a button to confirm the answer.](screenshots/confirm-light.png "A drafted answer waiting for a person.")

When a model drafts many cases at once, have it flag the ones it's
unsure of and review those first, and check every term in its answer
against the input. In one app, 43 of 218 drafted terms were things the
input never said.

## Answers you can use before you've checked them

Sometimes the owner says "use them so we can test, I'll review later."
Answers imported as **Provisional** are used by tests, and every score
that rests on them says so. Confirm them on the answer key when you can.
Nothing is ever confirmed on someone's behalf.

## Rate blind

When a feature's cases are items your app already handled (the cases
are real tickets, and the answers are what someone did with them), what
someone did isn't proof it was right, and seeing what the app decided
sways the person rating. For these suites (`caseKind: "imported"`), the
answer key links to **Rate blind**: one case at a time, its input only,
never the app's answer. Give the right answer and a reason, or skip it.
Each rating is that person's own confirmed answer.

## Answers that came with a suite

The ready-made crisis risk and hopelessness suites ship cases their
author already reviewed. They arrive confirmed and marked **Author
reviewed** (or **Expert reviewed**). Read them anyway: your app's users
may say things differently. Change any answer you disagree with; your
answer takes over, and the shipped review never replaces it.

## When you change an answer

Changing or confirming an answer makes earlier tests **Out of date** on
the board. Press **Rescore tests** to grade the answers those tests
already have against the new answer key. It's free: rescoring never
calls a model.
