import { expect, test } from "@playwright/test";

// The feedback loop: an answer in the product, a thumbs down with a
// reason, the rating on the feedback page, a draft case from it, and a
// person writing its answer. Demo models only.

test("a thumbs down becomes a draft case a person finishes", async ({
  page,
}) => {
  const subject = "Billed twice for March";

  // The product: an answer people rate. Its input was kept, with consent.
  await page.goto("/try");
  const answer = page.getByRole("article", { name: `Answer: ${subject}` });
  await expect(answer).toBeVisible();

  // Rate it down, with a reason.
  await answer.getByRole("button", { name: "Not a good answer" }).click();
  await answer.getByLabel("What was wrong?").fill("This is a billing problem");
  await answer.getByRole("button", { name: "Send" }).click();
  await expect(answer.getByText("Thanks: that helps.")).toBeVisible();
  await expect(
    answer.getByRole("button", { name: "Take back your rating" }),
  ).toHaveAttribute("aria-pressed", "true");

  // The hub counts it, and the feedback page shows it with its input.
  await page.goto("/evals");
  await expect(page.getByText("Thumbs down this week")).toBeVisible();
  await page.goto("/evals/feedback");
  const rating = page.getByRole("article", { name: /billing problem/ });
  await expect(rating).toBeVisible();
  await expect(rating.getByText(subject).first()).toBeVisible();

  // Make it a case: a draft with no answer yet.
  await rating.getByRole("button", { name: "Make a case" }).click();
  await expect(
    page.getByRole("article", { name: /billing problem/ }),
  ).toHaveCount(0);

  await page.goto("/evals/ticket_triage");
  const draft = page.locator("details").filter({ hasText: subject }).first();
  await expect(draft.getByText("No answer", { exact: true })).toBeVisible();

  // A person writes the right answer; the case is then in use.
  await draft.locator("summary").first().click();
  await draft.getByLabel("Category").selectOption("billing");
  await draft.getByLabel("Urgency").selectOption("high");
  await draft.getByRole("button", { name: "Save answer" }).click();
  await expect(
    page
      .locator("details")
      .filter({ hasText: subject })
      .first()
      .getByText("Confirmed", { exact: true }),
  ).toBeVisible();
});

// An answer whose input wasn't kept can't become a case: whyNotACase
// refuses it (unit-tested in packages/core, feedback.test.ts).
