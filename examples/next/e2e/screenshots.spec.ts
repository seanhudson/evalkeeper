import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { prismaStore } from "@crowandraven/evalkeeper/prisma";

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
  test.setTimeout(600_000);
  // A drafted case waiting for a person, for the review screenshot. The
  // database is the screenshot run's own (e2e.db), rebuilt each run.
  const prisma = new PrismaClient({ datasourceUrl: "file:./e2e.db" });
  await prismaStore(prisma).createCase({
    suite: "ticket_triage",
    input: {
      subject: "Invoice shows the wrong company name",
      body: "Our invoices still say Acme Ltd. We renamed to Acme Group in May.",
    },
    tags: ["billing"],
    split: "DEV",
    status: "ACTIVE",
    source: "MODEL_DRAFT",
    sourceRef: null,
    note: "Drafted from a ticket someone agreed to share.",
    labels: [
      {
        kind: "EXPECTED",
        status: "PENDING",
        value: { category: "billing", urgency: "normal" },
        raterRole: "MODEL",
        raterId: null,
        note: null,
      },
    ],
  });
  await prisma.$disconnect();

  await testEveryModel(page, "ticket_triage");
  await testEveryModel(page, "action_items");
  await testEveryModel(page, "ticket_routing");
  // A model's Test runs its attack cases too, in the background: wait
  // for every suite to finish, so later steps don't wait on the database.
  for (const suite of [
    "ticket_triage",
    "ticket_triage_injection",
    "action_items",
    "ticket_routing",
  ]) {
    await page.goto(`/evals/${suite}`);
    await expect(page.getByRole("status", { name: "Testing" })).toHaveCount(0, {
      timeout: 120_000,
    });
  }
  // A promotion for the settings history.
  await page.goto("/evals/ticket_triage");
  await page.getByRole("button", { name: "Use these" }).click();
  await expect(page.getByText("Live now").first()).toBeVisible();

  await page.goto("/try");
  const answer = page.getByRole("article", {
    name: "Answer: Billed twice for March",
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
      page.screenshot({
        path: `${OUT}/${name}-${scheme}.png`,
        animations: "disabled",
      });

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
    // Earlier versions open, to show their roll back.
    await page
      .getByRole("button", { name: /^Show \d+ earlier version/ })
      .click();
    await page.getByRole("heading", { name: "Versions" }).evaluate((el) => {
      el.scrollIntoView({ block: "start" });
      window.scrollBy(0, -24);
    });
    await shot("history");

    // Building the answer key: the "Add a case" form, and a drafted
    // answer waiting for a person to confirm it.
    await page.goto("/evals/ticket_triage");
    await page.getByRole("button", { name: "Add a case" }).click();
    await page.getByRole("heading", { name: "New case" }).evaluate((el) => {
      el.scrollIntoView({ block: "start" });
      window.scrollBy(0, -80);
    });
    await shot("add-case");

    await page.goto("/evals/ticket_triage");
    const draft = page
      .locator("details")
      .filter({ hasText: "Invoice shows the wrong company name" })
      .first();
    await draft.locator("summary").first().click();
    await draft.evaluate((el) => {
      el.scrollIntoView({ block: "start" });
      window.scrollBy(0, -24);
    });
    await shot("confirm");

    // Where the mistakes are: each check for every tested model.
    await page.goto("/evals/ticket_triage");
    await page
      .getByRole("heading", { name: "Where the mistakes are" })
      .evaluate((el) => {
        el.scrollIntoView({ block: "start" });
        window.scrollBy(0, -24);
      });
    await shot("breakdown");

    // Answer-key health: easy cases to retire, once every model is tested.
    await page.goto("/evals/ticket_triage");
    await page
      .getByRole("heading", { name: "Answer key health" })
      .evaluate((el) => {
        el.scrollIntoView({ block: "start" });
        window.scrollBy(0, -24);
      });
    await shot("health");

    // Retiring a case: its menu in the answer key.
    await page.goto("/evals/ticket_triage");
    const easy = page
      .locator("details")
      .filter({ hasText: "Charged twice this month" })
      .first();
    await easy.locator("summary").first().click();
    await easy.getByRole("button", { name: "Case actions" }).click();
    await easy.evaluate((el) => {
      el.scrollIntoView({ block: "start" });
      window.scrollBy(0, -24);
    });
    // Off every tooltip.
    await page.mouse.move(1, 1);
    await shot("retire");

    // One test, and two tests compared.
    await page.goto("/evals/ticket_triage");
    // The cheapest model, which gets some wrong.
    await page.locator('main a[href*="/ticket_triage/runs/"]').last().click();
    await expect(page).toHaveURL(/\/runs\//);
    await shot("run");

    await page.goto("/evals/ticket_triage");
    await page
      .locator('main a[href*="/compare?"]', { hasText: "Less accurate" })
      .first()
      .click();
    await expect(page).toHaveURL(/\/compare\?/);
    await shot("compare");

    await page.goto("/evals/ticket_routing");
    await page.getByRole("heading", { name: "Models" }).evaluate((el) => {
      el.scrollIntoView({ block: "start" });
      window.scrollBy(0, -24);
    });
    await shot("decisions");

    await page.goto("/evals/feedback");
    await shot("feedback");

    await page.goto("/try");
    await shot("try");
  });
}
