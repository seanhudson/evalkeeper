import { expect, test } from "@playwright/test";

// The weekly check: the cron route only answers its secret, and "Run it
// now" runs every suite's quick set on its live model (demo models only).

test("the cron route needs the secret", async ({ request }) => {
  expect((await request.get("/api/cron/evals-weekly")).status()).toBe(401);
  const wrong = await request.get("/api/cron/evals-weekly", {
    headers: { authorization: "Bearer wrong" },
  });
  expect(wrong.status()).toBe(401);
  const right = await request.get("/api/cron/evals-weekly", {
    headers: { authorization: "Bearer e2e-cron-secret" },
  });
  expect(right.status()).toBe(202);
});

test("running the weekly check shows when it ran and what it found", async ({
  page,
}) => {
  await page.goto("/evals");
  const card = page.locator("section", {
    has: page.getByRole("heading", { name: "Weekly check" }),
  });
  await card.getByRole("button", { name: "Run it now" }).click();
  await expect(card.getByText(/Last run/)).toBeVisible({ timeout: 60_000 });
  // Whatever it found, it says so: all clear, or each thing to look at.
  await expect(
    card
      .getByText(/All clear|Drift|Didn't finish|Retiring|Thumbs down/)
      .first(),
  ).toBeVisible();
});
