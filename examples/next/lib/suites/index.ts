import type { AnySuite } from "evalkeeper";
import { actionItems, actionItemsVersion } from "./actionItems";
import { ticketTriage, triageVersion } from "./ticketTriage";

export const SUITES: AnySuite[] = [ticketTriage, actionItems];
export const SUITE_BY_KEY = Object.fromEntries(SUITES.map((s) => [s.key, s]));

/** Each operation's instructions hash, so editing them marks tests old. */
export const PROMPT_VERSIONS: Record<string, string> = {
  ticket_triage: triageVersion,
  action_items: actionItemsVersion,
};
