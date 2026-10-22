import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { prismaStore } from "@crowandraven/evalkeeper-prisma";
import {
  BLIND_RATER,
  confirmedLabel,
  rateQueue,
} from "@crowandraven/evalkeeper";

// Rating an imported suite's cases blind (ticket routing is the example's
// imported suite): the page shows one case's input only, a skip moves on,
// and a rating lands as the rater's own confirmed answer beside the
// owner's. The rating repeats the owner's answer, so no score changes,
// and the example admin's ratings and skips are removed afterwards.

const prisma = new PrismaClient({ datasourceUrl: "file:./e2e.db" });
const store = prismaStore(prisma);
const SUITE = "ticket_routing";
const ME = "example-admin";

test.afterAll(async () => {
  await prisma.evalCaseLabel.deleteMany({ where: { raterId: ME } });
  await prisma.$disconnect();
});

test("rating blind shows the input only, skips, and saves the rater's own answer", async ({
  page,
}) => {
  const cases = await store.listCases(SUITE);
  const queue = rateQueue(cases, ME);
  const first = queue.next;
  const second = cases.filter((c) => c.id !== first?.id)[0];
  if (!first || !second) throw new Error("The seed has routing cases");
  const subject = (c: typeof first) => (c.input as { subject: string }).subject;

  await page.goto(`/evals/${SUITE}`);
  await page.getByRole("link", { name: "Rate blind" }).click();
  await expect(page.getByRole("heading", { name: "Rate blind" })).toBeVisible();
  await expect(
    page.getByText(`0 rated · 0 skipped · ${queue.left} left`),
  ).toBeVisible();

  // The input, and nothing that anchors the rating: no answer, note, or
  // model results.
  await expect(
    page.getByRole("heading", { name: subject(first) }),
  ).toBeVisible();
  if (first.note) await expect(page.getByText(first.note)).toHaveCount(0);
  await expect(page.getByText("Each model's latest test")).toHaveCount(0);
  await expect(page.getByLabel("Why")).toHaveAttribute("required", "");

  await page.getByRole("button", { name: "Skip" }).click();
  await expect(
    page.getByRole("heading", { name: subject(second) }),
  ).toBeVisible();
  await expect(page.getByText("0 rated · 1 skipped")).toBeVisible();

  // Rate it with the answer the owner gave, so tests score the same.
  const owner = confirmedLabel(second.labels)?.value as {
    queue: string;
    urgent: boolean;
  };
  await page.getByLabel("Queue").selectOption(owner.queue);
  await page.getByLabel("Urgent").selectOption(String(owner.urgent));
  await page.getByLabel("Why").fill("The customer says what queue it is.");
  await page.getByRole("button", { name: "Save rating" }).click();
  await expect(page.getByText("1 rated · 1 skipped")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: subject(second) }),
  ).toHaveCount(0);

  const after = await store.listCases(SUITE);
  const mine = after.flatMap((c) =>
    c.labels.filter((l) => l.raterId === ME).map((l) => ({ c: c.id, l })),
  );
  expect(mine.map(({ c, l }) => [c, l.status])).toEqual([
    [first.id, "SKIPPED"],
    [second.id, "CONFIRMED"],
  ]);
  const rating = mine.find(({ l }) => l.status === "CONFIRMED")?.l;
  expect(rating).toMatchObject({
    raterRole: BLIND_RATER,
    note: "The customer says what queue it is.",
    value: owner,
  });
  // The owner's answer is kept as it was.
  const kept = after.find((c) => c.id === second.id)?.labels ?? [];
  expect(kept.filter((l) => l.raterRole === "OWNER")).toHaveLength(1);
});

test("only imported suites are rated blind", async ({ page }) => {
  await page.goto("/evals/ticket_triage");
  await expect(page.getByRole("link", { name: "Rate blind" })).toHaveCount(0);
  const res = await page.goto("/evals/ticket_triage/rate");
  expect(res?.status()).toBe(404);
});
