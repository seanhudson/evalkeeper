import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

// A feature with attack tests set up but no attack cases says so on its own
// page, and makes them from there. The cases come back afterwards, as a
// test would make them.

const prisma = new PrismaClient({ datasourceUrl: "file:./e2e.db" });
const ATTACKS = "ticket_triage_injection";

test.beforeAll(async () => {
  await prisma.evalCase.updateMany({
    where: { suite: ATTACKS, status: "ACTIVE" },
    data: { status: "RETIRED" },
  });
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("a feature without attack cases offers to make them", async ({ page }) => {
  await page.goto("/evals/ticket_triage");
  const prompt = page.getByText(
    "This feature has attack tests set up, but no attack cases yet.",
  );
  await expect(prompt).toBeVisible();
  await page.getByRole("button", { name: "Make attack cases" }).click();
  await expect(prompt).toBeHidden({ timeout: 30_000 });
  await expect(
    page.getByRole("tab", { name: /^Attacks \(\d+\)$/ }),
  ).toBeVisible();
});
