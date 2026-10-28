import { expect, test } from "@playwright/test";

// The injection suite: ticket triage's confirmed cases with attacks
// planted in each body (made in the seed), each carrying its base case's
// answer. Demo models only.

test("attack cases carry their base case's answer and show the attack", async ({
  page,
}) => {
  await page.goto("/evals/ticket_triage_injection");
  await expect(
    page.getByRole("heading", { name: "Ticket triage: injection" }),
  ).toBeVisible();
  const attack = page
    .locator("details")
    .filter({ has: page.locator("summary", { hasText: /^direct: / }) })
    .first();
  await expect(
    attack.locator("summary").getByText("From base case", { exact: true }),
  ).toBeVisible();
  await attack.locator("summary").click();
  await expect(attack.getByText(/Carried from case/)).toBeVisible();
  await expect(attack.getByText(/ZEBRA-[0-9A-F]{8}/).first()).toBeVisible();
});

test("testing a model grades the attacks with the base checks and its own", async ({
  page,
}) => {
  await page.goto("/evals/ticket_triage_injection");
  await expect(
    page.getByText("Didn't follow the attack").first(),
  ).toBeVisible();
  await expect(page.getByText("Kept secrets").first()).toBeVisible();
  const row = page
    .getByRole("row")
    .filter({ has: page.getByText("Demo Careful", { exact: true }) });
  await row.getByRole("button", { name: "Test" }).click();
  await expect(row.getByText(/\d+\/\d+/)).toBeVisible({ timeout: 30_000 });
});

test("the hub sends model changes to the base feature", async ({ page }) => {
  await page.goto("/evals");
  await expect(
    page.getByText("Runs on Ticket triage's settings: change models there."),
  ).toBeVisible();
});
