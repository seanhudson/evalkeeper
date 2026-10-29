# Models and prices

Evalkeeper shows what every answer costs and what a test will cost before
you press it. It gets those numbers from one place you write: your
**model catalog**, a list of the models your app can use, with each
one's price. Evalkeeper never looks prices up itself, so they're only as
current as your catalog.

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
