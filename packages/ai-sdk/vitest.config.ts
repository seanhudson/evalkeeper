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
        "src/index.ts",
        "src/store.ts",
        "src/testing.ts",
      ],
      thresholds: {
        statements: 90,
        branches: 80,
        functions: 75,
        lines: 95,
      },
    },
  },
});
