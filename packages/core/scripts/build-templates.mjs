// Copies the example app's eval pages into templates/, which ship with the
// package for `npx @crowandraven/evalkeeper add pages`. The example is the template: what
// it runs and tests is exactly what gets copied.
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = join(here, "..");
const example = join(pkg, "..", "..", "examples", "next");
const out = join(pkg, "templates");

const FILES = [
  "components/evalkeeper",
  "app/evals",
  "lib/evalkeeper/actions.ts",
  "lib/evalkeeper/weekly.ts",
  "lib/evalkeeper/cronAuth.ts",
  "lib/evalkeeper/time.ts",
  "lib/evalkeeper/paths.ts",
  "app/api/cron/evals-weekly/route.ts",
];

rmSync(out, { recursive: true, force: true });
for (const f of FILES) {
  const from = join(example, f);
  if (!existsSync(from)) throw new Error(`The example is missing ${f}`);
  mkdirSync(dirname(join(out, f)), { recursive: true });
  cpSync(from, join(out, f), { recursive: true });
}
console.log(`Templates: ${FILES.length} entries from examples/next.`);
