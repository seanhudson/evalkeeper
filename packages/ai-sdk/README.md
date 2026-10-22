# @crowandraven/evalkeeper-ai-sdk

[Evalkeeper](https://github.com/seanhudson/evalkeeper) (the eval harness) for the Vercel AI SDK: `instructionsHash`
(so editing a prompt or schema marks older tests out of date), `costOf`
(price a call from its usage), and `createMeaningJudge` (match expected
items to a model's by meaning, cached so the same question is never paid
twice).

Every function here takes the model and settings you pass, so it works
with your app's own router and billing; Evalkeeper never picks a model
for you.
