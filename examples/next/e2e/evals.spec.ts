import { expect, test, type Page } from "@playwright/test";

// The pages people use to test models and keep the answer key. Demo models
// only: nothing here calls a paid model.

const modelRow = (page: Page, label: string) =>
  page.getByRole("row").filter({ has: page.getByText(label, { exact: true }) });

test("the hub shows each suite and what needs attention", async ({ page }) => {
  await page.goto("/evals");
  await expect(page.getByRole("heading", { name: "Evals" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Ticket triage" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Action items" }),
  ).toBeVisible();
  await expect(page.getByText("Most room to improve")).toBeVisible();
});

test("testing a model fills in its score", async ({ page }) => {
  await page.goto("/evals/ticket_triage");
  const row = modelRow(page, "Demo Careful");
  await expect(row.getByText(/~\$|under 1¢/)).toBeVisible();
  await row.getByRole("button", { name: "Test" }).click();
  await expect(row.getByText(/\d+\/16/)).toBeVisible({ timeout: 30_000 });
  // Testing it again would reuse every answer, so the estimate says free.
  await page.reload();
  await expect(
    modelRow(page, "Demo Careful").getByText("Free: all 16 reused"),
  ).toBeVisible();
});

test("the board marks the live model and a retiring one with chips", async ({
  page,
}) => {
  await page.goto("/evals/ticket_triage");
  const legacy = modelRow(page, "Demo Legacy");
  await expect(legacy.getByText("Live", { exact: true })).toBeVisible();
  await expect(legacy.getByText("Retires January 2027")).toBeVisible();
});

test("tooltips explain the columns on keyboard focus", async ({ page }) => {
  await page.goto("/evals/ticket_triage");
  const info = page
    .getByRole("columnheader", { name: /Score/ })
    .locator("[aria-describedby]");
  await info.focus();
  const tip = page.locator(`#${await info.getAttribute("aria-describedby")}`);
  await expect(tip).toBeVisible();
  await expect(tip).toContainText("got right on every case");
});

test("a test's page shows each answer and why it was wrong", async ({
  page,
}) => {
  await page.goto("/evals/ticket_triage");
  const row = modelRow(page, "Demo Quick");
  await row.getByRole("button", { name: "Test" }).click();
  const score = row.getByRole("link", { name: /\d+%/ });
  await expect(score).toBeVisible({ timeout: 30_000 });
  await score.click();
  await expect(
    page.getByRole("heading", { name: /Demo Quick on Ticket triage/ }),
  ).toBeVisible();
  await expect(page.getByText(/answers fully right/)).toBeVisible();
  await expect(
    page.getByText(/Right category: Expected/).first(),
  ).toBeVisible();
  // The answer itself, by the suite's own field labels (#67).
  await expect(page.locator("dt").getByText("Urgency").first()).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Find the case in the answer key" }).first(),
  ).toBeVisible();
  await expect(page).toHaveTitle("Test: Ticket triage");
});

test("making a model live moves the Live chip", async ({ page }) => {
  await page.goto("/evals/action_items");
  for (const label of ["Demo Quick", "Demo Careful"]) {
    const row = modelRow(page, label);
    await row.getByRole("button", { name: "Test" }).click();
    await expect(row.getByRole("link", { name: /\d+%/ })).toBeVisible({
      timeout: 30_000,
    });
  }
  const careful = modelRow(page, "Demo Careful");
  const makeLive = careful.getByRole("button", { name: "Make live" });
  // Only offered when the comparison allows it.
  if (await makeLive.count()) {
    await makeLive.click();
    await expect(
      modelRow(page, "Demo Careful").getByText("Live", { exact: true }),
    ).toBeVisible();
  }
});

test("the answer key: open a case, add one, edit its answer, and retire it", async ({
  page,
}) => {
  await page.goto("/evals/ticket_triage");

  // Open a case to its input, answer, and status.
  const first = page
    .locator("details")
    .filter({ hasText: "Charged twice this month" })
    .first();
  await first.locator("summary").first().click();
  await expect(first.getByText("My card shows two charges")).toBeVisible();
  await expect(first.getByText("Confirmed", { exact: true })).toBeVisible();

  // Add a case.
  const subject = `E2E case ${Date.now()}`;
  await page.getByText("Add a case", { exact: true }).click();
  await page.getByLabel("Subject").first().fill(subject);
  await page
    .getByLabel("Message")
    .first()
    .fill(
      "The export button does nothing.\nInternal note: known bug, fixed in 2.1.",
    );
  await page.getByLabel("Category").first().selectOption("bug");
  await page.getByLabel("Urgency").first().selectOption("normal");
  await page.getByRole("button", { name: "Add case" }).click();
  const added = page.locator("details").filter({ hasText: subject }).first();
  await expect(added).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /17 cases in use/ }),
  ).toBeVisible();

  // The leak check took out the help desk's note, and the case says so.
  await added.locator("summary").first().click();
  await expect(
    added.getByText(
      "Removed before freezing, as learned from this case: Internal note: known bug, fixed in 2.1.",
    ),
  ).toBeVisible();
  await expect(added.getByText("known bug", { exact: false })).toHaveCount(1);

  // Edit its answer.
  await added.getByRole("button", { name: "Case actions" }).click();
  await added.getByRole("menuitem", { name: "Edit answer" }).click();
  await added.getByLabel("Urgency").selectOption("high");
  await added.getByRole("button", { name: "Save answer" }).click();
  const reopened = page.locator("details").filter({ hasText: subject }).first();
  // Saving may keep the case open; open it only if it closed.
  if ((await reopened.getAttribute("open")) === null)
    await reopened.locator("summary").first().click();
  await expect(
    reopened.locator("dd").getByText("high", { exact: true }),
  ).toBeVisible();

  // Retire it.
  await reopened.getByRole("button", { name: "Case actions" }).click();
  await reopened.getByRole("menuitem", { name: "Retire case" }).click();
  await expect(
    page.locator("details").filter({ hasText: subject }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: /16 cases in use/ }),
  ).toBeVisible();
});
