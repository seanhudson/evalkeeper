import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests of the eval pages, on a production build with its own
 * database (e2e.db) and demo models only, so they never call a paid model
 * and never touch your dev server or its data.
 */
const PORT = 3100;
const env = {
  DATABASE_URL: "file:./e2e.db",
  OPENAI_API_KEY: "",
  ANTHROPIC_API_KEY: "",
  CRON_SECRET: "e2e-cron-secret",
};

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `rm -f prisma/e2e.db && prisma db push --skip-generate >/dev/null && tsx prisma/seed.ts && next build && next start -p ${PORT}`,
    url: `http://localhost:${PORT}/evals`,
    reuseExistingServer: false,
    timeout: 240_000,
    env,
  },
});
