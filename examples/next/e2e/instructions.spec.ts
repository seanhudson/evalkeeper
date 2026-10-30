import { expect, test } from "@playwright/test";

// A case copied into the instructions gets graded on an answer the model
// was handed. The suite page names it, and retiring it clears the warning
// (#71). Demo models only.

test("the suite page warns about a case whose words are in the instructions", async ({
  page,
}) => {
  await page.goto("/evals/ticket_triage");
  const warning = page.getByRole("heading", {
    name: "Cases in the instructions",
  });
  await expect(warning).toHaveCount(0);

  // A ticket that repeats the instructions' own words.
  const subject = `Copied case ${Date.now()}`;
  await page.getByRole("button", { name: "Add a case", exact: true }).click();
  await page.getByLabel("Subject").first().fill(subject);
  await page
    .getByLabel("Message")
    .first()
    .fill("Help! People can't work or money is wrong now.");
  await page.getByLabel("Category").first().selectOption("billing");
  await page.getByLabel("Urgency").first().selectOption("high");
  await page.getByRole("button", { name: "Add case" }).click();

  await expect(warning).toBeVisible();
  await expect(
    page.getByText(`${subject}: “people cant work or money is wrong now”`),
  ).toBeVisible();

  // Retire it: the warning goes.
  const added = page.locator("details").filter({ hasText: subject }).first();
  await added.locator("summary").first().click();
  await added.getByRole("button", { name: "Case actions" }).click();
  await added.getByRole("menuitem", { name: "Retire case" }).click();
  await expect(warning).toHaveCount(0);
});
