import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { run } from "@crowandraven/evalkeeper/cli";

// The copy-in CLI's output must compile in a real app: scaffold into a
// scratch app here (so it uses this app's packages), with a "~" alias and
// a src folder, and typecheck the copied pages against the starter wiring.
const here = join(import.meta.dirname, "..");
const scratch = join(here, ".cli-check");

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

describe("npx @crowandraven/evalkeeper add pages", () => {
  it("writes pages that typecheck against the starter wiring", () => {
    rmSync(scratch, { recursive: true, force: true });
    mkdirSync(join(scratch, "src", "app"), { recursive: true });
    mkdirSync(join(scratch, "src", "lib"), { recursive: true });
    writeFileSync(
      join(scratch, "tsconfig.json"),
      JSON.stringify({
        extends: "../tsconfig.json",
        compilerOptions: { paths: { "~/*": ["./src/*"] }, incremental: false },
        include: ["src/**/*.ts", "src/**/*.tsx"],
      }),
    );
    // The starter imports the app's Prisma client from ~/lib/prisma.
    writeFileSync(
      join(scratch, "src", "lib", "prisma.ts"),
      'export { prisma } from "../../../lib/db";\n',
    );
    const out: string[] = [];
    const code = run(["add", "pages", "--base", "admin/evals"], {
      cwd: scratch,
      log: (l) => out.push(l),
      error: (l) => out.push(l),
    });
    expect(code, out.join("\n")).toBe(0);

    const tsc = spawnSync(
      "npx",
      ["tsc", "--noEmit", "-p", join(scratch, "tsconfig.json")],
      { cwd: here, encoding: "utf8" },
    );
    expect(tsc.status, tsc.stdout + tsc.stderr).toBe(0);
  }, 120_000);
});
