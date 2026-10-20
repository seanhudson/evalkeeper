import { expect, test, type Page } from "@playwright/test";

// Versioned settings: applying the suggestion records the defaults as v1
// and a promotion as v2, and rolling back (with a reason) makes the old
// live model live again. Demo models only.

const modelRow = (page: Page, label: string) =>
  page.getByRole("row").filter({ has: page.getByText(label, { exact: true }) });

test("use the suggestion, see it in the history, and roll it back", async ({
  page,
}) => {
  await page.goto("/evals/ticket_triage");
  await page.getByRole("button", { name: "Test every model" }).click();
  await expect(page.getByRole("status", { name: "Testing" })).toHaveCount(0, {
    timeout: 60_000,
  });
  await page.reload();

  // The suggestion replaces the retiring live model.
  await page.getByRole("button", { name: "Use these" }).click();
  await expect(
    modelRow(page, "Demo Careful").getByText("Live", { exact: true }),
  ).toBeVisible();

  const history = page.locator("section", {
    has: page.getByRole("heading", { name: "Versions" }),
  });
  const promoted = history.getByRole("article", { name: /: Promoted/ }).first();
  await expect(
    promoted.getByText("Live: Demo Legacy → Demo Careful"),
  ).toBeVisible();
  await expect(promoted.getByText("Live now")).toBeVisible();
  await expect(
    promoted.getByRole("link", { name: "The test behind it" }),
  ).toBeVisible();
  const first = history.getByRole("article", { name: "Version 1: Changed" });
  await expect(first.getByText(/default from code/)).toBeVisible();

  // Roll back to v1, with a reason.
  await first
    .getByPlaceholder("Why roll back?")
    .fill("Checking the old model in production");
  await first.getByRole("button", { name: "Roll back to v1" }).click();
  await expect(
    modelRow(page, "Demo Legacy").getByText("Live", { exact: true }),
  ).toBeVisible();
  const rolled = history
    .getByRole("article", { name: /: Rolled back/ })
    .first();
  await expect(
    rolled.getByText("Checking the old model in production"),
  ).toBeVisible();
  await expect(rolled.getByText("Live now")).toBeVisible();
});
