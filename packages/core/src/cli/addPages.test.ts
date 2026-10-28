import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  cleanBase,
  fitFile,
  importsOf,
  pickOnly,
  planAddPages,
  urlOfBase,
  readAlias,
  templateName,
  withoutJsonComments,
} from "./addPages.js";
import { parseArgs, run } from "./main.js";

const pkg = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const templatesDir = join(pkg, "templates");
const starterFile = join(pkg, "starter", "index.ts");

beforeAll(() => {
  // The templates are built from the example app.
  execFileSync("node", [join(pkg, "scripts", "build-templates.mjs")]);
});

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** A throwaway app with a tsconfig and an app folder. */
function app(tsconfig: string, appDir = "app"): string {
  const dir = mkdtempSync(join(tmpdir(), "evalkeeper-cli-"));
  dirs.push(dir);
  writeFileSync(join(dir, "tsconfig.json"), tsconfig);
  mkdirSync(join(dir, appDir), { recursive: true });
  return dir;
}
const AT = '{ "compilerOptions": { "paths": { "@/*": ["./*"] } } }';

function cli(cwd: string, ...argv: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const code = run(argv, {
    cwd,
    pkgDir: pkg,
    log: (l) => out.push(l),
    error: (l) => err.push(l),
  });
  return { code, out: out.join("\n"), err: err.join("\n") };
}

describe("readAlias", () => {
  it("reads the alias and where it points, comments and trailing commas allowed", () => {
    const dir = app(`{
      // comments are fine
      "compilerOptions": { "paths": { "~/*": ["./src/*"], }, },
    }`);
    expect(readAlias(dir)).toEqual({ alias: "~", root: "src" });
    expect(readAlias(app(AT))).toEqual({ alias: "@", root: "." });
  });

  it("reads Next.js's default tsconfig, whose globs look like comments", () => {
    const dir = app(`{
      "compilerOptions": {
        "jsx": "preserve",
        "plugins": [{ "name": "next" }],
        "paths": { "@/*": ["./*"] }
      },
      "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
      "exclude": ["node_modules"]
    }`);
    expect(readAlias(dir)).toEqual({ alias: "@", root: "." });
  });

  it("strips comments only outside strings", () => {
    const jsonc = [
      "{",
      '  /* a comment */ "a": "/* not a comment */",',
      "  // a line comment",
      '  "b": "say \\"hi\\" // still text",',
      "}",
    ].join("\n");
    expect(JSON.parse(withoutJsonComments(jsonc))).toEqual({
      a: "/* not a comment */",
      b: 'say "hi" // still text',
    });
  });

  it("is null without a tsconfig, paths, or a usable entry", () => {
    expect(
      readAlias(mkdtempSync(join(tmpdir(), "evalkeeper-none-"))),
    ).toBeNull();
    expect(readAlias(app("{}"))).toBeNull();
    expect(
      readAlias(app('{ "compilerOptions": { "paths": { "x": ["y"] } } }')),
    ).toBeNull();
    expect(readAlias(app("not json"))).toBeNull();
  });
});

describe("fitting files to the app", () => {
  it("rewrites imports to the app's alias, only in code", () => {
    expect(
      fitFile("a.ts", 'import { x } from "@/lib/x";', {
        alias: "~",
        base: "evals",
      }),
    ).toBe('import { x } from "~/lib/x";');
    expect(
      fitFile("a.css", '@import "@/x";', { alias: "~", base: "evals" }),
    ).toBe('@import "@/x";');
  });

  it("sets the base path in paths.ts", () => {
    const text = 'export const EVALS_BASE = "/evals";';
    expect(
      fitFile("lib/evalkeeper/paths.ts", text, {
        alias: "@",
        base: "admin/evals",
      }),
    ).toBe('export const EVALS_BASE = "/admin/evals";');
  });

  it("leaves route groups out of the pages' URL (#66)", () => {
    const text = 'export const EVALS_BASE = "/evals";';
    expect(
      fitFile("lib/evalkeeper/paths.ts", text, {
        alias: "@",
        base: "(app)/admin/evals",
      }),
    ).toBe('export const EVALS_BASE = "/admin/evals";');
    expect(urlOfBase("(app)/(admin)/evals")).toBe("/evals");
    expect(urlOfBase("evals")).toBe("/evals");
  });

  it("cleans the base path and rejects odd ones", () => {
    expect(cleanBase("/admin/evals/")).toBe("admin/evals");
    expect(() => cleanBase("")).toThrow();
    expect(() => cleanBase("../etc")).toThrow();
  });
});

describe("evalkeeper add pages", () => {
  it("copies the pages, components, glue, cron route, and starter into an @ app", () => {
    const dir = app(AT);
    const r = cli(dir, "add", "pages");
    expect(r.code).toBe(0);
    for (const f of [
      "app/evals/page.tsx",
      "app/evals/[suite]/page.tsx",
      "app/evals/[suite]/rate/page.tsx",
      "app/evals/feedback/page.tsx",
      "components/evalkeeper/AnswerKey.tsx",
      "components/evalkeeper/evalkeeper.css",
      "lib/evalkeeper/actions.ts",
      "lib/evalkeeper/paths.ts",
      "app/api/cron/evals-weekly/route.ts",
      "lib/evalkeeper/index.ts",
    ])
      expect(existsSync(join(dir, f)), f).toBe(true);
    expect(r.out).toMatch(/Next:/);
    // The starter keeps everyone out until the app writes its own check.
    expect(readFileSync(join(dir, "lib/evalkeeper/index.ts"), "utf8")).toMatch(
      /throw new Error\(\s*"Evalkeeper: write requireAdmin/,
    );
  });

  it("follows a src folder, another alias, and a base path", () => {
    const dir = app(
      '{ "compilerOptions": { "paths": { "~/*": ["./src/*"] } } }',
      "src/app",
    );
    expect(cli(dir, "add", "pages", "--base", "admin/evals").code).toBe(0);
    const page = readFileSync(
      join(dir, "src/app/admin/evals/page.tsx"),
      "utf8",
    );
    expect(page).toMatch(/from "~\/lib\/evalkeeper"/);
    expect(page).not.toMatch(/from "@\//);
    expect(
      readFileSync(join(dir, "src/lib/evalkeeper/paths.ts"), "utf8"),
    ).toMatch('EVALS_BASE = "/admin/evals"');
  });

  it("never overwrites without --force, and never the app's wiring", () => {
    const dir = app(AT);
    cli(dir, "add", "pages");
    writeFileSync(join(dir, "app/evals/page.tsx"), "// mine");
    writeFileSync(join(dir, "lib/evalkeeper/index.ts"), "// my wiring");
    const again = cli(dir, "add", "pages");
    expect(again.out).toMatch(/already existed/);
    expect(readFileSync(join(dir, "app/evals/page.tsx"), "utf8")).toBe(
      "// mine",
    );
    cli(dir, "add", "pages", "--force");
    expect(readFileSync(join(dir, "app/evals/page.tsx"), "utf8")).not.toBe(
      "// mine",
    );
    expect(readFileSync(join(dir, "lib/evalkeeper/index.ts"), "utf8")).toBe(
      "// my wiring",
    );
  });

  it("writes the app's components file once, and never over the app's own", () => {
    const dir = app(AT);
    cli(dir, "add", "pages");
    const file = join(dir, "lib/evalkeeper/appComponents.ts");
    expect(readFileSync(file, "utf8")).toMatch(/export const components/);
    writeFileSync(file, "// my components");
    cli(dir, "add", "pages", "--force");
    expect(readFileSync(file, "utf8")).toBe("// my components");
  });

  it("writes nothing on a dry run, and leaves out the cron route on request", () => {
    const dir = app(AT);
    const dry = cli(dir, "add", "pages", "--dry-run");
    expect(dry.out).toMatch(/Dry run: nothing written/);
    expect(existsSync(join(dir, "app/evals"))).toBe(false);
    cli(dir, "add", "pages", "--no-cron");
    expect(existsSync(join(dir, "app/api/cron/evals-weekly/route.ts"))).toBe(
      false,
    );
    expect(existsSync(join(dir, "app/evals/page.tsx"))).toBe(true);
  });

  it("copies only the pages and components named, and says what they need", () => {
    const dir = app(AT);
    const r = cli(dir, "add", "pages", "--only", "suite,AnswerKey");
    expect(r.code).toBe(0);
    expect(existsSync(join(dir, "app/evals/[suite]/page.tsx"))).toBe(true);
    expect(existsSync(join(dir, "components/evalkeeper/AnswerKey.tsx"))).toBe(
      true,
    );
    expect(existsSync(join(dir, "app/evals/page.tsx"))).toBe(false);
    expect(existsSync(join(dir, "components/evalkeeper/Tip.tsx"))).toBe(false);
    // The wiring module is the app's; --only leaves it out unless named.
    expect(existsSync(join(dir, "lib/evalkeeper/index.ts"))).toBe(false);
    expect(r.out).toMatch(/which your app doesn't have/);
    expect(r.out).toMatch(/\bui\b/);
    expect(r.out).toMatch(/Check lib\/evalkeeper\/index\.ts exports/);
  });

  it("copies the compare and side-by-side pages by name, with what they need", () => {
    const dir = app(AT);
    const r = cli(dir, "add", "pages", "--only", "compare,side-by-side");
    expect(r.code).toBe(0);
    expect(existsSync(join(dir, "app/evals/[suite]/compare/page.tsx"))).toBe(
      true,
    );
    expect(
      existsSync(join(dir, "app/evals/[suite]/side-by-side/page.tsx")),
    ).toBe(true);
    expect(existsSync(join(dir, "app/evals/[suite]/page.tsx"))).toBe(false);
    expect(r.out).toMatch(/which your app doesn't have/);
    expect(r.out).toMatch(/\bDisagreementChip\b/);
    expect(templateName("app/evals/[suite]/side-by-side/page.tsx")).toBe(
      "side-by-side",
    );
  });

  it("puts a route-group base in the folders, not the links (#66)", () => {
    const dir = app(AT);
    const r = cli(dir, "add", "pages", "--base", "(app)/admin/evals");
    expect(r.code).toBe(0);
    expect(existsSync(join(dir, "app/(app)/admin/evals/page.tsx"))).toBe(true);
    expect(readFileSync(join(dir, "lib/evalkeeper/paths.ts"), "utf8")).toMatch(
      'export const EVALS_BASE = "/admin/evals";',
    );
    expect(r.out).toMatch(/Open \/admin\/evals in your app/);
  });

  it("doesn't call files missing that the same run copies (#66)", () => {
    const dir = app(AT);
    const r = cli(
      dir,
      "add",
      "pages",
      "--only",
      "compare,DisagreementChip,Submit,Tip,ui,paths,Fields,Controls,appComponents,swap",
      "--dry-run",
    );
    expect(r.code).toBe(0);
    // Only the wiring module is missing: this app has none yet.
    expect(r.out).toMatch(/These import index, which your app doesn't have/);
  });

  it("finds nothing missing when the app has what the chosen files import", () => {
    const dir = app(AT);
    cli(dir, "add", "pages");
    rmSync(join(dir, "app/evals/feedback"), { recursive: true });
    const r = cli(dir, "add", "pages", "--only", "feedback", "--dry-run");
    expect(r.out).toMatch(/write\s+app\/evals\/feedback\/page\.tsx/);
    expect(r.out).not.toMatch(/which your app doesn't have/);
    expect(existsSync(join(dir, "app/evals/feedback/page.tsx"))).toBe(false);
  });

  it("lists what --only would write, skip, and overwrite on a dry run", () => {
    const dir = app(AT);
    cli(dir, "add", "pages", "--only", "hub");
    const dry = cli(
      dir,
      "add",
      "pages",
      "--only",
      "hub",
      "--only",
      "Tip",
      "--dry-run",
    );
    expect(dry.out).toMatch(/skip\s+app\/evals\/page\.tsx \(exists\)/);
    expect(dry.out).toMatch(/write\s+components\/evalkeeper\/Tip\.tsx/);
    const forced = cli(
      dir,
      "add",
      "pages",
      "--only",
      "hub",
      "--force",
      "--dry-run",
    );
    expect(forced.out).toMatch(/overwrite\s+app\/evals\/page\.tsx/);
    expect(existsSync(join(dir, "components/evalkeeper/Tip.tsx"))).toBe(false);
  });

  it("takes groups and the wiring by name, and refuses names it doesn't know", () => {
    const dir = app(AT);
    const plan = planAddPages({
      cwd: dir,
      templatesDir,
      starterFile,
      only: ["pages", "index"],
    });
    expect(plan.files.map((f) => f.path).sort()).toEqual([
      "app/evals/[suite]/compare/page.tsx",
      "app/evals/[suite]/page.tsx",
      "app/evals/[suite]/rate/page.tsx",
      "app/evals/[suite]/runs/[runId]/page.tsx",
      "app/evals/[suite]/side-by-side/page.tsx",
      "app/evals/feedback/page.tsx",
      "app/evals/page.tsx",
      "lib/evalkeeper/index.ts",
    ]);
    expect(
      planAddPages({
        cwd: dir,
        templatesDir,
        starterFile,
        only: ["components"],
      }).files.every((f) => f.path.startsWith("components/evalkeeper/")),
    ).toBe(true);
    const bad = cli(dir, "add", "pages", "--only", "Nope");
    expect(bad.code).toBe(1);
    expect(bad.err).toMatch(/no page or component called "Nope"/);
    expect(bad.err).toMatch(/AnswerKey/);
    expect(pickOnly(["app/evals/page.tsx"], [" ", "HUB"])).toEqual([
      "app/evals/page.tsx",
    ]);
    expect(
      pickOnly(
        ["app/evals/[suite]/page.tsx", "app/evals/[suite]/rate/page.tsx"],
        ["rate"],
      ),
    ).toEqual(["app/evals/[suite]/rate/page.tsx"]);
  });

  it("reads a template's imports from the copied set", () => {
    expect(
      importsOf(
        "components/evalkeeper/AnswerKey.tsx",
        [
          'import { a } from "./ui";',
          'import { b } from "@/lib/evalkeeper";',
          'import { c } from "@/lib/evalkeeper/paths";',
          'import { d } from "react";',
          'import { e } from "@/lib/other";',
        ].join("\n"),
      ),
    ).toEqual([
      "components/evalkeeper/ui",
      "lib/evalkeeper/index.ts",
      "lib/evalkeeper/paths",
    ]);
  });

  it("explains what's wrong instead of guessing", () => {
    expect(cli(app("{}"), "add", "pages").err).toMatch(/No import alias found/);
    const noApp = app(AT);
    rmSync(join(noApp, "app"), { recursive: true });
    expect(cli(noApp, "add", "pages").err).toMatch(/App Router/);
    expect(cli(app(AT), "add", "pages", "--base", "../x").code).toBe(1);
    expect(cli(app(AT), "remove", "pages").code).toBe(2);
    expect(cli(app(AT), "add", "pages", "--nope").err).toMatch(
      /Unknown option/,
    );
    expect(cli(app(AT), "add", "pages", "--base").err).toMatch(/needs a value/);
    expect(cli(app(AT)).out).toMatch(
      /Usage: npx @crowandraven\/evalkeeper add pages/,
    );
    expect(cli(app(AT), "--help").code).toBe(0);
  });

  it("plans with the alias and root given on the command line", () => {
    const dir = app("{}", "web/app");
    const plan = planAddPages({
      cwd: dir,
      templatesDir,
      starterFile,
      alias: "#",
      root: "web",
    });
    expect(plan.files.every((f) => f.path.startsWith("web/"))).toBe(true);
    expect(
      parseArgs(["add", "pages", "--alias", "#", "--root", "web"]),
    ).toMatchObject({
      alias: "#",
      root: "web",
      command: ["add", "pages"],
    });
  });
});
