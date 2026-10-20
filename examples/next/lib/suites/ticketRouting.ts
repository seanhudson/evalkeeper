import { z } from "zod";
import {
  decideAndPrice,
  instructionsHash,
} from "@crowandraven/evalkeeper-ai-sdk";
import {
  decisionCheck,
  formText,
  type CheckDef,
  type Suite,
} from "@crowandraven/evalkeeper";
import { demoDecisionModel, isDemoDecider } from "../demoDecision";
import { MODELS } from "../models";
import { CATEGORIES, TRIAGE_STARTERS } from "./ticketTriage";

/**
 * Example decision suite: routing a support ticket with a decision model
 * (the AI SDK's `experimental_decide`), which answers typed questions with
 * probabilities instead of writing text. Graded twice: did it pick right,
 * and how good were its probabilities? That second part is what tells
 * decision models apart, like Jev, GPT-6 Luna's decisions, or a prompted
 * Claude.
 */

const input = z.object({ subject: z.string(), body: z.string() });
const label = z.object({ queue: z.enum(CATEGORIES), urgent: z.boolean() });
type Input = z.infer<typeof input>;
type Label = z.infer<typeof label>;
type Output = {
  queue: {
    type: "choice";
    choice: string;
    probabilities?: Record<string, number> | undefined;
  };
  urgent: { type: "boolean"; probability: number };
};

/** The questions every model answers about a ticket. */
const QUESTIONS = {
  queue: {
    type: "choice",
    instructions: "Which support queue should this ticket go to?",
    criteria: {
      billing: "Charges, invoices, refunds, or plans",
      account: "Sign-in, passwords, access, or users",
      bug: "Something broken or wrong in the product",
      feature_request: "Something new they want",
      other: "Anything else: thanks, questions about nothing above",
    },
  },
  urgent: {
    type: "boolean",
    instructions: "Is this urgent?",
    criteria: {
      true: "People can't work, money is wrong now, or access should be gone now",
      false: "A question, a wish, or a problem with a workaround",
    },
  },
} as const;

/** The questions' hash: editing them marks older tests out of date. */
export const routingVersion = instructionsHash({
  texts: [JSON.stringify(QUESTIONS)],
});

const CHECKS: CheckDef[] = [
  {
    key: "queue",
    label: "Right queue",
    description:
      "The top choice is the queue the answer key names. Also measures how good the probabilities over the queues were.",
    kind: "label",
    severity: "serious",
  },
  {
    key: "urgent",
    label: "Urgency called right",
    description:
      "Said urgent (50% or more) exactly when the answer key does. Also measures how good the probability was.",
    kind: "label",
    severity: "serious",
  },
];

const stateOf = (i: Input) => `Subject: ${i.subject}\n\n${i.body}`;

// Demo decision models peek at the starter answers, so their differences show.
const KNOWN = new Map(
  TRIAGE_STARTERS.map((s) => [
    stateOf(s.input),
    { queue: s.label.category, urgent: s.label.urgency === "high" },
  ]),
);

type Starter = NonNullable<Suite<Input, Output, Label>["starter"]>[number];
export const ROUTING_STARTERS: Starter[] = TRIAGE_STARTERS.map((s) => ({
  input: s.input,
  label: { queue: s.label.category, urgent: s.label.urgency === "high" },
  tags: s.tags,
  split: s.split,
  note: s.note,
}));

export const ticketRouting: Suite<Input, Output, Label> = {
  key: "ticket_routing",
  operation: "route_ticket",
  priority: { favor: "cost" },
  label: "Ticket routing (decisions)",
  decisions: true,
  description:
    "Routing a support ticket with a decision model: which queue, and is it urgent, each with a probability.",
  graderVersion: "1",
  unitNoun: "tickets",
  caseKind: "typed",
  input,
  labelValue: label,
  checks: CHECKS,
  async run(i, ctx) {
    const model = isDemoDecider(ctx.model)
      ? demoDecisionModel(ctx.model, (state) => KNOWN.get(state) ?? null)
      : (await import("../ai")).decisionModel(ctx.model);
    const { answers } = await decideAndPrice({
      model,
      modelId: ctx.model,
      models: MODELS,
      state: stateOf(i),
      questions: QUESTIONS,
      onCost: ctx.onCost,
    });
    return { queue: answers.queue, urgent: answers.urgent };
  },
  async grade(_i, out, want) {
    return [
      decisionCheck("queue", out.queue, want?.queue, {
        describe: (v) => String(v).replace(/_/g, " "),
      }),
      decisionCheck("urgent", out.urgent, want?.urgent, {
        describe: (v) => (v ? "urgent" : "not urgent"),
      }),
    ];
  },
  inputFromForm(form) {
    return input.parse({
      subject: formText(form, "subject"),
      body: formText(form, "body"),
    });
  },
  labelFromForm(form) {
    return label.parse({
      queue: formText(form, "queue"),
      urgent: formText(form, "urgent") === "true",
    });
  },
  labelFromOutput: (out) =>
    label.parse({
      queue: out.queue.choice,
      urgent: out.urgent.probability >= 0.5,
    }),
  fields: {
    input: [
      {
        name: "subject",
        label: "Subject",
        help: "The ticket's subject line, as the customer wrote it.",
        kind: "text",
        required: true,
      },
      {
        name: "body",
        label: "Message",
        help: "What the customer wrote. Remove names, emails, and account numbers.",
        kind: "textarea",
        required: true,
      },
    ],
    label: [
      {
        name: "queue",
        label: "Queue",
        help: "The queue it belongs in: billing, account, bug, feature_request, or other.",
        kind: "select",
        options: CATEGORIES,
      },
      {
        name: "urgent",
        label: "Urgent",
        help: "true when people can't work, money is wrong now, or access should be gone now.",
        kind: "select",
        options: ["false", "true"],
      },
    ],
  },
  starter: ROUTING_STARTERS,
  title: (i) => i.subject,
  describe: stateOf,
  labelHelp:
    "queue: billing, account, bug, feature_request, or other. urgent: true or false.",
};
