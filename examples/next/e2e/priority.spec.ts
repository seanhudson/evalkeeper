import { expect, test } from "@playwright/test";

// Changing what a feature favors saves a version, which rolling back
// undoes. Demo models only; no AI calls.

test("change a feature's priority, and roll it back", async ({ page }) => {
  await page.goto("/evals/ticket_routing");
  const models = page.locator("section", {
    has: page.getByRole("heading", { name: "Models", exact: true }),
  });
  const before = await models.getByText(/^Favors /).innerText();
  await models.getByText("Change", { exact: true }).click();
  const next = before === "Favors speed" ? "cost" : "speed";
  await page.getByLabel("Once accuracy holds, favor").selectOption(next);
  await page.getByLabel(/^Why\?/).fill("People wait on it");
  await page.getByRole("button", { name: "Save as a new version" }).click();
  await expect(models.getByText(`Favors ${next}`)).toBeVisible();

  const history = page.locator("section", {
    has: page.getByRole("heading", { name: "Versions" }),
  });
  const top = history.getByRole("article").first();
  await expect(top.getByText(/^Favors: .+ → /)).toBeVisible();
  await expect(top.getByText("People wait on it")).toBeVisible();

  const previous = history.getByRole("article").nth(1);
  await previous.getByPlaceholder("Why roll back?").fill("Back as it was");
  await previous.getByRole("button", { name: /^Roll back to v\d+$/ }).click();
  await expect(models.getByText(before)).toBeVisible();
});
