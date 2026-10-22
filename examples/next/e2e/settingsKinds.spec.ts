import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { prismaSettingsStore } from "@crowandraven/evalkeeper-prisma";
import {
  GLOSSARY,
  createSettings,
  promptVersionOf,
  type Settings,
} from "@crowandraven/evalkeeper";
import { PROMPT_VERSIONS } from "../lib/suites";

// Changes the settings store didn't make: an app whose call sites read its
// own settings row finds the row changed (recorded as found, OUTSIDE), and
// runtime guidance that's gone by the time the page loads (INSTRUCTIONS,
// recorded by the page's syncPrompt). The history labels both and explains
// them. Writes to its own database only, and removes what it added.

const prisma = new PrismaClient({ datasourceUrl: "file:./e2e.db" });
const OPERATION = "route_ticket";
const DEFAULT: Settings = {
  model: "demo-quick",
  fallbackModel: null,
  reasoningEffort: null,
  maxOutputTokens: null,
};
let row: Settings = DEFAULT;
const settings = createSettings({
  store: prismaSettingsStore(prisma),
  defaults: () => DEFAULT,
  promptVersion: () =>
    promptVersionOf({
      code: PROMPT_VERSIONS[OPERATION] ?? "unregistered",
      runtime: "guidance-1",
    }),
  readActual: () => row,
});

async function clear() {
  const where = { operation: OPERATION };
  await prisma.evalSettingsChange.deleteMany({ where });
  await prisma.evalSettingsLive.deleteMany({ where });
  await prisma.evalSettingsVersion.deleteMany({ where });
}

test.beforeAll(async () => {
  await clear();
  await settings.seed(OPERATION, DEFAULT, {
    by: null,
    reason: "Imported from the admin config",
  });
  // A script changes the row the app's call sites read.
  row = { ...DEFAULT, model: "demo-steady" };
  await settings.current(OPERATION);
});

test.afterAll(async () => {
  await clear();
  await prisma.$disconnect();
});

test("labels and explains changes made outside the store", async ({ page }) => {
  await page.goto("/evals/ticket_routing");
  const history = page.locator("section", {
    has: page.getByRole("heading", { name: "Versions" }),
  });

  // The page noticed the runtime guidance was gone.
  const edited = history.getByRole("article", {
    name: "Version 3: Instructions edited",
  });
  await expect(
    edited.getByText("Same models, instructions edited at runtime"),
  ).toBeVisible();
  await expect(
    edited.getByText("Runtime instructions removed (were guidance-1)"),
  ).toBeVisible();
  await expect(edited.getByText("Live now")).toBeVisible();
  await edited.getByText("Instructions edited", { exact: true }).hover();
  await expect(
    edited
      .getByRole("tooltip")
      .filter({ hasText: GLOSSARY.instructionsEdited }),
  ).toBeVisible();

  const outside = history.getByRole("article", {
    name: "Version 2: Changed outside",
  });
  await expect(
    outside.getByText("Live: Demo Quick → Demo Steady"),
  ).toBeVisible();
  await expect(outside.getByText(/Found by the system/)).toBeVisible();
  await outside.getByText("Changed outside", { exact: true }).hover();
  await expect(
    outside.getByRole("tooltip").filter({ hasText: GLOSSARY.changedOutside }),
  ).toBeVisible();

  // Rolling back to it says what goes back.
  await outside.getByPlaceholder("Why roll back?").fill("Checking the script");
  const rollBack = outside.getByRole("button", { name: "Roll back to v2" });
  await expect(rollBack).toBeEnabled();
  await rollBack.hover();
  await expect(
    outside.getByRole("tooltip").filter({ hasText: "found changed outside" }),
  ).toBeVisible();
});
