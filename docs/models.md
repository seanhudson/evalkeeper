# Models and prices

Evalkeeper shows what every answer costs and what a test will cost before
you press it. It gets those numbers from one place you write: your
**model catalog**, a list of the models your app can use, with each
one's price. Evalkeeper never looks prices up itself, so they're only as
current as your catalog.

## Add a provider and its models

Say you use OpenAI today and want to see whether a Claude model does
better on one feature. Adding the provider is code in your app, then one
catalog entry per model:

1. **Install the provider's package, and set its key.** With the AI SDK,
   that's `@ai-sdk/anthropic` and `ANTHROPIC_API_KEY`, in the same
   environment your app already uses. Evalkeeper never holds keys.
2. **Let your AI code call it.** Wherever your code turns a model id
   into a model, add the provider. The example app does it in one
   function:

   ```ts
   // lib/ai.ts
   export function languageModel(model: string): LanguageModel {
     const provider = MODELS[model]?.provider;
     if (provider === "anthropic") return anthropic(model);
     if (provider === "openai") return openai(model);
     throw new Error(`No provider for ${model}`);
   }
   ```

3. **Add each model to your catalog,** with its price and where it came
   from ([The catalog](#the-catalog) has every field).
4. **Offer it.** Return it from the runner's `candidates(operation)`
   for the features it can serve. Leave out models whose key isn't set:
   the example's `availableModels()` does this.
5. **Test it.** It appears on each feature's board, marked "Not tested".
   Press its test button (the estimate shows first), or **Test every
   model**.

Nothing goes live until you choose it: the new model only competes on
the board.

## Retire a model

Providers announce when they'll stop serving a model. Record it as soon
as you hear:

```ts
"gpt-6-luna": { …, retiring: "2027-06" },
```

From then on:

- The board marks it "Retires June 2027".
- It's never suggested, as live or as fallback.
- If it's live or the fallback, the suggestion names a replacement, and
  the weekly check warns while it's within 60 days of retiring.

Then switch away from it on each feature that uses it: test every model,
and use the suggestion or **Make live** on another. Once nothing runs on
it, take it out of `candidates` so nobody spends a test on it. Keep its
catalog entry, so past tests and versions still show its name and
price.

To hide retiring models from boards unless a feature still runs on
them, create the runner with `retiringOnBoard: "inUse"`.

## Make costs show up on the pages

Costs appear in four places: each model's cost per answer on the board,
what a test spent on its page, the estimate on each test button, and
the hub's costliest live model. They need three things:

1. **A price for each model** in your catalog
   ([The catalog](#the-catalog)).
2. **Each answer's cost, reported from `run`.** Price the call from its
   token counts and pass it to `ctx.onCost`
   ([How each answer's cost is counted](#how-each-answers-cost-is-counted)).
   A suite that never calls `onCost` shows no cost.
3. **A cost per answer for estimates,** from the runner's
   `estimateCallCost`
   ([How a test's cost is estimated](#how-a-tests-cost-is-estimated)).
   Without it, a test still runs, but its button shows no estimate.

## The catalog

A `ModelCatalog` is an object keyed by the model id your code passes to
the provider:

```ts
// lib/models.ts
import type { ModelCatalog } from "@crowandraven/evalkeeper";

export const MODELS: ModelCatalog = {
  "claude-sonnet-5-5": {
    label: "Claude Sonnet 5.5",
    provider: "anthropic",
    inputPer1M: 2, // USD per million input tokens
    outputPer1M: 10, // USD per million output tokens
    cachedInputPer1M: 0.2, // input read from the prompt cache
    cacheWriteInputPer1M: 2.5, // input written to it
    source: "platform.claude.com/docs/en/about-claude/pricing, Oct 12 2026",
  },
  "gpt-6-luna": {
    label: "GPT-6 Luna",
    provider: "openai",
    inputPer1M: 0.1,
    outputPer1M: 0.5,
    efforts: ["none", "low", "medium", "high"],
    retiring: "2027-06",
    source: "developers.openai.com/api/docs/pricing, Oct 14 2026",
  },
};
```

| Field                                      | What it's for                                                                                                                             |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `label`                                    | The name people see on the board                                                                                                          |
| `provider`                                 | Who serves it. The suggested fallback always comes from a different provider than live                                                    |
| `inputPer1M`, `outputPer1M`                | Price in US dollars per million tokens, from the provider's pricing page                                                                  |
| `cachedInputPer1M`, `cacheWriteInputPer1M` | Prompt-cache prices, where the provider has them. Left out, cached input is priced as normal input, which overstates rather than flatters |
| `source`                                   | Where the price came from and when, so anyone can check it                                                                                |
| `efforts`                                  | The reasoning settings it accepts, lowest first                                                                                           |
| `retiring`                                 | When the provider retires it (`"2027-06"`). A retiring model is never suggested, and the weekly check warns while one is live             |
| `decisions`                                | For decision models: `"native"` or `"prompted"`                                                                                           |
| `baseline`                                 | Code your app runs instead of a model, tested for comparison and never suggested                                                          |

A model with no price still tests; its cost shows as unknown.

## Where prices come from

Copy each price from the provider's own pricing page, and put the page
and the date in `source`. Prices change, and models are renamed and
retired, so check the catalog when you add a model and when a provider
announces a change. A model through a gateway or a reseller costs what
you pay them; use that price.

## How each answer's cost is counted

Every answer's real cost comes from the tokens the call used, priced
with your catalog. With the AI SDK, `costOf` does it from the call's
`usage`, cache reads and writes included:

```ts
import { costOf } from "@crowandraven/evalkeeper/ai-sdk";

// in a suite's run(input, ctx):
const result = await generateObject({ model: provider(ctx.model), … });
ctx.onCost(costOf(MODELS, ctx.model, result.usage));
```

Without the AI SDK, call `priceCall(MODELS, model, { input, output,
cachedInput, cacheWriteInput })` with the token counts your client
reports. Pass the result to the suite's `onCost`, and the test page
shows each answer's cost, and the board each model's cost per answer.

## How a test's cost is estimated

Before a test, the board shows its estimated cost (`~$0.16`): the cost
of one answer on that model, times the answers the test still needs.
Answers to identical requests from the last 7 days are reused for free,
so they don't count, and a test with every answer reused says "Free".

Give the runner `estimateCallCost(operation, model)` for the cost of one
answer. A good estimate is what that model's last test averaged on the
feature, or your own usage records for that operation. Without it, the
estimate shows as unknown, and the test still runs.

## Which models are offered

The runner's `candidates(operation)` says which catalog models each
feature may be tested on. Leave out models whose API key isn't set, and,
for a decision feature, models that can't answer decisions. Adding a
model to the catalog and to `candidates` puts it on every board it
belongs on, ready to test.
