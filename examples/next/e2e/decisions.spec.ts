import { expect, test, type Page } from "@playwright/test";

// A decision suite: models answer typed questions with probabilities, and
// the board shows probability quality and calibration next to accuracy,
// with which models' probabilities are native or prompted.

const modelRow = (page: Page, label: string) =>
  page.getByRole("row").filter({ has: page.getByText(label, { exact: true }) });

test("the decision board shows probability quality, calibration, and native vs prompted", async ({
  page,
}) => {
  await page.goto("/evals/ticket_routing");
  await expect(
    page.getByRole("heading", { name: "Ticket routing (decisions)" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Test every model" }).click();
  await expect(page.getByRole("status", { name: "Testing" })).toHaveCount(0, {
    timeout: 60_000,
  });
  await page.reload();

  await expect(
    page.getByRole("columnheader", { name: /Probability quality/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: /Calibration error/ }),
  ).toBeVisible();

  const careful = modelRow(page, "Demo Careful");
  await expect(careful.getByText("Native probabilities")).toBeVisible();
  await expect(careful.getByText(/\d+%/).first()).toBeVisible();
  await expect(
    modelRow(page, "Demo Legacy").getByText("Prompted", { exact: true }),
  ).toBeVisible();

  // The test's page shows each answer's probabilities with the bar (#67).
  await careful.getByRole("link", { name: /\d+%/ }).click();
  await expect(page.getByText(/\d+% true, bar \d+%/).first()).toBeVisible();

  // Text-only checks don't show these columns.
  await page.goto("/evals/ticket_triage");
  await expect(
    page.getByRole("columnheader", { name: /Probability quality/ }),
  ).toHaveCount(0);
});
