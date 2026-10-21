/**
 * What each word on an eval page means, in plain words: one source for
 * tooltips, pages, and docs, so they never disagree. Keep each entry to a
 * sentence or two a person can read while hovering.
 */
export const GLOSSARY = {
  score:
    "How much the model got right on every case in use. With partial credit, parts right of parts expected; otherwise answers with every check passed.",
  seriousMistakes:
    "Failed serious checks: mistakes that change what your product does. Models are compared on these first.",
  time: "Average seconds per answer, from answers the model actually made (reused answers keep their original time).",
  cost: "Average cost per answer on this model, from your catalog's prices.",
  againstLive:
    "A paired comparison with the live model on the same cases: more accurate, about as accurate, less accurate, or too few cases to tell.",
  live: "The model this feature runs on now.",
  fallback:
    "The model that answers when the live model's provider is down. Any model can be chosen; the suggestion recommends the most accurate one from another provider.",
  retiring:
    "The provider has announced a date it stops serving this model. It's never suggested, and a retiring live model gets replaced.",
  outOfDate:
    "Cases, answers, or instructions changed since this test ran. Test again, or rescore for free if only answers changed.",
  serious:
    "A mistake that changes what the product does. Serious checks should pass 95% of the time unless the check sets its own bar.",
  minor:
    "A fair difference of judgment. Minor checks should pass 75% of the time unless the check sets its own bar.",
  bar: "The pass rate this check should reach.",
  confirmed: "A person said this answer is right. Tests grade against it.",
  provisional:
    "Put to use before anyone reviewed it. Tests use it, and every score says it rests on unreviewed answers.",
  pending:
    "Proposed and not reviewed yet. Tests never grade against it until a person confirms it.",
  dev: "Cases you tune against: change prompts and checks while looking at these.",
  test: "Cases you only check: never tune against them, so they show how a change does on cases it wasn't fitted to.",
  suggestion:
    "Fixed rules pick it, so the reason given is the real one: accuracy first, then the suite's priority. Nothing changes until you choose.",
  priority:
    "What this suite cares about after accuracy: speed (someone waits), cost (it runs often in the background), or quality (only accuracy counts).",
  rescore:
    "Regrades stored answers with today's checks and answers. No model calls, so it's free.",
  tags: "What a case tests. The quick set picks cases that cover the most tags.",
  improve:
    "The suite whose best tested model scores lowest: where better cases, checks, or instructions would help most.",
  slowest:
    "The live model with the longest average answer time, across suites.",
  costliest: "The live model with the highest cost per answer, across suites.",
  thumbs:
    "Thumbs up and down people gave the feature's answers in your product, over the last 7 days.",
  keepInput:
    "Keeps what you typed, without your name, so it can become a test case for future models. Without it, a rating still counts but can't become a case.",
  makeCase:
    "Turns this rating into a draft case on its real input. A thumbs down needs a person to write the right answer; a thumbs up proposes the model's answer for a person to confirm.",
  needsAnswer:
    "A draft case with no answer yet. Write what a good answer is; until then, tests leave it out.",
  weeklyCheck:
    "Each suite's quick set, answered again on its live model every week. A drop of 15 points or more against last week's check of the same model, instructions, and grading is drift.",
  versions:
    "Each numbered version of this feature's settings (model, fallback, reasoning, output limit, temperature), with who changed it, when, why, and its evidence. Any version can be made live again.",
  suites:
    "One suite per AI feature: its cases, the answers people confirmed, and the checks that grade any model against them. Open one to compare models and choose the live one.",
  answerKey:
    "The cases and the answers tests grade against. Only confirmed answers count: a model can draft answers, but they stay pending until a person confirms them. Open a case to see how each model did on it.",
  checks:
    "What a good answer gets right, one thing per check. Serious checks catch mistakes that change what your product does; minor ones, fair differences of judgment. Each has a bar its pass rate should reach.",
  probabilityQuality:
    "How good the probabilities were: 100% minus the Brier score. High means sure when right and unsure when wrong; picking right with careless probabilities scores lower.",
  calibrationError:
    "How far the model's confidence is from how often it's right: 0% means its 80%-sure answers are right 80% of the time. It needs more cases than accuracy to be trusted.",
  nativeProbabilities:
    "The model returns its own probabilities for every option, so they can be scored and compared.",
  promptedProbabilities:
    "The model writes out its own estimate. Choices come without a distribution, so only true-or-false questions get probability scores.",
} as const;

/** A word the glossary defines, for tooltips. */
export type GlossaryTerm = keyof typeof GLOSSARY;
