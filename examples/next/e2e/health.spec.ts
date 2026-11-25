import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { prismaStore } from "@crowandraven/evalkeeper/prisma";

// Answer-key health on a feature's page: an old draft nobody reviewed is
// retired from the panel, and a suite under 50 cases keeps every case
// even when every model gets them right. The draft is made-up and removed
// afterwards.

const prisma = new PrismaClient({ datasourceUrl: "file:./e2e.db" });
const MARK = "e2e old draft";
const subject = "Old draft nobody reviewed";

test.beforeAll(async () => {
  const c = await prismaStore(prisma).createCase({
    suite: "action_items",
    input: { notes: `${subject}. Kim will book the room.` },
    tags: ["review"],
    split: "DEV",
    status: "ACTIVE",
    source: "MODEL_DRAFT",
    sourceRef: null,
    note: MARK,
    labels: [
      {
        kind: "EXPECTED",
        status: "PENDING",
        value: { items: ["Kim books the room"] },
        raterRole: "MODEL",
        raterId: null,
        note: null,
      },
    ],
  });
  await prisma.evalCase.update({
    where: { id: c.id },
    data: { createdAt: new Date(Date.now() - 40 * 86_400_000) },
  });
});

test.afterAll(async () => {
  await prisma.evalCase.deleteMany({ where: { note: MARK } });
  await prisma.$disconnect();
});

test("retires an old draft from the answer-key health panel", async ({
  page,
}) => {
  await page.goto("/evals/action_items");
  const health = page.locator('section[aria-labelledby="answer-key-health"]');
  await expect(health.getByText(/1 draft nobody reviewed/)).toBeVisible();
  const draft = page.locator("details").filter({ hasText: subject });
  await expect(draft).toHaveCount(1);

  await health.getByRole("button", { name: "Retire 1 old draft now" }).click();
  await expect(draft).toHaveCount(0);
});

test("keeps every case of a suite under 50, even when all models get them right", async ({
  page,
}) => {
  await page.goto("/evals/ticket_triage");
  await page
    .locator('section[aria-labelledby="models"]')
    .getByRole("button", { name: "Test every model" })
    .click();
  await expect(page.getByRole("status", { name: "Testing" })).toHaveCount(0, {
    timeout: 60_000,
  });
  await page.reload();
  // 16 cases: under the floor of 50, so nothing is offered for retiring.
  await expect(
    page.getByRole("button", { name: /^Retire \d+ easy cases?$/ }),
  ).toHaveCount(0);
});
