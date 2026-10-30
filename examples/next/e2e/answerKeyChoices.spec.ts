import { expect, test, type Page } from "@playwright/test";

// Acting on the answer key from its health panel and its cases: keeping a
// split case's answer, adding a case for a thin topic, and the wait for
// tests before a suggestion. Demo models only; no AI calls.

const health = (page: Page) =>
  page.locator("section", {
    has: page.getByRole("heading", { name: "Answer key health" }),
  });

async function testEveryModel(page: Page) {
  await page.getByRole("button", { name: "Test every model" }).click();
  // While tests run there's no suggestion to act on yet.
  await expect(
    page.getByText(/Waiting for the tests running now/),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Use these" })).toHaveCount(0);
  await expect(page.getByRole("status", { name: "Testing" })).toHaveCount(0, {
    timeout: 60_000,
  });
  await page.reload();
}

test("keep a split case's answer, and it leaves the list", async ({ page }) => {
  await page.goto("/evals/ticket_triage");
  await testEveryModel(page);
  const first = health(page)
    .getByRole("listitem")
    .filter({
      has: page.getByRole("button", { name: "The answer is right" }),
    });
  const title = await first.first().getByRole("link").first().innerText();
  await expect(
    first.first().getByText(/Gave the answer key's answer:/),
  ).toBeVisible();
  await first
    .first()
    .getByRole("button", { name: "The answer is right" })
    .click();
  await expect(
    health(page).getByRole("link", { name: title, exact: true }),
  ).toHaveCount(0);
});

test("a thin topic opens Add a case with it tagged", async ({ page }) => {
  await page.goto("/evals/ticket_triage");
  const topic = health(page).locator('a[href^="#add-case="]').first();
  const name = await topic.innerText();
  await topic.click();
  await expect(page.getByLabel(/^Tags/)).toHaveValue(new RegExp(name));
});
