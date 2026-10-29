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

**Ready-made suites** in `@crowandraven/evalkeeper/suites`, to use as
they are or read as patterns:

- **Prompt injection** (`injectionSuite`): wraps any suite whose feature
  reads text it can't trust (a customer's message, an email, a web page)
  and tests it against a library of attacks. [Write suites](suites.md#test-against-prompt-injection) has the setup.
- **Crisis risk** (`crisisRiskSuite`) and **hopelessness**
  (`hopelessnessSuite`): for apps that read chat messages. Each ships
  about 90 made-up messages, already reviewed by the suite's author, so
  they count as confirmed in every app. You pass your own detector as
  `run`:

  ```ts
  import { crisisRiskSuite } from "@crowandraven/evalkeeper/suites";

  export const crisisRisk = crisisRiskSuite({
    operation: "detect_crisis",
    async run(input, ctx) {
      const d = await detectCrisis(input.message, input.earlier, ctx.model);
      ctx.onCost(d.costUsd);
      return { flagged: d.flagged, risk: d.risk, via: d.via };
    },
    // Cases of your own, beside the shipped ones:
    extraCases: [{ message: "this job search is killing me", group: "slang" }],
  });
  ```

  Add it to your suites, then bring in its cases with
  `importStarters(store, crisisRisk)` ([Write suites](suites.md#cases-you-already-have)). They show up in its answer
  key marked "Author reviewed"; change any answer you disagree with, and
  add cases in your users' own words. Pass `shippedReviews: false` to
  confirm every case yourself. The cases are a starting point, not
  clinically validated: review them with people who have crisis-line or
  clinical experience before relying on them.
