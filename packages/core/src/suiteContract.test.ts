import { describe, expect, it } from "vitest";
import { z } from "zod";
import { schemaKeys, suiteContractProblems } from "./suiteContract.js";
import type { AnySuite, Suite } from "./types.js";

const input = z.object({ subject: z.string(), body: z.string() });
const label = z.object({ queue: z.string() });

const good: Suite<z.infer<typeof input>, string, z.infer<typeof label>> = {
  key: "triage",
  operation: "triage",
  priority: { favor: "cost" },
  label: "Triage",
  description: "Sorting a ticket into a queue.",
  graderVersion: "1",
  input,
  labelValue: label,
  checks: [
    {
      key: "queue",
      label: "Right queue",
      description: "The ticket lands in the right queue.",
      kind: "label",
      severity: "serious",
    },
  ],
  run: async () => "",
  grade: async () => [],
  inputFromForm: () => ({ subject: "", body: "" }),
  title: (i) => i.subject,
  fields: {
    input: [
      {
        name: "subject",
        label: "Subject",
        help: "The ticket's subject line.",
        kind: "text",
      },
      {
        name: "body",
        label: "Body",
        help: "What the customer wrote.",
        kind: "textarea",
      },
    ],
    label: [
      {
        name: "queue",
        label: "Queue",
        help: "Where the ticket should go.",
        kind: "text",
      },
    ],
  },
  starter: [
    {
      input: { subject: "Login fails", body: "Error 500." },
      label: { queue: "bugs" },
      tags: [],
      split: "DEV",
      note: "",
    },
  ],
};
const suite = (patch: Partial<typeof good>) =>
  ({ ...good, ...patch }) as unknown as AnySuite;

describe("schemaKeys", () => {
  it("reads an object's keys through wrappers", () => {
    expect(schemaKeys(input)).toEqual(["subject", "body"]);
    expect(schemaKeys(input.refine(() => true).nullable())).toEqual([
      "subject",
      "body",
    ]);
    expect(
      schemaKeys(input.optional().default({ subject: "", body: "" })),
    ).toEqual(["subject", "body"]);
  });

  it("is null for anything that isn't an object", () => {
    expect(schemaKeys(z.string())).toBeNull();
    expect(schemaKeys(z.array(input))).toBeNull();
    expect(schemaKeys(z.union([z.string(), z.number()]))).toBeNull();
  });

  it("reads every key of a union's options, in the order they appear", () => {
    const typed = z.object({ subject: z.string(), body: z.string() });
    const pasted = z.object({ pasted: z.string(), body: z.string() });
    expect(schemaKeys(z.union([typed, pasted]))).toEqual([
      "subject",
      "body",
      "pasted",
    ]);
    expect(schemaKeys(z.union([typed, z.string()]).optional())).toEqual([
      "subject",
      "body",
    ]);
  });

  it("reads a discriminated union's options, wrapped or not", () => {
    const u = z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("typed"), subject: z.string() }),
      z.object({ kind: z.literal("pasted"), text: z.string() }),
    ]);
    expect(schemaKeys(u.nullable())).toEqual(["kind", "subject", "text"]);
  });

  it("gives up on wrappers nested too deep to be a real schema", () => {
    let s: z.ZodTypeAny = input;
    for (let i = 0; i < 12; i++) s = z.union([s, z.string()]);
    expect(schemaKeys(s)).toBeNull();
  });
});

describe("suiteContractProblems", () => {
  it("finds nothing wrong with a complete suite", () => {
    expect(suiteContractProblems([good as unknown as AnySuite])).toEqual([]);
  });

  it("names fields without label or help, and keys without a field", () => {
    const problems = suiteContractProblems([
      suite({
        fields: {
          input: [{ name: "subject", label: "", help: "short", kind: "text" }],
          label: [],
        },
      }),
    ]);
    expect(problems).toEqual([
      'triage: input field "subject" has no label.',
      'triage: input field "subject" needs help that says what it means.',
      'triage: input field "body" has no label and help.',
      'triage: label field "queue" has no label and help.',
    ]);
  });

  it("asks for fields when a suite has none", () => {
    const { fields: _, ...noFields } = good;
    expect(suiteContractProblems([noFields as unknown as AnySuite])).toContain(
      'triage: input field "subject" has no label and help.',
    );
  });

  it("names checks without a description, starters that don't fit, and repeated keys", () => {
    const problems = suiteContractProblems([
      suite({
        checks: [{ ...good.checks[0]!, description: " " }],
        starter: [
          {
            input: { subject: "Hi" } as never,
            label: { queue: 3 } as never,
            tags: [],
            split: "TEST",
            note: "",
          },
        ],
      }),
      good,
    ]);
    expect(problems).toEqual([
      'triage: check "queue" has no description.',
      "triage: starter 1's input doesn't fit the schema.",
      "triage: starter 1's answer doesn't fit the schema.",
      "triage: another suite has the same key.",
    ]);
  });

  it("names a union option's key that has no field", () => {
    const typed = z.object({ subject: z.string(), body: z.string() });
    const pasted = z.object({ pasted: z.string() });
    const s = suite({
      input: z.union([typed, pasted]) as never,
      starter: [],
    });
    expect(suiteContractProblems([s])).toEqual([
      'triage: input field "pasted" has no label and help.',
    ]);
    const d = suite({
      input: z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("typed"), subject: z.string() }),
        z.object({ kind: z.literal("pasted"), body: z.string() }),
      ]) as never,
      starter: [],
    });
    expect(suiteContractProblems([d])).toEqual([
      'triage: input field "kind" has no label and help.',
    ]);
  });

  it("names help left for a field the schema no longer has", () => {
    const problems = suiteContractProblems([
      suite({
        fields: {
          input: [
            ...good.fields!.input,
            {
              name: "concernFirst",
              label: "Concern first",
              help: "Whether the concern comes before the request.",
              kind: "text",
            },
          ],
          label: [
            ...good.fields!.label,
            {
              name: "team",
              label: "Team",
              help: "The team that owns the queue.",
              kind: "text",
            },
          ],
        },
      }),
    ]);
    expect(problems).toEqual([
      'triage: input field "concernFirst" has help but the input has no such field.',
      'triage: label field "team" has help but the answer has no such field.',
    ]);
  });

  it("skips answers that aren't objects", () => {
    const s = suite({
      labelValue: z.string() as never,
      fields: { ...good.fields!, label: [] },
      starter: [],
    });
    expect(suiteContractProblems([s])).toEqual([]);
    // Help for an answer whose keys aren't known isn't left behind.
    expect(
      suiteContractProblems([
        suite({ labelValue: z.string() as never, starter: [] }),
      ]),
    ).toEqual([]);
  });
});
