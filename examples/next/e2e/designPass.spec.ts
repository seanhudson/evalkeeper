import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { prismaStore } from "@crowandraven/evalkeeper/prisma";

// The suite page's menu and drawers (Suite settings, Spending and daily
// limits), the to-do list following them, and a starter case a starter
// update replaced. Made-up data, removed or put back afterwards.

const prisma = new PrismaClient({ datasourceUrl: "file:./e2e.db" });
const MARK = "e2e replaced starter";
const OLD = "Old starter: Ana sends the agenda by Friday.";

test.beforeAll(async () => {
  await prismaStore(prisma).createCase({
    suite: "action_items",
    input: { notes: OLD },
    tags: ["starter"],
    split: "DEV",
    status: "ACTIVE",
    source: "IMPORT",
    // Added from the suite's starters once; no starter has this input now.
    sourceRef: "starter:action_items#0ldst4rt",
    note: MARK,
    labels: [
      {
        kind: "EXPECTED",
        status: "CONFIRMED",
        value: { items: ["Ana sends the agenda by Friday"] },
        raterRole: "OWNER",
        raterId: null,
        note: null,
      },
    ],
  });
});

test.afterAll(async () => {
  await prisma.evalCaseLabel.deleteMany({ where: { case: { note: MARK } } });
  await prisma.evalCase.deleteMany({ where: { note: MARK } });
  await prisma.evalSuiteSetting.deleteMany();
  await prisma.$disconnect();
});

const todo = (page: Page) => page.locator('section[aria-labelledby="todo"]');

/** Opens the title menu's item, and returns its drawer. */
async function openDrawer(page: Page, suite: string, item: string) {
  await page.getByRole("button", { name: `${suite} menu` }).click();
  await page.getByRole("menuitem", { name: item }).click();
  const drawer = page.getByRole("dialog", { name: item });
  await expect(drawer).toBeVisible();
  return drawer;
}

test("a suite's own target changes what its to-do list asks for", async ({
  page,
}) => {
  await page.goto("/evals/ticket_triage");
  // 16 cases of the default 50.
  await expect(todo(page).getByText(/^Add 34 cases/)).toBeVisible();

  const drawer = await openDrawer(page, "Ticket triage", "Suite settings");
  await drawer.getByLabel("Target number of cases").fill("12");
  await drawer.getByRole("button", { name: "Save" }).click();
  await expect(drawer).toBeHidden();
  await expect(todo(page).getByText(/^Add \d+ cases/)).toHaveCount(0);

  // Escape closes a drawer, and empty goes back to the suite's own.
  const again = await openDrawer(page, "Ticket triage", "Suite settings");
  await expect(again.getByLabel("Target number of cases")).toHaveValue("12");
  await page.keyboard.press("Escape");
  await expect(again).toBeHidden();
  const reset = await openDrawer(page, "Ticket triage", "Suite settings");
  await reset.getByLabel("Target number of cases").fill("");
  await reset.getByRole("button", { name: "Save" }).click();
  await expect(todo(page).getByText(/^Add 34 cases/)).toBeVisible();
});

test("spending limits save as money, in one form, and go back to the default", async ({
  page,
}) => {
  await page.goto("/evals/ticket_triage");
  // Under every limit, spending stays in the menu.
  await expect(page.getByRole("region", { name: "Eval spending" })).toHaveCount(
    0,
  );
  const drawer = await openDrawer(
    page,
    "Ticket triage",
    "Spending and daily limits",
  );
  await expect(drawer.getByText("All tests, last 24 hours")).toBeVisible();
  await drawer.getByLabel("Daily limit for all tests").fill("$7");
  await drawer.getByLabel("Daily limit for Ticket triage").fill("0.01");
  await drawer.getByRole("button", { name: "Save limits" }).click();
  await expect(drawer).toBeHidden();

  const saved = await openDrawer(
    page,
    "Ticket triage",
    "Spending and daily limits",
  );
  await expect(saved.getByLabel("Daily limit for all tests")).toHaveValue(
    "7.00",
  );
  await expect(saved.getByLabel("Daily limit for Ticket triage")).toHaveValue(
    "0.01",
  );
  // Put them back: empty is the feature's default.
  await saved.getByLabel("Daily limit for all tests").fill("5");
  await saved.getByLabel("Daily limit for Ticket triage").fill("");
  await saved.getByRole("button", { name: "Save limits" }).click();
  await expect(saved).toBeHidden();
});

test("a starter a starter update replaced is marked, and retired from the to-do list", async ({
  page,
}) => {
  await page.goto("/evals/action_items");
  const old = page.locator("details").filter({ hasText: OLD });
  await expect(old.getByText("No longer a starter")).toBeVisible();
  const item = todo(page)
    .getByRole("listitem")
    .filter({ hasText: "Retire 1 replaced starter" });
  await expect(item).toContainText("no longer among them");
  await item.getByRole("button", { name: "Retire 1" }).click();
  await expect(item).toHaveCount(0);
  await expect(old).toHaveCount(0);
});

test("every menu is the same menu: a model row's and a case's", async ({
  page,
}) => {
  await page.goto("/evals/ticket_triage");
  await page
    .getByRole("button", { name: /^Choose / })
    .first()
    .click();
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await page.locator('details[id^="case-"] summary').first().click();
  await page.getByRole("button", { name: "Case actions" }).first().click();
  await expect(
    page.getByRole("menuitem", { name: "Retire case" }),
  ).toBeVisible();
});
