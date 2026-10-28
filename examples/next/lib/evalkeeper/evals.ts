import "server-only";
import { defineEvals } from "@crowandraven/evalkeeper/react";
import * as actions from "./actions";
import {
  answerEditors,
  feedbackStore,
  MODELS,
  routeFor,
  runner,
  settings,
  store,
  SUITES,
} from ".";
import { EVALS_BASE } from "./paths";

/**
 * Everything Evalkeeper's screens read, in one object: the wiring from
 * `./index`, the actions their forms submit to, and where the pages live.
 * It's its own module because the actions import the wiring.
 */
export const evals = defineEvals({
  runner,
  settings,
  store,
  feedbackStore,
  models: MODELS,
  suites: SUITES,
  routeFor,
  answerEditors,
  actions: {
    testModel: actions.testModel,
    testAll: actions.testAll,
    makeLive: actions.makeLive,
    makeFallback: actions.makeFallback,
    useSuggestion: actions.useSuggestion,
    rescore: actions.rescore,
    rollBackSettings: actions.rollBackSettings,
    confirmAnswer: actions.confirmAnswer,
    addCase: actions.addCase,
    editAnswer: actions.editAnswer,
    retireCase: actions.retireCase,
    runWeeklyNow: actions.runWeeklyNow,
    rateBlind: actions.rateBlind,
    skipCase: actions.skipCase,
    makeCase: actions.makeCase,
    dismissFeedback: actions.dismissFeedback,
  },
  basePath: EVALS_BASE,
});
