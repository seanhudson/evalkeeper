import { expect, test } from "@playwright/test";

// Changing what a feature favors saves a version, which rolling back
// undoes. Demo models only; no AI calls.

test("change a feature's priority, and roll it back", async ({ page }) => {
  await page.goto("/evals/ticket_routing");
  const models = page.locator("section", {
    has: page.getByRole("heading", { name: "Models", exact: true }),
  });
  const favors = models.getByRole("button", { name: /^Favors / });
  const before = await favors.innerText();
  const form = page.getByRole("dialog", { name: "What this feature favors" });

  // The chip opens it; its X, Escape, and a click outside close it.
  await favors.click();
  await form.getByRole("button", { name: "Close" }).click();
  await expect(form).toBeHidden();
  await favors.click();
  await page.keyboard.press("Escape");
  await expect(form).toBeHidden();
  await favors.click();
  await page.getByRole("heading", { name: "Models", exact: true }).click();
  await expect(form).toBeHidden();

  await favors.click();
  const next = before === "Favors speed" ? "cost" : "speed";
  await page.getByLabel("Once accuracy holds, favor").selectOption(next);
  await page.getByLabel(/^Why\?/).fill("People wait on it");
  await page.getByRole("button", { name: "Save as a new version" }).click();
  await expect(models.getByText(`Favors ${next}`)).toBeVisible();
  await expect(form).toBeHidden();

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
