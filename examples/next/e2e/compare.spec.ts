import { expect, test, type Page } from "@playwright/test";

// Comparing two tests and reading their answers side by side. Demo models
// only: nothing here calls a paid model.

const modelRow = (page: Page, label: string) =>
  page.getByRole("row").filter({ has: page.getByText(label, { exact: true }) });

/** Tests a model on the suite page, unless it already has a score. */
async function tested(page: Page, label: string) {
  const row = modelRow(page, label);
  const score = row.getByRole("link", { name: /\d+%/ });
  if (!(await score.count()))
    await row.getByRole("button", { name: "Test", exact: true }).click();
  await expect(score).toBeVisible({ timeout: 30_000 });
}

test("the board links a model's verdict to its comparison with live", async ({
  page,
}) => {
  await page.goto("/evals/ticket_triage");
  await tested(page, "Demo Legacy");
  await tested(page, "Demo Quick");
  await page.reload();
  await modelRow(page, "Demo Quick")
    .getByRole("link", { name: /accurate|Too few/ })
    .click();

  await expect(
    page.getByRole("heading", { name: /Compare two tests/ }),
  ).toBeVisible();
  // The live model's test is in place, the one clicked is the challenger.
  await expect(
    page.getByLabel(/In place/).locator("option:checked"),
  ).toHaveText(/Demo Legacy/);
  await expect(
    page.getByLabel(/Challenger/).locator("option:checked"),
  ).toHaveText(/Demo Quick/);
  await expect(page.getByRole("heading", { name: /Verdict/ })).toBeVisible();
  await expect(page.getByText(/16 shared cases/)).toBeVisible();
  await expect(
    page.getByRole("row").filter({ hasText: "Right category" }),
  ).toContainText(/\d+% \(\d+\/16\)/);

  // Each case they disagree on links to its answers side by side.
  const heading = page.getByRole("heading", { name: /Where they differ/ });
  await expect(heading).toHaveText(/\((\d+)\)/);
  const count = Number(
    /\((\d+)\)/.exec((await heading.textContent()) ?? "")?.[1],
  );
  expect(count).toBeGreaterThan(1);
  await page.getByRole("link", { name: "Read them side by side" }).click();

  await expect(page.getByText(`1 of ${count} where they differ`)).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /Expected answer/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Demo Legacy" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Demo Quick" })).toBeVisible();
  // Every check on both answers, passed or failed.
  await expect(page.getByLabel("Failed").first()).toBeVisible();
  const first = await page.getByRole("heading", { level: 1 }).textContent();

  // Next and previous step through the disagreements.
  const nav = page.getByRole("navigation", { name: "Cases where they differ" });
  await nav.getByRole("link", { name: "Next" }).click();
  await expect(page.getByText(`2 of ${count} where they differ`)).toBeVisible();
  await nav.getByRole("link", { name: "Previous" }).click();
  await expect(page.getByText(`1 of ${count} where they differ`)).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(first ?? "");

  // And back to the comparison.
  await page.getByRole("link", { name: "Compare" }).click();
  await expect(page.getByRole("heading", { name: /Verdict/ })).toBeVisible();
});

test("a test's page compares it with the live model's, and the picker swaps them", async ({
  page,
}) => {
  await page.goto("/evals/ticket_triage");
  await tested(page, "Demo Legacy");
  await tested(page, "Demo Quick");
  await modelRow(page, "Demo Quick")
    .getByRole("link", { name: /\d+%/ })
    .click();
  await page.getByRole("link", { name: "Compare with another test" }).click();

  // Without a test in place, the live model's latest is picked.
  await expect(
    page.getByLabel(/In place/).locator("option:checked"),
  ).toHaveText(/Demo Legacy/);
  await expect(page.getByRole("heading", { name: /Verdict/ })).toBeVisible();

  await page.getByRole("link", { name: "Swap them" }).click();
  await expect(
    page.getByLabel(/In place/).locator("option:checked"),
  ).toHaveText(/Demo Quick/);
  await expect(
    page.getByText(
      /^(Demo Legacy is (better|worse)|No clear difference: Demo Legacy)/,
    ),
  ).toBeVisible();

  // Picking the same test twice can't be compared.
  const quick = await page
    .getByLabel(/In place/)
    .locator("option:checked")
    .getAttribute("value");
  await page.getByLabel(/Challenger/).selectOption(quick ?? "");
  await page.getByRole("button", { name: "Compare" }).click();
  await expect(page.getByText(/can't be compared/)).toBeVisible();
});

test("the comparison's words explain themselves on keyboard focus", async ({
  page,
}) => {
  await page.goto("/evals/ticket_triage");
  await tested(page, "Demo Legacy");
  await tested(page, "Demo Quick");
  await page.reload();
  await modelRow(page, "Demo Quick")
    .getByRole("link", { name: /accurate|Too few/ })
    .click();
  const chip = page
    .getByText(/^(Broke|Fixed|Missed differently)$/)
    .first()
    .locator("xpath=ancestor::*[@aria-describedby][1]");
  await chip.focus();
  const tip = page.locator(`#${await chip.getAttribute("aria-describedby")}`);
  await expect(tip).toBeVisible();
  await expect(tip).toContainText(/fully right|missed it in different ways/);
});
