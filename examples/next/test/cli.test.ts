import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { run } from "@crowandraven/evalkeeper/cli";

// The copy-in CLI's output must compile in a real app: scaffold into a
// scratch app here (so it uses this app's packages), with a "~" alias and
// a src folder, and typecheck the copied pages against the starter wiring.
const here = join(import.meta.dirname, "..");
const scratch = join(here, ".cli-check");
const migrationScratch = join(here, ".cli-check-migration");

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
  rmSync(migrationScratch, { recursive: true, force: true });
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

describe("npx @crowandraven/evalkeeper migration", () => {
  // Real Prisma, no database: an app whose pasted copy of the tables has
  // drifted (a column of its own, one missing) moves onto Evalkeeper's file.
  it("writes the SQL for a drifted copy, from the schema files alone", () => {
    rmSync(migrationScratch, { recursive: true, force: true });
    mkdirSync(join(migrationScratch, "prisma"), { recursive: true });
    const shipped = readFileSync(
      createRequire(import.meta.url).resolve(
        "@crowandraven/evalkeeper/prisma/schema",
      ),
      "utf8",
    );
    const drifted = shipped
      .replace("  sourceRef String?\n", "")
      .replace(
        "  note      String?\n",
        "  note      String?\n  priority  Int?\n",
      );
    writeFileSync(
      join(migrationScratch, "prisma/schema.prisma"),
      `datasource db {\n  provider = "postgresql"\n  url      = env("NO_DATABASE")\n}\n\n${drifted}`,
    );
    const lines: string[] = [];
    const io = {
      cwd: migrationScratch,
      log: (l: string) => lines.push(l),
      error: (l: string) => lines.push(l),
    };
    const refused = run(["migration", "--write", "--out", "up.sql"], io);
    const out = lines.join("\n");
    expect(refused, out).toBe(1);
    expect(out).toMatch(/drops, with their data: EvalCase\.priority/);
    expect(out).toMatch(/ADD COLUMN\s+"sourceRef" TEXT/);

    const code = run(
      ["migration", "--write", "--out", "up.sql", "--accept-drops"],
      io,
    );
    expect(code, lines.join("\n")).toBe(0);
    const sql = readFileSync(join(migrationScratch, "up.sql"), "utf8");
    expect(sql).toMatch(/DROP COLUMN "priority"/);
    expect(
      readFileSync(join(migrationScratch, "prisma/schema.prisma"), "utf8"),
    ).not.toMatch(/model Eval/);
    expect(
      readFileSync(join(migrationScratch, "prisma/evalkeeper.prisma"), "utf8"),
    ).toMatch(/^\/\/ Evalkeeper \S+'s tables/);
  }, 60_000);

  it("keeps the example's tables exactly Evalkeeper's", () => {
    const shipped = readFileSync(
      createRequire(import.meta.url).resolve(
        "@crowandraven/evalkeeper/prisma/schema",
      ),
      "utf8",
    );
    const ours = readFileSync(join(here, "prisma/evalkeeper.prisma"), "utf8");
    // Past the two header lines, which name the version that wrote it.
    expect(ours.split("\n").slice(2).join("\n")).toBe(shipped);
  });
});
