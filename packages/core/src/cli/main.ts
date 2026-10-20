/**
 * The `evalkeeper` command: `npx evalkeeper add pages`.
 *
 * @module evalkeeper/cli
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { addPages, nextSteps, type AddPagesOptions } from "./addPages.js";

/** The `evalkeeper` command. */

/** The command's help text. */
export const HELP = `Usage: npx evalkeeper add pages [options]

Copies Evalkeeper's eval pages, components, and their glue into your
Next.js app, fitted to its folders and import alias.

Options:
  --base <path>   Where the pages live in your app (default: evals)
  --alias <name>  Your import alias, e.g. "@" or "~" (default: from tsconfig.json)
  --root <dir>    Where the alias points, e.g. "src" (default: from tsconfig.json)
  --no-cron       Leave out the weekly check's cron route
  --force         Overwrite files that already exist (never your lib/evalkeeper/index.ts)
  --dry-run       Show what would be written, and write nothing
  --help          Show this
`;

/** The package's own folder, where the templates and starter ship. */
function packageDir(): string {
  // dist/cli/main.js → the package root.
  return join(dirname(fileURLToPath(import.meta.url)), "..", "..");
}

/**
 * Reads the command line into a command and options. Throws on an unknown option or a missing value.
 */
export function parseArgs(argv: string[]): Partial<AddPagesOptions> & {
  command: string[];
  help: boolean;
} {
  const out: Partial<AddPagesOptions> & { command: string[]; help: boolean } = {
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
  if (args.command.join(" ") !== "add pages") {
    io.error(`Unknown command "${args.command.join(" ")}".`);
    io.error(HELP);
    return 2;
  }
  const pkg = io.pkgDir ?? packageDir();
  try {
    const { command: _command, help: _help, ...rest } = args;
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
    io.log("\nNext:");
    for (const [i, step] of nextSteps(result).entries())
      io.log(`  ${i + 1}. ${step}`);
    return 0;
  } catch (e) {
    io.error(e instanceof Error ? e.message : String(e));
    return 1;
  }
}
