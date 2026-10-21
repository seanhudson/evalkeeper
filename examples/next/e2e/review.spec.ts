import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { prismaStore } from "@crowandraven/evalkeeper-prisma";

// Reviewing drafts: confirming a pending answer closes its case and opens
// the next one waiting, without waiting for the page to refresh. The
// example's starters arrive confirmed, so this adds three made-up drafts
// to its own database and removes them afterwards.

const prisma = new PrismaClient({ datasourceUrl: "file:./e2e.db" });
const store = prismaStore(prisma);
const MARK = "e2e review drafts";
const subjects = ["Review A", "Review B", "Review C"];

test.beforeAll(async () => {
  for (const subject of subjects)
    await store.createCase({
      suite: "action_items",
      input: { notes: `${subject}. Sam will send the agenda by Friday.` },
      tags: ["review"],
      split: "DEV",
      status: "ACTIVE",
      source: "MODEL_DRAFT",
      sourceRef: null,
      note: MARK,
      labels: [
        {
          kind: "EXPECTED",
          status: "PENDING",
          value: { items: ["Sam sends the agenda by Friday"] },
          raterRole: "MODEL",
          raterId: null,
          note: null,
        },
      ],
    });
});

test.afterAll(async () => {
  await prisma.evalCase.deleteMany({ where: { note: MARK } });
  await prisma.$disconnect();
});

test("confirming an answer closes the case and opens the next draft", async ({
  page,
}) => {
  await page.goto("/evals/action_items");
  const caseOf = (subject: string) =>
    page.locator("details").filter({
      has: page.locator("summary", { hasText: subject }),
    });
  const [a, b, c] = subjects.map(caseOf);
  if (!a || !b || !c) throw new Error("setup");

  await a.locator("summary").click();
  await expect(a).toHaveAttribute("open", "");
  await a.getByRole("button", { name: "Confirm this answer" }).click();

  // At once, not after the page refreshes.
  await expect(a).not.toHaveAttribute("open", "", { timeout: 1000 });
  await expect(b).toHaveAttribute("open", "", { timeout: 1000 });
  await expect(c).not.toHaveAttribute("open", "");

  // The save lands behind it.
  await expect(a.locator("summary").getByText("Confirmed")).toBeVisible();
  await expect(
    b.getByRole("button", { name: "Confirm this answer" }),
  ).toBeVisible();
});
