import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { run } from "./main.js";
import {
  dropped,
  fieldsOf,
  findSchema,
  modelNames,
  planMigration,
  removeModels,
  suggestedOut,
  versionOf,
  type PrismaExec,
} from "./migration.js";

const pkgDir = join(import.meta.dirname, "..", "..");
const shipped = readFileSync(
  join(pkgDir, "schema", "evalkeeper.prisma"),
  "utf8",
);
const version = (
  JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8")) as {
    version: string;
  }
).version;

const HEAD = `generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

model Post {
  id String @id
}
`;

/** A scratch app with a schema; `files` are relative to it. */
function app(files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), "evalkeeper-app-"));
  for (const [p, text] of Object.entries(files)) {
    mkdirSync(join(dir, p, ".."), { recursive: true });
    writeFileSync(join(dir, p), text);
  }
  return dir;
}

/**
 * Prisma, as far as these tests need: what each side of the diff holds,
 * and an SQL line per model added.
 */
function fakePrisma() {
  const seen: { before: string; after: string }[] = [];
  const exec: PrismaExec = (args) => {
    const read = (d: string) =>
      readdirSync(d, { recursive: true })
        .map(String)
        .filter((f) => f.endsWith(".prisma"))
        .sort()
        .map((f) => readFileSync(join(d, f), "utf8"))
        .join("\n");
    const before = read(args[3] ?? "");
    const after = read(args[5] ?? "");
    seen.push({ before, after });
    const added = modelNames(after).filter(
      (m) => !modelNames(before).includes(m),
    );
    return {
      status: 0,
      stdout: added.length
        ? added.map((m) => `CREATE TABLE "${m}" ();`).join("\n")
        : "-- This is an empty migration.",
      stderr: "",
    };
  };
  return { exec, seen };
}

describe("reading a schema", () => {
  it("lists models and their fields, and removes models with their comments", () => {
    const text = `${HEAD}
/// A case.
model EvalCase {
  id    String @id
  input Json

  @@index([id])
}
`;
    expect(modelNames(text)).toEqual(["Post", "EvalCase"]);
    expect(fieldsOf(text)).toEqual({ Post: ["id"], EvalCase: ["id", "input"] });
    const { text: left, removed } = removeModels(text, ["EvalCase"]);
    expect(removed).toEqual(["EvalCase"]);
    expect(left).not.toMatch(/EvalCase|A case/);
    expect(left).toMatch(/model Post/);
  });

  it("names what a change drops, with its data", () => {
    expect(
      dropped(
        "model A {\n  id String\n  gone Int\n}\nmodel B {\n  id String\n}\n",
        "model A {\n  id String\n}\n",
      ),
    ).toEqual(["A.gone", "B"]);
  });

  it("reads the version a written file is at", () => {
    expect(versionOf("// Evalkeeper 0.9.0's tables. Written by…")).toBe(
      "0.9.0",
    );
    expect(versionOf("model A {}")).toBeNull();
  });

  it("finds the schema from prisma.config.ts, package.json, or the default", () => {
    expect(findSchema(app({ "prisma/schema.prisma": HEAD }))).toEqual({
      path: "prisma/schema.prisma",
      isFolder: false,
    });
    expect(
      findSchema(
        app({
          "db/main.prisma": HEAD,
          "package.json": '{ "prisma": { "schema": "./db" } }',
        }),
      ),
    ).toEqual({ path: "db", isFolder: true });
    expect(
      findSchema(
        app({
          "db/main.prisma": HEAD,
          "prisma.config.ts": 'export default { schema: "db/main.prisma" }',
        }),
      ),
    ).toEqual({ path: "db/main.prisma", isFolder: false });
    expect(() => findSchema(app({}))).toThrow(/No Prisma schema/);
  });
});

describe("planning a migration", () => {
  it("moves models pasted into the app's schema into their own file", () => {
    const dir = app({ "prisma/schema.prisma": HEAD + shipped });
    const { exec, seen } = fakePrisma();
    const plan = planMigration({ cwd: dir, pkgDir, exec });
    expect(plan.from).toBe("pasted");
    expect(plan.to).toBe(version);
    expect(plan.target).toBe("prisma/evalkeeper.prisma");
    expect(plan.writes.map((w) => w.path)).toEqual([
      "prisma/evalkeeper.prisma",
      "prisma/schema.prisma",
    ]);
    expect(plan.writes[1]?.removes).toContain("EvalCase");
    expect(plan.sql).toBe("");
    expect(plan.drops).toEqual([]);
    expect(plan.needsFolder).toBe(true);
    // Prisma saw the same models on both sides.
    expect(modelNames(seen[0]?.before ?? "").sort()).toEqual(
      modelNames(seen[0]?.after ?? "").sort(),
    );
  });

  it("adds the tables to an app that has none, and is then up to date", () => {
    const dir = app({ "prisma/schema/main.prisma": HEAD });
    const { exec } = fakePrisma();
    const plan = planMigration({ cwd: dir, pkgDir, exec });
    expect(plan.from).toBeNull();
    expect(plan.sql).toMatch(/CREATE TABLE "EvalCase"/);
    expect(plan.needsFolder).toBe(false);
    writeFileSync(join(dir, plan.target), plan.writes[0]?.contents ?? "");
    const again = planMigration({ cwd: dir, pkgDir, exec });
    expect(again.from).toBe(version);
    expect(again.writes).toEqual([]);
    expect(again.sql).toBe("");
  });

  it("names what an app's drifted copy would lose", () => {
    const drifted = shipped.replace(
      "  note      String?\n",
      "  note      String?\n  priority  Int?\n",
    );
    const dir = app({
      "prisma/schema/main.prisma": HEAD,
      "prisma/schema/evalkeeper.prisma": `// Evalkeeper 0.9.0's tables.\n${drifted}`,
    });
    const plan = planMigration({ cwd: dir, pkgDir, exec: fakePrisma().exec });
    expect(plan.from).toBe("0.9.0");
    expect(plan.drops).toEqual(["EvalCase.priority"]);
  });

  it("says when Prisma can't diff", () => {
    const dir = app({ "prisma/schema.prisma": HEAD });
    expect(() =>
      planMigration({
        cwd: dir,
        pkgDir,
        exec: () => ({ status: 1, stdout: "", stderr: "not found" }),
      }),
    ).toThrow(/prisma migrate diff failed[\s\S]*not found/);
  });

  it("suggests a file in the app's migrations folder", () => {
    const dir = app({
      "prisma/schema.prisma": HEAD,
      "prisma/migrations/migration_lock.toml": "",
    });
    const plan = planMigration({ cwd: dir, pkgDir, exec: fakePrisma().exec });
    expect(suggestedOut(dir, plan, new Date("2026-10-29T12:34:56Z"))).toBe(
      `prisma/migrations/20261029123456_evalkeeper_${version.replace(/\W/g, "_")}/migration.sql`,
    );
    expect(
      suggestedOut(app({ "prisma/schema.prisma": HEAD }), plan),
    ).toBeNull();
  });
});

describe("evalkeeper migration", () => {
  const cli = (dir: string, exec: PrismaExec, ...argv: string[]) => {
    const out: string[] = [];
    const err: string[] = [];
    const code = run(argv, {
      cwd: dir,
      pkgDir,
      prisma: exec,
      log: (l) => out.push(l),
      error: (l) => err.push(l),
    });
    return { code, out: out.join("\n"), err: err.join("\n") };
  };

  it("shows the change and writes nothing without --write", () => {
    const dir = app({ "prisma/schema/main.prisma": HEAD });
    const r = cli(dir, fakePrisma().exec, "migration");
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/none yet →/);
    expect(r.out).toMatch(/CREATE TABLE "EvalCase"/);
    expect(r.out).toMatch(/--write --out <file>\.sql/);
    expect(existsSync(join(dir, "prisma/schema/evalkeeper.prisma"))).toBe(
      false,
    );
  });

  it("needs --out for SQL, then writes the SQL and the schema file", () => {
    const dir = app({ "prisma/schema/main.prisma": HEAD });
    const { exec } = fakePrisma();
    const missing = cli(dir, exec, "migration", "--write");
    expect(missing.code).toBe(1);
    expect(missing.err).toMatch(/--out/);
    const r = cli(dir, exec, "migration", "--write", "--out", "m/up.sql");
    expect(r.code).toBe(0);
    expect(readFileSync(join(dir, "m/up.sql"), "utf8")).toMatch(/CREATE/);
    expect(
      versionOf(
        readFileSync(join(dir, "prisma/schema/evalkeeper.prisma"), "utf8"),
      ),
    ).toBe(version);
    expect(cli(dir, exec, "migration").out).toMatch(/Already up to date/);
  });

  it("moves pasted models with no SQL, and says to point Prisma at the folder", () => {
    const dir = app({ "prisma/schema.prisma": HEAD + shipped });
    const r = cli(dir, fakePrisma().exec, "migration", "--write");
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/No change to the tables/);
    expect(r.out).toMatch(/"prisma": \{ "schema": "prisma" \}/);
    expect(readFileSync(join(dir, "prisma/schema.prisma"), "utf8")).not.toMatch(
      /model EvalCase/,
    );
  });

  it("refuses to drop data unless told", () => {
    const dir = app({
      "prisma/schema/main.prisma": HEAD,
      "prisma/schema/evalkeeper.prisma": shipped.replace(
        "  note      String?\n",
        "  note      String?\n  priority  Int?\n",
      ),
    });
    const { exec } = fakePrisma();
    const r = cli(dir, exec, "migration", "--write", "--out", "up.sql");
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/drops, with their data: EvalCase\.priority/);
    expect(r.err).toMatch(/--accept-drops/);
    expect(cli(dir, exec, "migration", "--write", "--accept-drops").code).toBe(
      0,
    );
  });

  it("reports an error and a missing schema", () => {
    const r = cli(app({}), fakePrisma().exec, "migration");
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/No Prisma schema/);
  });
});
