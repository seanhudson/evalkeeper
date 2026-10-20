import { expect, test } from "@playwright/test";

// The feedback loop: an answer in the product, a thumbs down with a
// reason, the rating on the feedback page, a draft case from it, and a
// person writing its answer. Demo models only.

test("a thumbs down becomes a draft case a person finishes", async ({
  page,
}) => {
  const subject = `Feedback case ${Date.now()}`;

  // The product: triage a ticket on the live model, keeping the input.
  await page.goto("/try");
  await page.getByLabel("Subject").fill(subject);
  await page.getByLabel("Message").fill("I was charged twice for March.");
  await page.getByRole("button", { name: "Triage it" }).click();
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
  await expect(rating.getByText(subject)).toBeVisible();

  // Make it a case: a draft with no answer yet.
  await rating.getByRole("button", { name: "Make a case" }).click();
  await expect(
    page.getByRole("article", { name: /billing problem/ }),
  ).toHaveCount(0);

  await page.goto("/evals/ticket_triage");
  const draft = page.locator("details").filter({ hasText: subject }).first();
  await expect(draft.getByText("Needs an answer")).toBeVisible();

  // A person writes the right answer; the case is then in use.
  await draft.locator("summary").first().click();
  await draft.getByText("Write the answer").click();
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

test("an answer whose input wasn't kept can't become a case", async ({
  page,
}) => {
  const subject = `Not kept ${Date.now()}`;
  await page.goto("/try");
  await page.getByLabel("Subject").fill(subject);
  await page.getByLabel("Message").fill("Please add dark mode.");
  await page.getByLabel(/Keep this ticket/).uncheck();
  await page.getByRole("button", { name: "Triage it" }).click();
  const answer = page.getByRole("article", { name: `Answer: ${subject}` });
  await expect(answer.getByText("Not kept", { exact: true })).toBeVisible();
  await answer
    .getByRole("button", { name: "Good answer", exact: true })
    .click();
  await expect(
    answer.getByRole("button", { name: "Take back your rating" }),
  ).toBeVisible();

  await page.goto("/evals/feedback");
  const rating = page
    .getByRole("article", { name: /Rating: Ticket triage/ })
    .filter({ hasText: "Not kept" })
    .first();
  await expect(rating.getByText(/wasn't kept/)).toBeVisible();
  await expect(rating.getByRole("button", { name: "Make a case" })).toHaveCount(
    0,
  );
});
