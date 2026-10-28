import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { prismaStore } from "@crowandraven/evalkeeper-prisma";
import { AUTHOR_REVIEWED, EXPERT_REVIEWED } from "@crowandraven/evalkeeper";

// Answers that shipped with a suite: the answer key says who reviewed
// them (the suite's author, or an expert) and shows the review's note.
// Adds two made-up cases to its own database and removes them afterwards.

const prisma = new PrismaClient({ datasourceUrl: "file:./e2e.db" });
const store = prismaStore(prisma);
const MARK = "e2e shipped reviews";
const reviewed = [
  {
    subject: "Shipped A",
    raterRole: AUTHOR_REVIEWED,
    note: "Reviewed by the suite's author for the Action items suite: Pat Example (suite author) confirmed it on 2026-05-01.",
  },
  {
    subject: "Shipped B",
    raterRole: EXPERT_REVIEWED,
    note: "Reviewed by an expert for the Action items suite: Sam Sample (meeting facilitator) confirmed it on 2026-05-20.",
  },
];

test.beforeAll(async () => {
  for (const r of reviewed)
    await store.createCase({
      suite: "action_items",
      input: { notes: `${r.subject}. Sam will send the agenda by Friday.` },
      tags: ["review"],
      split: "DEV",
      status: "ACTIVE",
      source: "IMPORT",
      sourceRef: null,
      note: MARK,
      labels: [
        {
          kind: "EXPECTED",
          status: "CONFIRMED",
          value: { items: ["Sam sends the agenda by Friday"] },
          raterRole: r.raterRole,
          raterId: "made-up reviewer",
          note: r.note,
        },
      ],
    });
});

test.afterAll(async () => {
  await prisma.evalCase.deleteMany({ where: { note: MARK } });
  await prisma.$disconnect();
});

test("the answer key says who reviewed a shipped answer", async ({ page }) => {
  await page.goto("/evals/action_items");
  const caseOf = (subject: string) =>
    page.locator("details").filter({
      has: page.locator("summary", { hasText: subject }),
    });

  const author = caseOf("Shipped A");
  await expect(
    author.locator("summary").getByText("Confirmed", { exact: true }),
  ).toBeVisible();
  await expect(
    author.locator("summary").getByText("Author reviewed", { exact: true }),
  ).toBeVisible();
  await author.locator("summary").click();
  await expect(author.getByText(/Pat Example \(suite author\)/)).toBeVisible();

  const expert = caseOf("Shipped B");
  await expect(
    expert.locator("summary").getByText("Expert reviewed", { exact: true }),
  ).toBeVisible();
});
