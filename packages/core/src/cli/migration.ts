import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";

/**
 * `npx @crowandraven/evalkeeper migration`: brings an app's copy of
 * Evalkeeper's tables up to this version. Evalkeeper's models live in
 * their own file beside the app's schema (`evalkeeper.prisma`), which this
 * writes and rewrites; the app never edits it. The migration SQL comes
 * from the schema files, before and after, through the app's own
 * `prisma migrate diff`, and never from a database. Node-only.
 */

/** The file Evalkeeper's models live in, beside the app's schema. */
export const SCHEMA_FILE = "evalkeeper.prisma";

/** Runs the app's Prisma CLI; the default runs `npx --no-install prisma`. */
export type PrismaExec = (
  args: string[],
  cwd: string,
) => { status: number | null; stdout: string; stderr: string };

const defaultExec: PrismaExec = (args, cwd) => {
  const r = spawnSync("npx", ["--no-install", "prisma", ...args], {
    cwd,
    encoding: "utf8",
    // Diffing schema files reads no database: no URL is needed or passed.
    env: { ...process.env, DATABASE_URL: undefined },
  });
  return {
    status: r.status,
    stdout: r.stdout,
    stderr: r.error ? String(r.error) : r.stderr,
  };
};

/** Where the app's Prisma schema is: a file, or a folder of files. */
export type SchemaLocation = { path: string; isFolder: boolean };

/**
 * The app's Prisma schema, as its Prisma CLI finds it: `schema` in
 * prisma.config.ts (or .mts, .js, .mjs), then package.json's
 * `prisma.schema`, then Prisma's defaults: prisma/schema.prisma, a
 * prisma/schema folder, or schema.prisma. Relative to the app.
 */
export function findSchema(cwd: string): SchemaLocation {
  let configured: string | undefined;
  for (const name of ["ts", "mts", "js", "mjs"].map(
    (x) => `prisma.config.${x}`,
  )) {
    const file = join(cwd, name);
    if (!existsSync(file)) continue;
    configured = /\bschema\s*:\s*["'`]([^"'`]+)["'`]/.exec(
      readFileSync(file, "utf8"),
    )?.[1];
    break;
  }
  if (!configured) {
    const pkg = join(cwd, "package.json");
    if (existsSync(pkg)) {
      const parsed = JSON.parse(readFileSync(pkg, "utf8")) as {
        prisma?: { schema?: unknown };
      };
      if (typeof parsed.prisma?.schema === "string")
        configured = parsed.prisma.schema;
    }
  }
  const path = (
    configured ??
    ["prisma/schema.prisma", "prisma/schema", "schema.prisma"].find((p) =>
      existsSync(join(cwd, p)),
    ) ??
    "prisma/schema.prisma"
  ).replace(/^\.\//, "");
  const full = join(cwd, path);
  if (!existsSync(full))
    throw new Error(
      `No Prisma schema at ${path}. Pass --schema with your schema file or folder.`,
    );
  return { path, isFolder: statSync(full).isDirectory() };
}

/** Every .prisma file in a folder and below, leaving out migrations. */
export function schemaFiles(cwd: string, dir: string): string[] {
  return readdirSync(join(cwd, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = join(dir, e.name);
    if (e.isDirectory())
      return e.name === "migrations" || e.name === "node_modules"
        ? []
        : schemaFiles(cwd, rel);
    return e.name.endsWith(".prisma") ? [rel] : [];
  });
}

/** The models a schema text defines, by name. */
export function modelNames(text: string): string[] {
  return [...text.matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => m[1] ?? "");
}

/**
 * The text without the named models, each with the comments right above
 * it, and which it removed.
 */
export function removeModels(
  text: string,
  names: readonly string[],
): { text: string; removed: string[] } {
  const lines = text.split("\n");
  const keep: string[] = [];
  const removed: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const name = /^model\s+(\w+)\s*\{/.exec(lines[i] ?? "")?.[1];
    if (!name || !names.includes(name)) {
      keep.push(lines[i] ?? "");
      continue;
    }
    // Its doc comments go with it.
    while (keep.length && /^\s*\/\//.test(keep[keep.length - 1] ?? ""))
      keep.pop();
    while (i < lines.length && !/^\}/.test(lines[i] ?? "")) i++;
    removed.push(name);
  }
  return {
    text: keep.join("\n").replace(/\n{3,}/g, "\n\n"),
    removed,
  };
}

/** Each model's columns and relations, by model: `{ EvalCase: ["id", …] }`. */
export function fieldsOf(text: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  let model: string | null = null;
  for (const line of text.split("\n")) {
    const start = /^model\s+(\w+)\s*\{/.exec(line)?.[1];
    if (start) {
      model = start;
      out[model] = [];
    } else if (/^\}/.test(line)) model = null;
    else if (model) {
      const field = /^\s+(\w+)\s+\S/.exec(line)?.[1];
      if (field) out[model]?.push(field);
    }
  }
  return out;
}

/**
 * What the change would drop, with its data: whole models ("EvalOld")
 * and fields ("EvalCase.extra") in `before` that aren't in `after`.
 */
export function dropped(before: string, after: string): string[] {
  const b = fieldsOf(before);
  const a = fieldsOf(after);
  return Object.entries(b).flatMap(([model, fields]) => {
    const now = a[model];
    if (!now) return [model];
    return fields.filter((f) => !now.includes(f)).map((f) => `${model}.${f}`);
  });
}

/** The version a written file says it's from, if any. */
export function versionOf(text: string): string | null {
  return /^\/\/ Evalkeeper (\S+)'s tables/m.exec(text)?.[1] ?? null;
}

/** Evalkeeper's models as the CLI writes them: a header, then the models. */
export function schemaFileText(shipped: string, version: string): string {
  return `// Evalkeeper ${version}'s tables. Written by \`npx @crowandraven/evalkeeper migration\`,
// which rewrites it on upgrade: don't edit it.
${shipped}`;
}

/** What `migration` needs. */
export type MigrationOptions = {
  /** The app's folder. */
  cwd: string;
  /** The package's own folder (for its schema and version). */
  pkgDir: string;
  /** The app's schema file or folder; found from its config when absent. */
  schema?: string | undefined;
  /** Runs the app's Prisma CLI. */
  exec?: PrismaExec | undefined;
};

/** One schema file the command would write. */
export type SchemaWrite = {
  /** Relative to the app's folder. */
  path: string;
  contents: string;
  /** Models it no longer defines, now in Evalkeeper's file. */
  removes: string[];
};

/** What `migration` would do, worked out without changing anything. */
export type MigrationPlan = {
  schema: SchemaLocation;
  /** Evalkeeper's file in the app. */
  target: string;
  /** The version the app's tables are at: null for none, "pasted". */
  from: string | null;
  to: string;
  writes: SchemaWrite[];
  /** The migration SQL, from Prisma; empty when the tables don't change. */
  sql: string;
  /** What the SQL drops, with its data. */
  drops: string[];
  /** Whether Prisma must be pointed at the folder to read the new file. */
  needsFolder: boolean;
};

/** Works out the change and its SQL, writing nothing in the app. */
export function planMigration(o: MigrationOptions): MigrationPlan {
  const schema = o.schema
    ? {
        path: o.schema.replace(/^\.\//, ""),
        isFolder: statSync(join(o.cwd, o.schema)).isDirectory(),
      }
    : findSchema(o.cwd);
  const dir = schema.isFolder ? schema.path : dirname(schema.path);
  const target = join(dir, SCHEMA_FILE);
  const to = (
    JSON.parse(readFileSync(join(o.pkgDir, "package.json"), "utf8")) as {
      version: string;
    }
  ).version;
  const shipped = readFileSync(
    join(o.pkgDir, "schema", "evalkeeper.prisma"),
    "utf8",
  );
  const ours = modelNames(shipped);
  const read = (p: string) => readFileSync(join(o.cwd, p), "utf8");

  // What Prisma reads now, and what it reads after.
  const before = schema.isFolder ? schemaFiles(o.cwd, dir) : [schema.path];
  const writes: SchemaWrite[] = [];
  const after = new Map<string, string>();
  for (const p of schemaFiles(o.cwd, dir)) {
    if (p === target) continue;
    const { text, removed } = removeModels(read(p), ours);
    after.set(p, text);
    if (removed.length)
      writes.push({ path: p, contents: text, removes: removed });
  }
  const next = schemaFileText(shipped, to);
  after.set(target, next);
  const existing = existsSync(join(o.cwd, target)) ? read(target) : null;
  if (existing !== next)
    writes.unshift({ path: target, contents: next, removes: [] });

  const pasted = writes.some((w) => w.removes.length);
  const from =
    existing && before.includes(target)
      ? (versionOf(existing) ?? "unknown")
      : pasted
        ? "pasted"
        : null;

  const scratch = mkdtempSync(join(tmpdir(), "evalkeeper-migration-"));
  try {
    const put = (side: string, files: Map<string, string>) => {
      for (const [p, text] of files) {
        const dest = join(scratch, side, relative(dir, p));
        mkdirSync(dirname(dest), { recursive: true });
        writeFileSync(dest, text);
      }
      return join(scratch, side);
    };
    const beforeDir = put("before", new Map(before.map((p) => [p, read(p)])));
    const afterDir = put("after", after);
    const r = (o.exec ?? defaultExec)(
      [
        "migrate",
        "diff",
        "--from-schema-datamodel",
        beforeDir,
        "--to-schema-datamodel",
        afterDir,
        "--script",
      ],
      o.cwd,
    );
    if (r.status !== 0)
      throw new Error(
        `prisma migrate diff failed. Is prisma installed in this app?\n${r.stderr.trim()}`,
      );
    const sql = r.stdout.trim();
    const meaningful = sql
      .split("\n")
      .some((l) => l.trim() && !l.trim().startsWith("--"));
    const all = (files: Iterable<string>) => [...files].join("\n");
    return {
      schema,
      target,
      from,
      to,
      writes,
      sql: meaningful ? sql : "",
      drops: dropped(all(before.map(read)), all(after.values())),
      needsFolder: !schema.isFolder,
    };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/** Writes the schema files and, when there is SQL, the SQL file. */
export function writeMigration(
  cwd: string,
  plan: MigrationPlan,
  out: string | null,
) {
  if (out && plan.sql) {
    mkdirSync(dirname(join(cwd, out)), { recursive: true });
    writeFileSync(join(cwd, out), `${plan.sql}\n`);
  }
  for (const w of plan.writes) writeFileSync(join(cwd, w.path), w.contents);
}

/**
 * A place for the SQL in Prisma's migrations folder, if the app has one:
 * `prisma/migrations/20261029120000_evalkeeper_0_11_0/migration.sql`.
 */
export function suggestedOut(
  cwd: string,
  plan: MigrationPlan,
  now = new Date(),
): string | null {
  const dir = plan.schema.isFolder
    ? plan.schema.path
    : dirname(plan.schema.path);
  const migrations = join(dir, "migrations");
  if (!existsSync(join(cwd, migrations))) return null;
  const stamp = now.toISOString().replace(/\D/g, "").slice(0, 14);
  return join(
    migrations,
    `${stamp}_evalkeeper_${plan.to.replace(/\W/g, "_")}`,
    "migration.sql",
  );
}
