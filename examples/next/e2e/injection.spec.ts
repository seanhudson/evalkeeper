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
  await row.getByRole("button", { name: /^Choose / }).click();
  await page.getByRole("menuitem", { name: /^Test/ }).click();
  await expect(row.getByText(/\d+\/\d+/)).toBeVisible({ timeout: 30_000 });
});

test("models are chosen on the base suite, not the injection suite", async ({
  page,
}) => {
  await page.goto("/evals/ticket_triage_injection");
  await expect(
    page.getByRole("heading", { name: "Models are chosen on Ticket triage" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Make live" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Make fallback" })).toHaveCount(
    0,
  );
  await expect(page.getByRole("button", { name: "Use these" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Versions" })).toHaveCount(0);
  await page
    .getByRole("link", { name: "Choose models on Ticket triage" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Ticket triage", exact: true }),
  ).toBeVisible();
});

test("one Test runs a model on the feature's cases and its attacks", async ({
  page,
}) => {
  await page.goto("/evals/ticket_triage");
  await expect(page.getByText("Attacks resisted").first()).toBeVisible();
  const row = page
    .getByRole("row")
    .filter({ has: page.getByText("Demo Quick", { exact: true }) });
  // No separate attack test: the model's Test runs both.
  await expect(row.getByRole("button", { name: "Test attacks" })).toHaveCount(
    0,
  );
  await row.getByRole("button", { name: /^Choose / }).click();
  await page.getByRole("menuitem", { name: /^Test/ }).click();
  // Demo Quick follows some hijacks: serious mistakes under attack.
  await expect(row.getByRole("link", { name: /^\d{1,2}%$/ })).toBeVisible({
    timeout: 30_000,
  });
});

test("the hub shows attacks on the base feature's card, not a card of their own", async ({
  page,
}) => {
  await page.goto("/evals");
  await expect(
    page.getByRole("heading", { name: "Ticket triage: injection" }),
  ).toHaveCount(0);
  const card = page
    .locator("div")
    .filter({
      has: page.getByRole("heading", { name: "Ticket triage", exact: true }),
    })
    .filter({ hasText: "Attacks resisted" })
    .last();
  await expect(card.getByText(/of \d+ attacks/)).toBeVisible();
});

test("the answer key shows the feature's attack cases in a tab", async ({
  page,
}) => {
  await page.goto("/evals/ticket_triage");
  const attacks = page.getByRole("tab", { name: /^Attacks \(\d+\)$/ });
  await expect(
    page.getByRole("tab", { name: /^Cases \(\d+\)$/ }),
  ).toHaveAttribute("aria-selected", "true");
  await attacks.click();
  const panel = page.getByRole("tabpanel", { name: /^Attacks/ });
  await expect(panel).toBeVisible();
  // Each is an attack on a confirmed case, made by Evalkeeper: no adding.
  await expect(
    panel
      .locator("summary")
      .filter({ hasText: /^direct: / })
      .first(),
  ).toBeVisible();
  await expect(panel.getByRole("button", { name: "Add a case" })).toHaveCount(
    0,
  );
});
