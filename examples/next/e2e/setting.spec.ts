import { expect, test, type Page } from "@playwright/test";

// Testing a reasoning setting gives it its own row, and "Where the
// mistakes are" shows each check for every tested model. Demo models
// only: Demo Steady lists two settings, which the demo ignores.

/** A row of the model table (the breakdown's header names models too). */
const modelRow = (page: Page, label: string) =>
  page
    .locator("section", {
      has: page.getByRole("heading", { name: "Models", exact: true }),
    })
    .getByRole("row")
    .filter({ has: page.getByRole("cell", { name: label, exact: true }) });

async function waitForTests(page: Page) {
  const testing = page.getByRole("status", { name: "Testing" });
  await expect(testing.first()).toBeVisible({ timeout: 10_000 });
  await expect(testing).toHaveCount(0, { timeout: 60_000 });
  await page.reload();
}

test("test a reasoning setting, and see each check per model", async ({
  page,
}) => {
  await page.goto("/evals/action_items");
  await page
    .getByLabel(/Test a reasoning setting/)
    .selectOption({ label: "Demo Steady · high reasoning" });
  await page.getByRole("button", { name: "Test this setting" }).click();
  await waitForTests(page);

  const row = modelRow(page, "Demo Steady · high reasoning");
  await expect(row).toHaveCount(1);

  const breakdown = page.locator("section", {
    has: page.getByRole("heading", { name: "Where the mistakes are" }),
  });
  await expect(
    breakdown.getByRole("columnheader", {
      name: "Demo Steady · high reasoning",
    }),
  ).toBeVisible();
  await expect(
    breakdown.getByText("Answers with no mistakes at all"),
  ).toBeVisible();

  // The row's own Test retests at its setting: still one row for it.
  await row.getByRole("button", { name: "Test" }).click();
  await waitForTests(page);
  await expect(modelRow(page, "Demo Steady · high reasoning")).toHaveCount(1);
});
