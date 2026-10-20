import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // One file at a time: the tests share one SQLite database.
    fileParallelism: false,
    env: { DATABASE_URL: "file:./test.db" },
  },
});
