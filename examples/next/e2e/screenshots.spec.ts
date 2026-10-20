import { expect, test, type Page } from "@playwright/test";

/**
 * Screenshots for the README and docs (docs/screenshots), taken on the
 * production build with demo models. Skipped in normal test runs: run
 * `npm run screenshots` in examples/next.
 */
test.skip(!process.env.SCREENSHOTS, "Only with npm run screenshots");
test.describe.configure({ mode: "serial" });

const OUT = "../../docs/screenshots";
const SCHEMES = ["light", "dark"] as const;

async function testEveryModel(page: Page, suite: string) {
  await page.goto(`/evals/${suite}`);
  await page.getByRole("button", { name: "Test every model" }).click();
  // Done when no row is still testing.
  await expect(page.getByRole("status", { name: "Testing" })).toHaveCount(0, {
    timeout: 60_000,
  });
  await page.reload();
}

test("fill the pages with tests, a rating, and a weekly check", async ({
  page,
}) => {
  await testEveryModel(page, "ticket_triage");
  await testEveryModel(page, "action_items");
  // A promotion for the settings history.
  await page.goto("/evals/ticket_triage");
  await page.getByRole("button", { name: "Use these" }).click();
  await expect(page.getByText("Live now").first()).toBeVisible();

  await page.goto("/try");
  await page.getByLabel("Subject").fill("Charged twice for March");
  await page
    .getByLabel("Message")
    .fill("My card shows two charges of $49 this month. Please refund one.");
  await page.getByRole("button", { name: "Triage it" }).click();
  const answer = page.getByRole("article", {
    name: "Answer: Charged twice for March",
  });
  await answer.getByRole("button", { name: "Not a good answer" }).click();
  await answer
    .getByLabel("What was wrong?")
    .fill("This is a billing problem, and it's urgent");
  await answer.getByRole("button", { name: "Send" }).click();
  await expect(answer.getByText("Thanks: that helps.")).toBeVisible();

  await page.goto("/evals");
  await page.getByRole("button", { name: "Run it now" }).click();
  await expect(page.getByText(/Last run/)).toBeVisible({ timeout: 60_000 });
});

for (const scheme of SCHEMES) {
  test(`take the screenshots (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.setViewportSize({ width: 1280, height: 900 });
    const shot = (name: string) =>
      page.screenshot({ path: `${OUT}/${name}-${scheme}.png` });

    await page.goto("/evals");
    await shot("hub");

    await page.goto("/evals/ticket_triage");
    await page
      .getByRole("heading", { name: "Models" })
      .scrollIntoViewIfNeeded();
    await page.evaluate(() => {
      window.scrollBy(0, -120);
    });
    await shot("board");

    const kase = page
      .locator("details")
      .filter({ hasText: "Former employee still has access" })
      .first();
    await kase.locator("summary").first().click();
    await kase.scrollIntoViewIfNeeded();
    await page.evaluate(() => {
      window.scrollBy(0, -80);
    });
    await shot("answer-key");

    await page.goto("/evals/ticket_triage");
    await page
      .getByRole("heading", { name: "Settings history" })
      .evaluate((el) => {
        el.scrollIntoView({ block: "start" });
        window.scrollBy(0, -24);
      });
    await shot("history");

    await page.goto("/evals/feedback");
    await shot("feedback");

    await page.goto("/try");
    await shot("try");
  });
}
