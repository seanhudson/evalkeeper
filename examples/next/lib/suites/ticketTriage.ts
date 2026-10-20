import { generateText, Output } from "ai";
import { z } from "zod";
import { costOf, instructionsHash, slot } from "@evalkeeper/ai-sdk";
import type { CheckDef, Suite } from "evalkeeper";
import { demoCall } from "../demo";
import { MODELS, isDemo } from "../models";

/**
 * Example suite: sorting a support ticket into a category and an urgency.
 * A classification task, graded by exact match against the answer key.
 */

export const CATEGORIES = [
  "billing",
  "account",
  "bug",
  "feature_request",
  "other",
] as const;
export const URGENCIES = ["low", "normal", "high"] as const;

const input = z.object({ subject: z.string(), body: z.string() });
const label = z.object({
  category: z.enum(CATEGORIES),
  urgency: z.enum(URGENCIES),
});
type Input = z.infer<typeof input>;
type Label = z.infer<typeof label>;
type Output = Label;

const SYSTEM = `You triage support tickets for a project-management app.
Pick one category: billing (charges, invoices, refunds, plans), account (sign-in, passwords, access, users), bug (something broken or wrong), feature_request (something new they want), or other.
Pick urgency: high when people can't work or money is wrong now, low for questions and wishes, normal otherwise.`;
const prompt = (i: { subject: string; body: string }) =>
  `Subject: ${i.subject}\n\n${i.body}`;
const schema = z.object({
  category: z.enum(CATEGORIES).describe("The one category that fits best"),
  urgency: z.enum(URGENCIES).describe("How soon someone should answer"),
});

/** The instructions' hash: editing them marks older tests out of date. */
export const triageVersion = instructionsHash({
  texts: [SYSTEM, prompt({ subject: slot("subject"), body: slot("body") })],
  schemas: [schema],
});

const CHECKS: CheckDef[] = [
  {
    key: "category",
    label: "Right category",
    description: "The ticket lands in the queue the answer key names.",
    kind: "label",
    severity: "serious",
  },
  {
    key: "urgency",
    label: "Right urgency",
    description:
      "Urgency matches the answer key. Minor: low and normal are often a judgment call.",
    kind: "label",
    severity: "minor",
  },
  {
    key: "not_missed",
    label: "Urgent tickets marked urgent",
    description:
      "A ticket the answer key calls high is never marked low: that's the costly mistake.",
    kind: "label",
    severity: "serious",
  },
];

type Starter = NonNullable<Suite<Input, Output, Label>["starter"]>[number];
const t = (
  subject: string,
  body: string,
  category: Label["category"],
  urgency: Label["urgency"],
  tags: string[],
  note: string,
  split: "DEV" | "TEST" = "DEV",
): Starter => ({
  input: { subject, body },
  label: { category, urgency },
  tags,
  split,
  note,
});

export const TRIAGE_STARTERS: Starter[] = [
  t(
    "Charged twice this month",
    "My card shows two charges of $49 on March 3. Please refund one.",
    "billing",
    "high",
    ["billing", "money now"],
    "Double charge: money is wrong now.",
  ),
  t(
    "Can't log in after reset",
    "I reset my password and the new one doesn't work. Our standup starts in 10 minutes.",
    "account",
    "high",
    ["account", "blocked"],
    "Locked out and blocked.",
  ),
  t(
    "Export to CSV drops the last row",
    "Every CSV export is missing the final task. Small, but our reports are off.",
    "bug",
    "normal",
    ["bug"],
    "A real bug with a workaround.",
  ),
  t(
    "Dark mode please",
    "Would love a dark theme for late nights.",
    "feature_request",
    "low",
    ["feature"],
    "A wish.",
  ),
  t(
    "Where do I change my invoice address?",
    "Our office moved. Where can I update the billing address on invoices?",
    "billing",
    "low",
    ["billing", "question"],
    "A billing question, not a problem.",
  ),
  t(
    "Board won't load",
    "Since this morning our whole team gets a blank screen on the main board. We can't work.",
    "bug",
    "high",
    ["bug", "blocked"],
    "Outage for a team.",
  ),
  t(
    "Add a teammate",
    "How do I invite a new teammate to our workspace?",
    "account",
    "low",
    ["account", "question"],
    "How-to about users.",
  ),
  t(
    "Gantt view",
    "Any plans for a Gantt chart view? Our PM asks every week.",
    "feature_request",
    "low",
    ["feature"],
    "Feature request, repeated ask.",
  ),
  t(
    "Downgrade to the free plan",
    "We'd like to move to the free plan at the end of this cycle.",
    "billing",
    "normal",
    ["billing"],
    "A plan change with no rush.",
  ),
  t(
    "Thanks!",
    "Just wanted to say the new timeline is great.",
    "other",
    "low",
    ["other"],
    "Praise, no action.",
  ),
  t(
    "Due dates shift by a day",
    "Tasks due Friday show as Thursday for teammates in Sydney.",
    "bug",
    "normal",
    ["bug", "time zones"],
    "Time-zone bug.",
  ),
  t(
    "Former employee still has access",
    "Someone who left last week can still open our workspace. Please remove them now.",
    "account",
    "high",
    ["account", "security"],
    "Security: access that should be gone.",
  ),
  t(
    "Refund for unused seats?",
    "We paid for 20 seats and use 12. Can we get credit?",
    "billing",
    "normal",
    ["billing"],
    "Money, but not urgent.",
    "TEST",
  ),
  t(
    "Calendar sync",
    "It would help if tasks showed up in our calendar.",
    "feature_request",
    "low",
    ["feature"],
    "Integration wish.",
    "TEST",
  ),
  t(
    "Attachments fail over 10MB",
    "Uploading a 12MB design file fails with no message.",
    "bug",
    "normal",
    ["bug", "files"],
    "Bug with a limit and no message.",
    "TEST",
  ),
  t(
    "Two-factor codes not arriving",
    "None of us get 2FA texts since an hour ago, so nobody can sign in.",
    "account",
    "high",
    ["account", "blocked"],
    "Team-wide lockout.",
    "TEST",
  ),
];

/** Demo models peek at the starter answers, so their differences show. */
const KNOWN = new Map(
  TRIAGE_STARTERS.map((s) => [s.input.subject, s.label] as const),
);

export const ticketTriage: Suite<Input, Output, Label> = {
  key: "ticket_triage",
  operation: "ticket_triage",
  priority: { favor: "cost" },
  label: "Ticket triage",
  description:
    "Sorting a support ticket into a category and an urgency, which picks the queue and how fast someone answers.",
  graderVersion: "1",
  unitNoun: "tickets",
  caseKind: "typed",
  input,
  labelValue: label,
  checks: CHECKS,
  async run(i, ctx) {
    if (isDemo(ctx.model)) {
      const right = KNOWN.get(i.subject) ?? {
        category: "other",
        urgency: "normal",
      };
      return demoCall(
        ctx.model,
        i.subject,
        () => right,
        () => ({
          category:
            CATEGORIES[
              (CATEGORIES.indexOf(right.category) + 1) % CATEGORIES.length
            ],
          urgency: right.urgency === "high" ? "low" : right.urgency,
        }),
        ctx.onCost,
      );
    }
    const { languageModel } = await import("../ai");
    const r = await generateText({
      model: languageModel(ctx.model),
      system: SYSTEM,
      prompt: prompt(i),
      output: Output.object({ schema }),
    });
    const usd = costOf(MODELS, ctx.model, r.usage);
    if (usd !== null) ctx.onCost(usd);
    return r.output;
  },
  async grade(_i, out, want) {
    if (!want) return CHECKS.map((c) => ({ key: c.key, pass: null }));
    return [
      {
        key: "category",
        pass: out.category === want.category,
        note: `Expected ${want.category}, got ${out.category}`,
      },
      {
        key: "urgency",
        pass: out.urgency === want.urgency,
        note: `Expected ${want.urgency}, got ${out.urgency}`,
      },
      {
        key: "not_missed",
        pass: want.urgency === "high" ? out.urgency !== "low" : null,
      },
    ];
  },
  inputFromForm(form) {
    return input.parse({
      subject: String(form.get("subject") ?? "").trim(),
      body: String(form.get("body") ?? "").trim(),
    });
  },
  labelFromForm(form) {
    return label.parse({
      category: form.get("category"),
      urgency: form.get("urgency"),
    });
  },
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
        name: "category",
        label: "Category",
        help: "The queue it belongs in: billing (charges, invoices, plans), account (sign-in, access, users), bug (something broken), feature_request (something new), or other.",
        kind: "select",
        options: CATEGORIES,
      },
      {
        name: "urgency",
        label: "Urgency",
        help: "high when people can't work or money is wrong now; low for questions and wishes; normal otherwise.",
        kind: "select",
        options: URGENCIES,
      },
    ],
  },
  starter: TRIAGE_STARTERS,
  title: (i) => i.subject,
  describe: (i) => `${i.subject}\n\n${i.body}`,
  labelHelp:
    "category: billing, account, bug, feature_request, or other. urgency: low, normal, or high.",
};
