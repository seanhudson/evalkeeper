"use server";

// Written by `npx @crowandraven/evalkeeper add pages`: don't edit it.
// Next.js takes server actions only from a "use server" module of your
// app, so each action here calls Evalkeeper's.
import { evalActions } from "@crowandraven/evalkeeper/next";
import { wiring } from ".";
import { EVALS_BASE } from "./paths";

const actions = evalActions({ ...wiring, basePath: EVALS_BASE });

export async function testModel(form: FormData) {
  return actions.testModel(form);
}

export async function testAll(form: FormData) {
  return actions.testAll(form);
}

export async function makeLive(form: FormData) {
  return actions.makeLive(form);
}

export async function makeFallback(form: FormData) {
  return actions.makeFallback(form);
}

export async function useSuggestion(form: FormData) {
  return actions.useSuggestion(form);
}

export async function rescore(form: FormData) {
  return actions.rescore(form);
}

export async function rollBackSettings(form: FormData) {
  return actions.rollBackSettings(form);
}

export async function confirmAnswer(form: FormData) {
  return actions.confirmAnswer(form);
}

export async function addCase(form: FormData) {
  return actions.addCase(form);
}

export async function editAnswer(form: FormData) {
  return actions.editAnswer(form);
}

export async function retireCase(form: FormData) {
  return actions.retireCase(form);
}

export async function rateBlind(form: FormData) {
  return actions.rateBlind(form);
}

export async function skipCase(form: FormData) {
  return actions.skipCase(form);
}

export async function makeCase(form: FormData) {
  return actions.makeCase(form);
}

export async function dismissFeedback(form: FormData) {
  return actions.dismissFeedback(form);
}

export async function runWeeklyNow() {
  return actions.runWeeklyNow();
}
