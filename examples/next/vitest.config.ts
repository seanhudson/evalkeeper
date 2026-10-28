import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // The app's "@/" imports, and JSX for the component tests (Next.js
  // leaves JSX to its own compiler).
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  esbuild: { jsx: "automatic" },
  test: {
    include: ["test/**/*.test.ts"],
    // One file at a time: the tests share one SQLite database.
    fileParallelism: false,
    env: { DATABASE_URL: "file:./test.db" },
  },
});
