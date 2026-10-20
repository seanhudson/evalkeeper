import type { AnySuite } from "evalkeeper";
import { actionItems, actionItemsVersion } from "./actionItems";
import { ticketRouting, routingVersion } from "./ticketRouting";
import { ticketTriage, triageVersion } from "./ticketTriage";

export const SUITES: AnySuite[] = [ticketTriage, actionItems, ticketRouting];
export const SUITE_BY_KEY = Object.fromEntries(SUITES.map((s) => [s.key, s]));

/** Each operation's instructions hash, so editing them marks tests old. */
export const PROMPT_VERSIONS: Record<string, string> = {
  ticket_triage: triageVersion,
  action_items: actionItemsVersion,
  route_ticket: routingVersion,
};

/** Features answered by decision models rather than text. */
export const DECISION_OPERATIONS = new Set(["route_ticket"]);
