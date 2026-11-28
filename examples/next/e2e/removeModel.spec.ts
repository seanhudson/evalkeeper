import { expect, test, type Page } from "@playwright/test";

// Removing a model from one suite's tests: it leaves the model table, a
// row under the table offers Add back, and the live model can't be
// removed. Demo models only; the model is added back at the end.

const models = (page: Page) =>
  page.locator('section[aria-labelledby="models"]');
const modelRow = (page: Page, label: string) =>
  models(page)
    .getByRole("row")
    .filter({ has: page.getByText(label, { exact: true }) });

test("remove a model from a suite's tests, and add it back", async ({
  page,
}) => {
  await page.goto("/evals/ticket_routing");

  // The live model's menu has no Remove.
  await modelRow(page, "Demo Quick")
    .getByRole("button", { name: /^Choose / })
    .click();
  await expect(page.getByRole("menuitem", { name: /^Test/ })).toBeVisible();
  await expect(
    page.getByRole("menuitem", { name: "Remove from this suite" }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");

  await modelRow(page, "Demo Steady")
    .getByRole("button", { name: /^Choose / })
    .click();
  await page.getByRole("menuitem", { name: "Remove from this suite" }).click();

  // Off the table, and listed under it with Add back.
  const removed = models(page).getByText("Removed from this suite", {
    exact: true,
  });
  await expect(removed).toBeVisible();
  await expect(modelRow(page, "Demo Steady")).toHaveCount(1);
  await expect(
    modelRow(page, "Demo Steady").getByRole("button", { name: "Add back" }),
  ).toBeVisible();
  await expect(
    modelRow(page, "Demo Steady").getByRole("button", { name: /^Choose / }),
  ).toHaveCount(0);

  await modelRow(page, "Demo Steady")
    .getByRole("button", { name: "Add back" })
    .click();
  await expect(removed).toHaveCount(0);
  await expect(
    modelRow(page, "Demo Steady").getByRole("button", { name: /^Choose / }),
  ).toBeVisible();
});
