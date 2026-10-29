import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { prismaStore } from "@crowandraven/evalkeeper/prisma";

// Ways to fill the answer key: how to judge an answer, and testing with a
// draft answer before review. The draft is made-up and removed
// afterwards. Also the hub's list of AI features with no eval yet.

const prisma = new PrismaClient({ datasourceUrl: "file:./e2e.db" });
const MARK = "e2e provisional draft";
const subject = "Draft nobody reviewed yet";

test.beforeAll(async () => {
  await prismaStore(prisma).createCase({
    suite: "ticket_routing",
    input: { subject, body: "I was charged twice this month." },
    tags: ["review"],
    split: "DEV",
    status: "DRAFT",
    source: "MODEL_DRAFT",
    sourceRef: null,
    note: MARK,
    labels: [
      {
        kind: "EXPECTED",
        status: "PENDING",
        value: { queue: "billing", urgent: true },
        raterRole: "MODEL",
        raterId: null,
        note: null,
      },
    ],
  });
});

test.afterAll(async () => {
  await prisma.evalCase.deleteMany({ where: { note: MARK } });
  await prisma.$disconnect();
});

test("a suite's guide says how to judge an answer", async ({ page }) => {
  await page.goto("/evals/ticket_triage");
  await page.getByText("How to judge an answer").click();
  await expect(page.getByText("When you confirm a case, check:")).toBeVisible();
  await expect(
    page.getByText("Judge what the customer needs, not how upset they sound."),
  ).toBeVisible();
});

test("test with a draft answer, as provisional", async ({ page }) => {
  await page.goto("/evals/ticket_routing");
  const draft = page.locator("details").filter({ hasText: subject });
  await expect(draft.getByText("Pending", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Test with drafts, as provisional" })
    .click();
  await expect(draft.getByText("Provisional", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Test with drafts, as provisional" }),
  ).toHaveCount(0);
});

test("the hub lists AI features with no eval yet", async ({ page }) => {
  await page.goto("/evals");
  const section = page.locator("section", {
    has: page.getByRole("heading", { name: "No eval yet" }),
  });
  await expect(section.getByText(/Reply drafts/)).toBeVisible();
});
