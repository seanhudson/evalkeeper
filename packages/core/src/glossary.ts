/**
 * What each word on an eval page means, in plain words: one source for
 * tooltips, pages, and docs, so they never disagree. Keep each entry to a
 * sentence or two a person can read while hovering.
 */
export const GLOSSARY = {
  score:
    "Accuracy: how much the model got right on every case in use. With partial credit, parts right of parts expected; otherwise answers with every check passed. Hover a score for the count.",
  seriousMistakes:
    "Must-pass: the share of answers with no must-pass miss, a mistake that changes what your product does. Hover for the count. Models are compared on these misses first.",
  time: "Speed: average seconds per answer, so lower is faster, from answers the model actually made (reused answers keep their original time).",
  favors:
    "What the suggestion weighs once accuracy holds. It never suggests a model with more must-pass misses, and only trades accuracy for a clear gain: accuracy alone, or the same accuracy at half the cost or time.",
  attackFailures:
    "Answers on the attack cases that never came back (an error or a timeout, not a wrong answer). Attacks resisted counts only complete tests: test again.",
  cost: "Average cost per answer on this model, from your catalog's prices.",
  againstLive:
    "Accuracy against the live model, paired on the same cases: better, similar (closer than these cases can tell apart), or worse. Can't tell: too few cases.",
  live: "The model this feature runs on now.",
  fallback:
    "The model that answers when the live model's provider is down. Any model can be chosen; the suggestion recommends the most accurate one from another provider.",
  retiring:
    "The provider has announced a date it stops serving this model. It's never suggested, and a retiring live model gets replaced.",
  outOfDate:
    "Cases, answers, or instructions changed since this test ran. Test again, or rescore if only answers changed (no new model answers).",
  serious:
    "Must pass: missing it changes what the product does. A must-pass check aims to pass 95% of the time unless it sets its own aim.",
  moderate:
    "Should pass: it matters, but less than a must-pass check. It aims to pass 85% of the time unless it sets its own aim, and a miss fails the answer.",
  minor:
    "Nice to have: a fair difference of judgment. It aims to pass 75% of the time unless it sets its own aim, and a miss never fails the answer.",
  aim: "The pass rate this check aims for. Under it, the check needs work.",
  reasoningSetting:
    "Some models think before answering, and how much is a setting. Less is faster and cheaper; more can be more accurate. Each setting you test gets its own row.",
  checkBreakdown:
    "How often each check passed, for every model with a current test. Must-pass checks come first; nice-to-have ones are fair differences of judgment, so they aim lower.",
  confirmed: "A person said this answer is right. Tests grade against it.",
  provisional:
    "Put to use before anyone reviewed it. Tests use it, and every score says it rests on unreviewed answers.",
  pending:
    "Proposed and not reviewed yet. Tests never grade against it until a person confirms it.",
  authorReviewed:
    "Confirmed by the suite's author, who checked this case once for every app that uses the suite. Your own confirmed answer replaces it.",
  fromBaseCase:
    "An attack case's answer, carried from the case it was made from and the person who confirmed that one. An attack shouldn't change the right answer.",
  expertReviewed:
    "Confirmed by an expert in what the suite judges, such as a crisis line counselor, once for every app that uses the suite. Your own confirmed answer replaces it.",
  dev: "A case you can look at while you change the instructions. Most cases are.",
  test: "A held-out case: kept out of sight while you change the instructions, so it shows whether a change works on cases nobody tuned it on.",
  suggestion:
    "Fixed rules pick it, so the reason given is the real one: accuracy first, then the suite's priority. Nothing changes until you choose.",
  attacksResisted:
    "Of the attacks planted where untrusted text goes, the share answered with no must-pass miss. A model's Test runs them with its cases.",
  attackCases:
    "Each is a confirmed case with an attack planted where untrusted text goes, and keeps that case's answer. A model's Test runs them, and they follow the cases as answers change.",
  updateAttackCases:
    "Brings attack cases in step with the answer key: new confirmed cases get attacks, changed answers carry over, and retired cases' attacks retire. No model calls, so it's free.",
  addAttack:
    "Attacks are written in code, in the suite's setup. This guide shows how.",
  attackResults:
    "This suite attacks another feature's cases. Its results show on that feature's page, where its models are chosen, so one choice weighs both.",
  priority:
    "What this suite cares about after accuracy: speed (someone waits), cost (it runs often in the background), or quality (only accuracy counts).",
  rescore:
    "Free: no model calls. Regrades stored answers with today's checks and answers.",
  rescoreJudged:
    "Regrades stored answers with today's checks and answers, with no new model answers. May ask the judge to compare new wording, usually a few cents.",
  attackCare:
    "How careful the suggestion is with attack cases. Strict: never more must-pass misses on them than live. Balanced: one more for a clear gain. Off: shown, not weighed.",
  useAnyway:
    "Makes this model live although the attacks hold it back, recorded in the history as your call. Read the attack cases it missed first.",
  testAll:
    "Asks every model for new answers to every case, so it costs money; the estimate is beside the button. Answers an identical request gave in the last 7 days are reused free.",
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
  rateBlind:
    "Rating imported cases one at a time from their input alone, never the app's output or what anyone did, so nothing anchors your answer. Each rating is your own confirmed answer, kept beside other people's.",
  rateQueue:
    "Your progress: cases you rated, cases you skipped, and cases still waiting for you, oldest first. Other people's answers don't count toward yours.",
  skip: "Passes on this case for you only. It gives no answer and changes no test; others can still rate it, and you can still answer it in the answer key.",
  needsAnswer:
    "A draft case with no answer yet. Write what a good answer is; until then, tests leave it out.",
  weeklyCheck:
    "Each suite's quick set, answered again on its live model every week. A drop of 15 points or more against last week's check of the same model, instructions, and grading is drift.",
  activityDraft:
    "A case drafted from what the feature saw in your app this week. Its answer is pending or missing until a person reviews it, and tests leave it out until then.",
  versions:
    "Each numbered version of this feature's settings (model, fallback, reasoning, output limit, temperature), with who changed it, when, why, and its evidence. Any version can be made live again.",
  changedOutside:
    "The app's own settings no longer matched the live version: a script, SQL, or another page changed them. Recorded as found, before the next save, so you can roll back to it.",
  inInstructions:
    "A case whose words appear in the instructions the model is told. A test then grades it on an answer it was handed, so the score rises without the model getting better.",
  newInstructions:
    "The instructions changed in code and were recorded under the same models. No model was switched.",
  instructionsEdited:
    "Instructions edited at runtime (an admin override or added guidance) were recorded under the same models. No model was switched. Dated when noticed, which can be after the edit.",
  noEvalYet:
    "AI features no suite tests yet, so nothing tells you when one gets worse. Ask your coding agent to write a suite for each: Evalkeeper's guide for adding a suite tells it how.",
  suites:
    "One suite per AI feature: its cases, the answers people confirmed, and the checks that grade any model against them. Open one to compare models and choose the live one.",
  standing:
    "Where a suite stands. Needs attention: its to-do list has something on it. Can't tell yet: no model tested, or too few cases to judge. Healthy: nothing to do.",
  checkLevels:
    "Each check's level and aim, in place of the suite's own. Grading and the suggestion use them, and a nice-to-have miss never fails an answer. Saving rescores recent tests: free, or a few cents if a check asks the judge.",
  todo: "What to do next on this suite, in order, each with why. Each is done on this page, and drops off once it's done.",
  replacedStarter:
    "Added from the suite's starter cases, which have changed since: this input is no longer one of them. Retire it, unless you want it as a case of your own.",
  targetCases:
    "How many cases this answer key aims for: when to ask for more, how many to draft, and the fewest retiring leaves. Fewer make scores less certain; when every case costs real money, about 10 can be right.",
  suiteSettings:
    "This suite's own settings, kept apart from its model versions: changing them never makes a new version.",
  spending:
    "What eval tests spent in the last 24 hours against the daily limits. At a limit, tests stop until earlier spending is more than 24 hours old.",
  answerKey:
    "The cases and the answers tests grade against. Only confirmed answers count: a model can draft answers, but they stay pending until a person confirms them. Open a case to see how each model did on it.",
  checks:
    "What a good answer gets right, one thing per check. Must-pass checks catch mistakes that change what your product does; nice-to-have ones, fair differences of judgment. Each has an aim for its pass rate.",
  probabilityQuality:
    "Confidence: how well its confidence fit its answers. Sure and right scores high; sure and wrong scores very low. Two models with the same accuracy can differ a lot here.",
  calibrationError:
    "Calibration: how far its stated confidence is from how often it's right. 0% off means its 80%-sure answers are right 80% of the time. Lower is better; trust it only with many cases.",
  nativeProbabilities:
    "Built-in probabilities: the model returns a probability for every option itself, so its confidence can be scored on every question.",
  promptedProbabilities:
    "Self-estimated: a regular model writes down how sure it is. Rougher than built-in probabilities, and only yes-or-no questions get confidence scores.",
  comparison:
    "Two finished tests of one suite, compared case by case on the cases both answered, so which cases each happened to get can't decide it.",
  inPlace:
    "The test the other is weighed against, usually the live model's. Differences are counted from it.",
  challenger:
    "The test weighed against the one in place: another model, reasoning setting, or set of instructions.",
  verdict:
    "Better, similar, or worse, read off a 95% range from resampling the shared cases. Under 5 shared cases, can't tell.",
  sharedCases: "Cases both tests answered. Only these are compared.",
  measuredDifferently:
    "The tests differ in more than the model: other cases, answers, checks, or instructions. Rescore both, or test again, before trusting the verdict.",
  passRate:
    "How often the check passed on the answers it applies to, and on how many answers.",
  disagreements:
    "Cases the two tests graded differently. No clear difference can hide cases one model gets right and the other wrong, so read them side by side.",
  broke: "The test in place got this case fully right; the challenger didn't.",
  fixed: "The challenger got this case fully right; the test in place didn't.",
  missedDifferently:
    "Neither got this case fully right, but they missed it in different ways: other checks failed, fewer parts right, or no answer on one side.",
  caseScore:
    "A test's score on this one case: 100% when every check passed, or parts right of parts expected with partial credit, averaged over repeats.",
  sideBySide:
    "Both tests' answers to one case, next to the expected answer, with what each check found. Step through every case where they differ.",
  answerKeyHealth:
    "What would keep this answer key useful: cases that no longer tell models apart, cases to check, near-duplicates, old drafts, and thin tags.",
  easyCases:
    "Cases 3 or more models got fully right in 4 rounds of testing (days), since the answer last changed. Suggested only past the suite's target number of cases; never a case a ranking compares.",
  easyFloor:
    "A suite keeps at least its target number of cases (50 unless it sets one): easy ones are never retired below that, or suggested at or under it.",
  splitCases:
    "Cases models divide about evenly on. Often the answer is unclear, so check it. Once it's right, it's the most useful kind of case.",
  nearDuplicates:
    "Pairs of cases whose inputs share nearly all their words. Keep the clearer one: a duplicate counts the same thing twice.",
  oldDrafts:
    "Drafts nobody reviewed in 30 days. They're never graded against. The weekly check retires them on its own.",
  tagCoverage:
    "How many cases in use test each tag. A tag with one case is thinly tested: a new case there tells you the most.",
  expectedAnswer:
    "The answer the checks grade against: confirmed by a person, or provisional when put to use before review.",
} as const;

/** A word the glossary defines, for tooltips. */
export type GlossaryTerm = keyof typeof GLOSSARY;
