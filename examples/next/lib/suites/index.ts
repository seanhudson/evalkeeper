import type { AnySuite } from "@crowandraven/evalkeeper";
import {
  actionItems,
  actionItemsTexts,
  actionItemsVersion,
} from "./actionItems";
import { ticketRouting, routingTexts, routingVersion } from "./ticketRouting";
import { ticketTriage, triageTexts, triageVersion } from "./ticketTriage";
import { triageInjection } from "./triageInjection";

// An injection suite runs on its base suite's operation: list it after
// the base, and find a feature's suite with !isInjectionSuite.
export const SUITES: AnySuite[] = [
  ticketTriage,
  actionItems,
  ticketRouting,
  triageInjection,
];
export const SUITE_BY_KEY = Object.fromEntries(SUITES.map((s) => [s.key, s]));

/** Each operation's instructions hash, so editing them marks tests old. */
export const PROMPT_VERSIONS: Record<string, string> = {
  ticket_triage: triageVersion,
  action_items: actionItemsVersion,
  route_ticket: routingVersion,
};

/** Each operation's instructions as text, to find cases copied into them. */
export const INSTRUCTION_TEXTS: Record<string, string[]> = {
  ticket_triage: triageTexts,
  action_items: actionItemsTexts,
  route_ticket: routingTexts,
};

/** Features answered by decision models rather than text. */
export const DECISION_OPERATIONS = new Set(["route_ticket"]);
