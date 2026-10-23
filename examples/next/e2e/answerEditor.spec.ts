import { expect, test } from "@playwright/test";

// An app's own answer editor (answerEditors in lib/evalkeeper): action
// items' answer is edited one box per item, saved as JSON, and read back
// like any answer. Demo models only.

test("an app's answer editor writes and edits a case's answer", async ({
  page,
}) => {
  await page.goto("/evals/action_items");
  const notes = `E2E notes ${Date.now()}: Dana will share slides, and Sam will find a room.`;
  await page.getByText("Add a case", { exact: true }).click();
  await page.getByLabel("Meeting notes").first().fill(notes);

  // The editor, not one item per line.
  await page
    .getByLabel("Item 1", { exact: true })
    .first()
    .fill("Dana sends the deck");
  await page.getByRole("button", { name: "Add an item" }).first().click();
  await page
    .getByLabel("Item 2", { exact: true })
    .first()
    .fill("Sam books the room");
  await page.getByRole("button", { name: "Add case" }).click();

  const added = page.locator("details").filter({ hasText: notes }).first();
  await expect(added).toBeVisible();
  await added.locator("summary").first().click();
  await expect(added.getByText("Dana sends the deck")).toBeVisible();
  await expect(added.getByText("Sam books the room")).toBeVisible();

  // Editing opens the editor with the answer in place; remove one item.
  await added.getByRole("button", { name: "Case actions" }).click();
  await added.getByRole("menuitem", { name: "Edit answer" }).click();
  await expect(added.getByLabel("Item 2", { exact: true })).toHaveValue(
    "Sam books the room",
  );
  await added.getByRole("button", { name: "Remove item 2" }).click();
  await added.getByRole("button", { name: "Save answer" }).click();
  const reopened = page.locator("details").filter({ hasText: notes }).first();
  if ((await reopened.getAttribute("open")) === null)
    await reopened.locator("summary").first().click();
  await expect(reopened.getByText("Dana sends the deck")).toBeVisible();
  await expect(reopened.getByText("Sam books the room")).toHaveCount(0);

  // Leave the answer key as it was.
  await reopened.getByRole("button", { name: "Case actions" }).click();
  await reopened.getByRole("menuitem", { name: "Retire case" }).click();
});
