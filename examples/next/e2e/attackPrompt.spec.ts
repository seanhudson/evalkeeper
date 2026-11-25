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
  // An item on the to-do list, done right there.
  const todo = page
    .locator('section[aria-labelledby="todo"]')
    .getByRole("listitem")
    .filter({ hasText: "Make attack cases" });
  await expect(todo).toContainText("attacks are set up, but none are made");
  await todo.getByRole("button", { name: "Make attack cases" }).click();
  await expect(todo).toHaveCount(0, { timeout: 30_000 });
  await expect(
    page.getByRole("tab", { name: /^Attacks \(\d+\)$/ }),
  ).toBeVisible();
});
