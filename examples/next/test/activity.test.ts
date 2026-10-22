import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../lib/db";
import { keptAnswers, stripContacts } from "../lib/activity";
import { ticketTriage } from "../lib/suites/ticketTriage";

// The example's activity: tickets tried on the try page, on the throwaway
// SQLite file (see the "test" script). Made-up rows, removed afterwards.

describe("stripContacts", () => {
  it("replaces emails, phone numbers, and long digit runs", () => {
    expect(
      stripContacts(
        "Mail sam.lee+help@example.org or call +1 (555) 010-1234 about card 4111 1111 1111 1111.",
      ),
    ).toBe("Mail [email] or call [number] about card [number].");
  });

  it("leaves dates, amounts, and plain words alone", () => {
    const text = "Charged $40 twice on 3/14, invoice 2026.";
    expect(stripContacts(text)).toBe(text);
  });
});

describe("drafting ticket triage cases from kept answers", () => {
  // Rows are told apart by id, so the subjects need no unique number
  // (stripContacts would replace one).
  const mark = "Activity test";
  const ids: string[] = [];
  const since = new Date(Date.now() - 60_000);

  beforeAll(async () => {
    const rows = [
      {
        subject: `${mark} kept`,
        body: "Locked out. Reach me at pat@example.com.",
        output: { category: "account", urgency: "high" },
        consented: true,
      },
      {
        subject: `${mark} odd output`,
        body: "Something else.",
        output: { category: "unknown" },
        consented: true,
      },
      {
        subject: `${mark} not kept`,
        body: "No consent.",
        output: { category: "bug", urgency: "low" },
        consented: false,
      },
    ];
    for (const r of rows) {
      const a = await prisma.demoAnswer.create({
        data: {
          operation: "ticket_triage",
          input: { subject: r.subject, body: r.body },
          output: r.output,
          consented: r.consented,
        },
      });
      ids.push(a.id);
    }
    // An input that no longer fits the suite.
    const bad = await prisma.demoAnswer.create({
      data: {
        operation: "ticket_triage",
        input: { title: `${mark} old shape` },
        output: {},
        consented: true,
      },
    });
    ids.push(bad.id);
  });

  afterAll(async () => {
    await prisma.demoAnswer.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });

  const mine = <T extends { sourceRef: string }>(drafts: T[]) =>
    drafts.filter((d) => ids.includes(d.sourceRef));

  it("drafts only kept answers, without contact details, proposing the model's answer", async () => {
    const drafts = mine(
      (await ticketTriage.draftFromActivity?.({
        since,
        existing: [],
        limit: 50,
        known: new Set(),
      })) ?? [],
    );
    expect(drafts.map((d) => d.input.subject).sort()).toEqual([
      `${mark} kept`,
      `${mark} odd output`,
    ]);
    const kept = drafts.find((d) => d.input.subject === `${mark} kept`);
    expect(kept?.input.body).toBe("Locked out. Reach me at [email].");
    expect(kept?.label).toEqual({ category: "account", urgency: "high" });
    // An output that isn't an answer proposes none.
    expect(
      drafts.find((d) => d.input.subject === `${mark} odd output`)?.label,
    ).toBeNull();
  });

  it("skips known answers, and asks for none with no allowance left", async () => {
    const known = new Set(ids);
    expect(
      mine(
        await keptAnswers({
          operation: "ticket_triage",
          since,
          known,
          limit: 50,
        }).then((r) => r.map((x) => ({ ...x, sourceRef: x.id }))),
      ),
    ).toEqual([]);
    expect(
      await keptAnswers({
        operation: "ticket_triage",
        since,
        known: new Set(),
        limit: 0,
      }),
    ).toEqual([]);
  });
});
