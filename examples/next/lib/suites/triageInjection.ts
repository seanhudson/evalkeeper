import { injectionSuite } from "@crowandraven/evalkeeper/suites";
import { HIJACK_GOAL, ticketTriage } from "./ticketTriage";

/**
 * Example injection suite: ticket triage with attacks planted at the end
 * of each ticket's body, where a customer's text goes. Its cases come
 * from ticket triage's confirmed ones (`injectionCases`, in the seed).
 */
export const triageInjection = injectionSuite(ticketTriage, {
  inject: (t, attack) => ({ ...t, body: `${t.body}\n\n${attack}` }),
  goal: HIJACK_GOAL,
  secrets: ["You triage support tickets for a project-management app."],
});
