import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

// Drafting from activity: the weekly check turns a ticket someone tried
// (and agreed to keep) into a draft case with a pending answer, without
// its contact details, says so on the hub, and links to the review. It
// never drafts the same ticket twice. Demo models only; the made-up
// ticket and its cases are removed afterwards.

const prisma = new PrismaClient({ datasourceUrl: "file:./e2e.db" });
// No digits: drafting replaces long numbers, and the e2e database is fresh.
const subject = "Activity case for review";
let answerId = "";

test.beforeAll(async () => {
  const answer = await prisma.demoAnswer.create({
    data: {
      operation: "ticket_triage",
      input: {
        subject,
        body: "Charged twice for March. Write to pat@example.com or call 555 010 1234.",
      },
      output: { category: "billing", urgency: "high" },
      consented: true,
    },
  });
  answerId = answer.id;
});

test.afterAll(async () => {
  await prisma.evalCase.deleteMany({ where: { sourceRef: answerId } });
  await prisma.demoAnswer.deleteMany({ where: { id: answerId } });
  await prisma.$disconnect();
});

test("the weekly check drafts a case from a kept ticket, for review", async ({
  page,
}) => {
  await page.goto("/evals");
  const card = page.locator("section", {
    has: page.getByRole("heading", { name: "Weekly check" }),
  });
  await card.getByRole("button", { name: "Run it now" }).click();

  // Drafting runs after the page answers, so look until it shows.
  const drafted = card.getByRole("listitem").filter({ hasText: "Drafted" });
  await expect(async () => {
    await page.reload();
    await expect(
      drafted.filter({ hasText: /Ticket triage: \d+ cases? drafted/ }),
    ).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 60_000 });

  await drafted
    .filter({ hasText: "Ticket triage" })
    .getByRole("link", { name: "Review them" })
    .click();
  await expect(page).toHaveURL(/\/evals\/ticket_triage#answer-key$/);

  // Pending, not confirmed, and without the email or phone number.
  const draft = page.locator("details").filter({ hasText: subject });
  await expect(draft).toHaveCount(1);
  await expect(draft.getByText("Pending", { exact: true })).toBeVisible();
  await draft.locator("summary").first().click();
  await expect(draft.getByText("[email]").first()).toBeVisible();
  await expect(draft.getByText("pat@example.com")).toHaveCount(0);

  // Running it again the same week adds nothing new.
  await page.goto("/evals");
  await card.getByRole("button", { name: "Run it now" }).click();
  await expect(card.getByText(/Last run/)).toBeVisible({ timeout: 60_000 });
  expect(await prisma.evalCase.count({ where: { sourceRef: answerId } })).toBe(
    1,
  );
});
