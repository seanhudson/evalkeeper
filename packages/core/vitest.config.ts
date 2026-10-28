import { defineConfig } from "vitest/config";

// Coverage limits sit just under today's numbers: a change that drops
// coverage fails the tests. Raise them as coverage grows; never lower
// them to make a change pass.
export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: ["src/**"],
      exclude: [
        "src/**/*.test.ts",
        "src/**/*.test.tsx",
        "src/index.ts",
        "src/store.ts",
        "src/testing.ts",
        // The Prisma stores run on a real database: their tests are in
        // examples/next (prismaStore, byoStore, judgmentCache), not here.
        "src/prisma/**",
        // The screens run in a browser: their tests are examples/next's
        // browser tests. The pieces (pieces.tsx) and the app object
        // (app.ts) have unit tests here.
        "src/react/!(pieces|app|format).tsx",
        "src/react/index.ts",
      ],
      thresholds: {
        statements: 95,
        branches: 80,
        functions: 95,
        lines: 95,
      },
    },
  },
});
