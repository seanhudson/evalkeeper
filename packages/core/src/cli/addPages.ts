import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";

/**
 * `npx @crowandraven/evalkeeper add pages`: copies the eval pages, components, and their
 * glue into a Next.js app, fitted to its folders and import alias. It never
 * overwrites a file unless told to, and writes the app's wiring module only
 * when there isn't one. Node-only (it reads and writes files).
 */

/** What gets copied, from the template (the example app's layout). */
export const TEMPLATE_FILES = {
  /** Copied as they are, with imports rewritten to the app's alias. */
  always: [
    "components/evalkeeper",
    "app/evals",
    "lib/evalkeeper/actions.ts",
    "lib/evalkeeper/weekly.ts",
    "lib/evalkeeper/cronAuth.ts",
    "lib/evalkeeper/time.ts",
    "lib/evalkeeper/paths.ts",
  ],
  /** The weekly check's cron route; skipped with --no-cron. */
  cron: ["app/api/cron/evals-weekly/route.ts"],
} as const;

/**
 * What `addPages` needs: the app's folder, the templates, and the choices from the command line.
 */
export type AddPagesOptions = {
  /** The app's folder. */
  cwd: string;
  /** The built templates (the example app's files). */
  templatesDir: string;
  /** The starter wiring module. */
  starterFile: string;
  /** Where the pages live, under the app: "evals", "admin/evals". */
  base?: string;
  /** The import alias (`@`); read from tsconfig.json when absent. */
  alias?: string;
  /** Where the alias points ("src", "."); read from tsconfig.json. */
  root?: string;
  cron?: boolean;
  force?: boolean;
  dryRun?: boolean;
};

/** One file the command would write, overwrite, or leave alone. */
export type PlannedFile = {
  /** Relative to the app's folder. */
  path: string;
  action: "write" | "overwrite" | "skip";
  contents: string;
};

/**
 * JSON with comments and trailing commas (what tsconfig.json allows) as
 * plain JSON. Scans character by character so "/*" inside a string, like
 * `"~/*"` or `"**\/*.ts"`, is never mistaken for a comment.
 */
export function withoutJsonComments(text: string): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const c = text.charAt(i);
    const next = text.charAt(i + 1);
    if (c === '"') {
      // A string, copied as it is, escapes included.
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j + 1;
    } else if (c === "/" && next === "/") {
      while (i < text.length && text[i] !== "\n") i++;
    } else if (c === "/" && next === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end < 0 ? text.length : end + 2;
    } else {
      out += c;
      i++;
    }
  }
  // Trailing commas, now that no comment can hide one.
  return out.replace(/,(\s*[}\]])/g, "$1");
}

/** The app's import alias and where it points, from tsconfig.json. */
export function readAlias(cwd: string): { alias: string; root: string } | null {
  const file = join(cwd, "tsconfig.json");
  if (!existsSync(file)) return null;
  const text = withoutJsonComments(readFileSync(file, "utf8"));
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  const paths = (parsed as { compilerOptions?: { paths?: unknown } })
    .compilerOptions?.paths;
  if (!paths || typeof paths !== "object") return null;
  for (const [key, value] of Object.entries(paths)) {
    const target = Array.isArray(value) ? (value[0] as unknown) : undefined;
    if (!key.endsWith("/*") || typeof target !== "string") continue;
    if (!target.endsWith("/*")) continue;
    const root = target.slice(0, -2).replace(/^\.\//, "") || ".";
    return { alias: key.slice(0, -2), root };
  }
  return null;
}

/** "admin/evals" from "/admin/evals/" or "admin/evals". */
export function cleanBase(base: string): string {
  const b = base.trim().replace(/^\/+|\/+$/g, "");
  if (!b || !/^[a-z0-9_\-/[\]()]+$/i.test(b))
    throw new Error(`"${base}" isn't a usable path for the eval pages`);
  return b;
}

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? listFiles(join(dir, e.name)) : [join(dir, e.name)],
  );
}

/** A template file's text, fitted to the app. */
export function fitFile(
  templatePath: string,
  text: string,
  o: { alias: string; base: string },
): string {
  let out = text;
  if (/\.(ts|tsx)$/.test(templatePath) && o.alias !== "@")
    out = out.replace(/(["'])@\//g, `$1${o.alias}/`);
  if (templatePath === "lib/evalkeeper/paths.ts")
    out = out.replace(
      /export const EVALS_BASE = "[^"]*";/,
      `export const EVALS_BASE = "/${o.base}";`,
    );
  return out;
}

/** Where a template file goes in the app, relative to the app's root folder. */
function destinationOf(templatePath: string, base: string): string {
  return templatePath.startsWith("app/evals/")
    ? `app/${base}/${templatePath.slice("app/evals/".length)}`
    : templatePath;
}

/** Works out every file to write, without writing anything. */
export function planAddPages(o: AddPagesOptions): {
  files: PlannedFile[];
  alias: string;
  root: string;
  base: string;
} {
  const base = cleanBase(o.base ?? "evals");
  const found = readAlias(o.cwd);
  const alias = o.alias ?? found?.alias;
  const root = o.root ?? found?.root ?? (alias ? "." : undefined);
  if (!alias || root === undefined)
    throw new Error(
      'No import alias found. Add one to tsconfig.json ("paths": { "@/*": ["./*"] }), or pass --alias and --root.',
    );
  const rootDir = join(o.cwd, root);
  if (!existsSync(join(rootDir, "app")))
    throw new Error(
      `No app folder at ${relative(o.cwd, join(rootDir, "app")) || "app"}: Evalkeeper's pages are for the Next.js App Router.`,
    );

  const sources = [
    ...TEMPLATE_FILES.always,
    ...(o.cron === false ? [] : TEMPLATE_FILES.cron),
  ].flatMap((entry) => {
    const full = join(o.templatesDir, entry);
    if (!existsSync(full))
      throw new Error(
        `The templates are missing ${entry}; rebuild the package.`,
      );
    return entry.endsWith(".ts") || entry.endsWith(".tsx")
      ? [entry]
      : listFiles(full).map((f) => relative(o.templatesDir, f));
  });

  const plan = (path: string, contents: string, alwaysSkipExisting = false) => {
    const exists = existsSync(join(o.cwd, path));
    const action: PlannedFile["action"] = !exists
      ? "write"
      : o.force && !alwaysSkipExisting
        ? "overwrite"
        : "skip";
    return { path, action, contents };
  };

  const files: PlannedFile[] = sources.map((t) =>
    plan(
      join(root, destinationOf(t, base)),
      fitFile(t, readFileSync(join(o.templatesDir, t), "utf8"), {
        alias,
        base,
      }),
    ),
  );
  // The wiring module is the app's own: written once, never overwritten.
  files.push(
    plan(
      join(root, "lib/evalkeeper/index.ts"),
      fitFile("lib/evalkeeper/index.ts", readFileSync(o.starterFile, "utf8"), {
        alias,
        base,
      }),
      true,
    ),
  );
  return { files, alias, root, base };
}

/** Writes the plan (unless it's a dry run) and returns it. */
export function addPages(o: AddPagesOptions) {
  const result = planAddPages(o);
  if (!o.dryRun)
    for (const f of result.files) {
      if (f.action === "skip") continue;
      const dest = join(o.cwd, f.path);
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, f.contents);
    }
  return result;
}

/** What to do next, in order, for the summary the CLI prints. */
export function nextSteps(r: {
  root: string;
  alias: string;
  base: string;
  files: PlannedFile[];
}): string[] {
  const wiring = r.files.find((f) =>
    f.path.endsWith("lib/evalkeeper/index.ts"),
  );
  const css = join(r.root, "components/evalkeeper/evalkeeper.css");
  return [
    "npm install @crowandraven/evalkeeper @crowandraven/evalkeeper-prisma @crowandraven/evalkeeper-ai-sdk server-only lucide-react",
    "Add Evalkeeper's models to your Prisma schema (node_modules/@crowandraven/evalkeeper-prisma/schema/evalkeeper.prisma), then write a migration from the schema file.",
    `Import the colors into your global CSS, right after Tailwind: @import "${css}"; (a path relative to that CSS file).`,
    wiring?.action === "skip"
      ? `Check ${wiring.path} exports what the pages use: MODELS, availableModels, modelsFor, SUITES, SUITE_BY_KEY, store, feedbackStore, settings, routeFor, runner, and requireAdmin.`
      : `Fill in ${wiring?.path ?? "lib/evalkeeper/index.ts"}: your Prisma client, models, suites, and requireAdmin (until then, nobody can open the pages).`,
    `Open /${r.base} in your app.`,
  ];
}
