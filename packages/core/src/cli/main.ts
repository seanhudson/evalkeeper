/**
 * The `evalkeeper` command: `npx @crowandraven/evalkeeper add pages`, and
 * `migration` for Evalkeeper's tables.
 *
 * @module evalkeeper/cli
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { addPages, nextSteps, type AddPagesOptions } from "./addPages.js";
import {
  planMigration,
  suggestedOut,
  writeMigration,
  type PrismaExec,
} from "./migration.js";

/** The `evalkeeper` command. */

/** The command's help text. */
export const HELP = `Usage: npx @crowandraven/evalkeeper <command> [options]

Commands:
  add pages   Write Evalkeeper's pages and their glue into your Next.js app
  migration   Bring your copy of Evalkeeper's tables up to this version

add pages copies Evalkeeper's eval pages, components, and their glue into your
Next.js app, fitted to its folders and import alias.

Options:
  --base <path>   Where the pages live in your app (default: evals)
  --alias <name>  Your import alias, e.g. "@" or "~" (default: from tsconfig.json)
  --root <dir>    Where the alias points, e.g. "src" (default: from tsconfig.json)
  --no-cron       Leave out the weekly check's cron route
  --only <names>  Copy only these, comma-separated: pages (hub, suite, run,
                  rate, compare, side-by-side, feedback, cron), components
                  and glue by name (AnswerKey, actions, …), the groups
                  "pages" and "components", or "index" for a starter
                  lib/evalkeeper/index.ts
  --force         Overwrite files that already exist (never your lib/evalkeeper/index.ts)
  --dry-run       Show what would be written, and write nothing
  --help          Show this

migration writes Evalkeeper's models to evalkeeper.prisma beside your
Prisma schema (moving any you pasted into your own schema there), and
the SQL that brings your tables up to this version, from the schema
files through your own \`prisma migrate diff\`. It never reads or
writes a database. Without --write it only shows what it would do.

Options:
  --write         Write the schema files (and the SQL, to --out)
  --out <file>    Where the SQL goes; needed with --write when there is SQL
  --schema <path> Your Prisma schema file or folder (default: from your config)
  --accept-drops  Allow a change that drops columns or tables, with their data
`;

/** The package's own folder, where the templates and starter ship. */
function packageDir(): string {
  // dist/cli/main.js → the package root.
  return join(dirname(fileURLToPath(import.meta.url)), "..", "..");
}

/** The command line, read. */
type Args = Partial<AddPagesOptions> & {
  command: string[];
  help: boolean;
  /** migration: where the SQL goes. */
  out?: string;
  /** migration: the app's schema file or folder. */
  schema?: string;
  /** migration: allow dropping columns or tables. */
  acceptDrops?: boolean;
  /** migration: write, rather than show. */
  write?: boolean;
};

/**
 * Reads the command line into a command and options. Throws on an unknown option or a missing value.
 */
export function parseArgs(argv: string[]): Args {
  const out: Args = {
    command: [],
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] ?? "";
    const value = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith("--"))
        throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--base") out.base = value();
    else if (a === "--alias") out.alias = value();
    else if (a === "--root") out.root = value();
    else if (a === "--no-cron") out.cron = false;
    else if (a === "--force") out.force = true;
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--out") out.out = value();
    else if (a === "--schema") out.schema = value();
    else if (a === "--accept-drops") out.acceptDrops = true;
    else if (a === "--write") out.write = true;
    else if (a === "--only")
      out.only = [...(out.only ?? []), ...value().split(",")];
    else if (a.startsWith("--")) throw new Error(`Unknown option ${a}`);
    else out.command.push(a);
  }
  return out;
}

/** Runs the command; returns the exit code. */
export function run(
  argv: string[],
  io: {
    cwd: string;
    log: (line: string) => void;
    error: (line: string) => void;
    pkgDir?: string;
    /** Runs the app's Prisma CLI (tests pass their own). */
    prisma?: PrismaExec;
  },
): number {
  let args: ReturnType<typeof parseArgs>;
  try {
    args = parseArgs(argv);
  } catch (e) {
    io.error(e instanceof Error ? e.message : String(e));
    io.error(HELP);
    return 2;
  }
  if (args.help || args.command.length === 0) {
    io.log(HELP);
    return 0;
  }
  if (args.command.join(" ") === "migration") return migration(args, io);
  if (args.command.join(" ") !== "add pages") {
    io.error(`Unknown command "${args.command.join(" ")}".`);
    io.error(HELP);
    return 2;
  }
  const pkg = io.pkgDir ?? packageDir();
  try {
    const {
      command: _command,
      help: _help,
      out: _out,
      schema: _schema,
      acceptDrops: _acceptDrops,
      write: _write,
      ...rest
    } = args;
    const result = addPages({
      ...rest,
      cwd: io.cwd,
      templatesDir: join(pkg, "templates"),
      starterFile: join(pkg, "starter", "index.ts"),
    });
    const verb = { write: "wrote", overwrite: "overwrote", skip: "skipped" };
    io.log(
      args.dryRun
        ? "Dry run: nothing written. This would happen:"
        : `Added Evalkeeper's pages at /${result.base}:`,
    );
    for (const f of result.files)
      io.log(
        `  ${(args.dryRun ? f.action : verb[f.action]).padEnd(10)} ${f.path}${f.action === "skip" ? " (exists)" : ""}`,
      );
    const skipped = result.files.filter((f) => f.action === "skip").length;
    if (skipped && !args.force)
      io.log(
        `\n${skipped} file${skipped === 1 ? "" : "s"} already existed and stayed as they are. --force overwrites them (your lib/evalkeeper/index.ts never).`,
      );
    if (result.needs.length)
      io.log(
        `\nThese import ${result.needs.join(", ")}, which your app doesn't have: add them to --only, or point the imports at your own.`,
      );
    io.log("\nNext:");
    for (const [i, step] of nextSteps(result).entries())
      io.log(`  ${i + 1}. ${step}`);
    return 0;
  } catch (e) {
    io.error(e instanceof Error ? e.message : String(e));
    return 1;
  }
}

/** `migration`: shows, or with --out writes, the change to Evalkeeper's tables. */
function migration(args: Args, io: Parameters<typeof run>[1]): number {
  try {
    const plan = planMigration({
      cwd: io.cwd,
      pkgDir: io.pkgDir ?? packageDir(),
      schema: args.schema,
      exec: io.prisma,
    });
    const from =
      plan.from === null
        ? "none yet"
        : plan.from === "pasted"
          ? "pasted into your schema"
          : plan.from;
    io.log(`Evalkeeper's tables: ${from} → ${plan.to} (${plan.target})`);
    if (!plan.writes.length) {
      io.log("Already up to date: nothing to change.");
      return 0;
    }
    const write = Boolean(args.write);
    const out = args.out ?? suggestedOut(io.cwd, plan);
    if (write && plan.sql && !args.out) {
      io.error(
        `Nothing written: say where the SQL goes with --out${out ? ` (such as ${out})` : ""}.`,
      );
      return 1;
    }
    for (const w of plan.writes)
      io.log(
        `  ${(write ? "wrote" : "write").padEnd(10)} ${w.path}${w.removes.length ? ` (moves ${w.removes.join(", ")} to ${plan.target})` : ""}`,
      );
    io.log(
      plan.sql
        ? `\nThe migration SQL:\n\n${plan.sql}\n`
        : "\nNo change to the tables: no SQL to apply.",
    );
    if (plan.drops.length) {
      io.log(
        `\nThis drops, with their data: ${plan.drops.join(", ")}. Move what you need first.`,
      );
      if (write && !args.acceptDrops) {
        io.error(
          "Nothing written: pass --accept-drops once what they hold is safe.",
        );
        return 1;
      }
    }
    if (write) writeMigration(io.cwd, plan, args.out ?? null);
    const folder = dirname(plan.target);
    const steps = [
      ...(write
        ? []
        : [
            `Run it again with --write${plan.sql ? ` --out ${out ?? "<file>.sql"}` : ""} to write ${plan.sql ? "the SQL and " : ""}the schema files.`,
          ]),
      ...(plan.needsFolder
        ? [
            `Point Prisma at the folder, so it reads ${plan.target} too: schema: "${folder}" in prisma.config.ts, or "prisma": { "schema": "${folder}" } in package.json.`,
          ]
        : []),
      ...(plan.sql
        ? [
            "Apply the SQL with your migration tool, on a copy of your data first (prisma migrate deploy, for a file in your migrations folder).",
          ]
        : []),
      "Run prisma generate.",
    ];
    io.log("Next:");
    for (const [i, step] of steps.entries()) io.log(`  ${i + 1}. ${step}`);
    return 0;
  } catch (e) {
    io.error(e instanceof Error ? e.message : String(e));
    return 1;
  }
}
