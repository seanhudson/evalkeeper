import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * The demo video for the README and launch posts (docs/demo), recorded on
 * the production build with demo models. Skipped in normal test runs: run
 * `npm run demo-video` in examples/next.
 */
test.skip(!process.env.DEMO_VIDEO, "Only with npm run demo-video");

const OUT = "../../docs/demo";
const SIZE = { width: 1280, height: 800 };

test.use({
  viewport: SIZE,
  colorScheme: "light",
  video: { mode: "on", size: SIZE },
  // Fail fast instead of waiting out the whole test on a missing button.
  actionTimeout: 30_000,
});

/** Draws a cursor the video can show, since the real one isn't recorded. */
async function showCursor(page: Page) {
  await page.addInitScript(() => {
    const draw = () => {
      const dot = document.createElement("div");
      dot.id = "demo-cursor";
      Object.assign(dot.style, {
        position: "fixed",
        width: "18px",
        height: "18px",
        marginLeft: "-9px",
        marginTop: "-9px",
        borderRadius: "50%",
        background: "rgba(37, 99, 235, 0.35)",
        border: "2px solid rgba(37, 99, 235, 0.9)",
        pointerEvents: "none",
        zIndex: "2147483647",
        left: "-40px",
        top: "-40px",
        transition: "transform 120ms",
      });
      document.body.appendChild(dot);
      document.addEventListener("mousemove", (e) => {
        dot.style.left = `${e.clientX}px`;
        dot.style.top = `${e.clientY}px`;
      });
      document.addEventListener("mousedown", () => {
        dot.style.transform = "scale(0.7)";
      });
      document.addEventListener("mouseup", () => {
        dot.style.transform = "scale(1)";
      });
    };
    // Init scripts run before the body exists.
    document.addEventListener("DOMContentLoaded", draw);
  });
}

/** Moves the cursor to an element the way a person would, then clicks it. */
async function clickSlowly(page: Page, target: Locator) {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, {
      steps: 25,
    });
  }
  await page.waitForTimeout(400);
  await target.click();
}

/** Scrolls an element to near the top of the screen, smoothly. */
async function scrollTo(page: Page, target: Locator, offset = 24) {
  await target.evaluate((el, off) => {
    const top = el.getBoundingClientRect().top + window.scrollY - off;
    window.scrollTo({ top, behavior: "smooth" });
  }, offset);
  await page.waitForTimeout(900);
}

test("record the demo", async ({ page }, testInfo) => {
  test.setTimeout(600_000);
  mkdirSync(OUT, { recursive: true });
  const start = Date.now();
  const marks: { step: string; atSeconds: number }[] = [];
  const mark = (step: string) =>
    marks.push({ step, atSeconds: (Date.now() - start) / 1000 });
  await showCursor(page);

  // 1. The hub: every AI feature and where it stands.
  mark("hub");
  await page.goto("/evals");
  await page.mouse.move(640, 300);
  await page.waitForTimeout(2500);

  // 2. One feature's page: test every model on its answer key.
  mark("suite");
  await clickSlowly(
    page,
    page.locator('a[href$="/evals/ticket_triage"]').first(),
  );
  await page.waitForURL(/\/evals\/ticket_triage/);
  await page.waitForTimeout(1200);
  const models = page.locator('section[aria-labelledby="models"]');
  await scrollTo(page, page.getByRole("heading", { name: "Models" }), 100);
  mark("test-every-model");
  await clickSlowly(
    page,
    models.getByRole("button", { name: "Test every model" }),
  );
  // The tests run in the background, attack cases too. Wait until the
  // board has a suggestion, reloading now and then as a person would.
  const testing = page.getByRole("status", { name: "Testing" });
  // Demo models can finish before the status ever shows, so don't insist.
  await testing
    .first()
    .waitFor({ timeout: 10_000 })
    .catch(() => undefined);
  await expect(testing).toHaveCount(0, { timeout: 180_000 });
  mark("tests-done");
  const suggestion = page.getByRole("button", { name: "Use the suggestion" });
  await expect(async () => {
    await page.reload();
    await expect(suggestion).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 180_000, intervals: [3000] });
  mark("suggestion-ready");
  await scrollTo(page, page.getByRole("heading", { name: "Models" }), 100);

  // 3. The board: scores, must-pass misses, speed, cost, and a suggestion.
  mark("board");
  await page.mouse.move(640, 420, { steps: 30 });
  await page.waitForTimeout(3500);
  mark("use-suggestion");
  await clickSlowly(page, suggestion);
  await expect(page.getByText("Live now").first()).toBeVisible();
  await page.waitForTimeout(2500);

  // 4. The product: a user rates an answer down, with a reason.
  mark("thumbs-down");
  await page.goto("/try");
  const answer = page.getByRole("article", {
    name: "Answer: Billed twice for March",
  });
  await expect(answer).toBeVisible();
  await page.waitForTimeout(1200);
  await clickSlowly(
    page,
    answer.getByRole("button", { name: "Not a good answer" }),
  );
  const why = answer.getByLabel("What was wrong?");
  await clickSlowly(page, why);
  await why.pressSequentially("This is a billing problem, and it's urgent", {
    delay: 45,
  });
  await clickSlowly(page, answer.getByRole("button", { name: "Send" }));
  await expect(answer.getByText("Thanks: that helps.")).toBeVisible();
  await page.waitForTimeout(1500);

  // 5. The feedback page: the thumbs down becomes a test case.
  mark("make-a-case");
  await page.goto("/evals/feedback");
  const rating = page.getByRole("article", { name: /billing problem/ });
  await expect(rating).toBeVisible();
  await page.waitForTimeout(1500);
  await clickSlowly(page, rating.getByRole("button", { name: "Make a case" }));
  await expect(
    page.getByRole("article", { name: /billing problem/ }),
  ).toHaveCount(0);
  await page.waitForTimeout(1000);

  // 6. Back in the answer key, waiting for a person to confirm.
  mark("draft-case");
  await page.goto("/evals/ticket_triage");
  const draft = page
    .locator("details")
    .filter({ hasText: "Billed twice for March" })
    .first();
  await scrollTo(page, draft, 160);
  await page.mouse.move(640, 300, { steps: 20 });
  await page.waitForTimeout(3000);
  mark("end");

  writeFileSync(`${OUT}/marks.json`, JSON.stringify(marks, null, 2));
  const video = page.video();
  await page.close();
  await video?.saveAs(`${OUT}/demo-raw.webm`);
  testInfo.annotations.push({
    type: "video",
    description: `${OUT}/demo-raw.webm`,
  });
});
