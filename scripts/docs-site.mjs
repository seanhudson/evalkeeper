// Copies the repo's docs into the docs site (site/), so docs/ stays the
// one place they're written and every code change updates them in the
// same pull request. Each page gets its title from its first heading,
// links between docs become site links, links to the rest of the repo go
// to GitHub, and Mermaid diagrams are drawn in the browser. What it
// writes is generated and git-ignored.
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, posix } from "node:path";
import { fileURLToPath } from "node:url";

/** The site's base path on GitHub Pages. */
export const BASE = "/evalkeeper";
const REPO = "https://github.com/seanhudson/evalkeeper";

/**
 * Each page the site shows: its source in the repo, and where it lives
 * on the site. The sidebar (site/astro.config.mjs) lists them in order.
 */
export const PAGES = [
  { from: "docs/try-the-example.md", slug: "start/try-the-example" },
  { from: "docs/concepts.md", slug: "start/concepts" },
  { from: "docs/before-you-start.md", slug: "start/before-you-start" },
  { from: "docs/what-you-get.md", slug: "start/what-you-get" },
  { from: "docs/adding-to-your-app.md", slug: "start/adding-to-your-app" },
  { from: "docs/answer-key.md", slug: "guides/answer-key" },
  { from: "docs/choosing-models.md", slug: "guides/choosing-models" },
  { from: "docs/thumbs.md", slug: "guides/thumbs" },
  { from: "docs/upkeep.md", slug: "guides/upkeep" },
  { from: "docs/ready-made-suites.md", slug: "guides/ready-made-suites" },
  { from: "docs/models.md", slug: "guides/models" },
  { from: "docs/suites.md", slug: "guides/suites" },
  { from: "docs/screens.md", slug: "guides/screens" },
  { from: "docs/bring-your-own.md", slug: "guides/bring-your-own" },
  { from: "docs/best-practices.md", slug: "guides/best-practices" },
  { from: "docs/upgrading.md", slug: "upgrading/how-to-upgrade" },
  { from: "CHANGELOG.md", slug: "upgrading/changelog" },
  { from: "docs/roadmap.md", slug: "project/roadmap" },
  { from: "docs/architecture.md", slug: "project/architecture" },
];

/** Folders the pages are written into, emptied before each sync. */
const FOLDERS = [...new Set(PAGES.map((p) => p.slug.split("/")[0]))];

/** The title from a page's first heading, and the page without it. */
export function splitTitle(text) {
  const m = /^#\s+(.+)\n+/m.exec(text);
  if (!m) throw new Error("A page needs a # heading for its title.");
  return {
    title: m[1].trim(),
    body: text.slice(0, m.index) + text.slice(m.index + m[0].length),
  };
}

/** The first paragraph as plain text, for the page's description. */
export function firstParagraph(body) {
  const para = body
    .trim()
    .split(/\n\s*\n/)
    .find((p) => !/^(#|```|[-*|<>]|\d+\.)/.test(p.trim()));
  if (!para) return null;
  return para
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[`*_]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * A link as the site needs it. `from` is the page's path in the repo.
 * Another synced page becomes its site path; a screenshot, the site's
 * copy; anything else in the repo, GitHub. Outside links, anchors on the
 * same page, and mail links stay as they are.
 */
export function rewriteLink(href, from) {
  if (/^([a-z]+:|#)/i.test(href)) return href;
  const [path = "", hash = ""] = href.split(/(?=#)/);
  const target = posix.normalize(posix.join(posix.dirname(from), path));
  const page = PAGES.find((p) => p.from === target);
  if (page) return `${BASE}/${page.slug}/${hash}`;
  if (target.startsWith("docs/screenshots/"))
    return `${BASE}/screenshots/${posix.basename(target)}`;
  if (target === "docs/api" || target.startsWith("docs/api/"))
    return `${BASE}/api/`;
  const kind = posix.extname(target) || target === "LICENSE" ? "blob" : "tree";
  return `${REPO}/${kind}/main/${target}${hash}`;
}

const escapeHtml = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * A screenshot on a line of its own, `![alt](screenshots/x-light.png
 * "caption")`, as a figure that shows the light or dark file to match the
 * reader's theme. GitHub shows the light one.
 */
export function screenshotFigure(line, from) {
  const m = /^!\[([^\]]*)\]\(([^)\s]+)-light\.png(?:\s+"([^"]*)")?\)\s*$/.exec(
    line.trim(),
  );
  if (!m) return null;
  const [, alt, stem, caption] = m;
  const src = (scheme) => rewriteLink(`${stem}-${scheme}.png`, from);
  const attr = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  return [
    '<figure class="ek-figure"><div class="ek-shot">',
    `<img class="dark:sl-hidden" src="${src("light")}" alt="${attr(alt)}" loading="lazy" />`,
    `<img class="light:sl-hidden" src="${src("dark")}" alt="${attr(alt)}" loading="lazy" />`,
    "</div>",
    ...(caption ? [`<figcaption>${escapeHtml(caption)}</figcaption>`] : []),
    "</figure>",
  ].join("");
}

const ALERTS = {
  NOTE: "note",
  TIP: "tip",
  IMPORTANT: "note",
  WARNING: "caution",
  CAUTION: "danger",
};

/**
 * GitHub's alerts (`> [!TIP]` and the quoted lines under it) as
 * Starlight's asides, so a tip stands out on the site as it does on
 * GitHub.
 */
export function alertsToAsides(body) {
  const lines = body.split("\n");
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/.exec(
      lines[i],
    );
    if (!m) {
      out.push(lines[i]);
      continue;
    }
    out.push(`:::${ALERTS[m[1]]}`);
    while (i + 1 < lines.length && /^>/.test(lines[i + 1]))
      out.push(lines[++i].replace(/^> ?/, ""));
    out.push(":::");
  }
  return out.join("\n");
}

/** A page's body with its links rewritten and diagrams ready to draw. */
export function convertBody(body, from) {
  const out = [];
  const lines = body.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = /^(\s*)(```+|~~~+)(\S*)/.exec(line);
    if (fence) {
      // Code is copied as it is; a Mermaid diagram becomes a block the
      // site's script draws.
      const end = [];
      let j = i + 1;
      while (j < lines.length && !lines[j].trim().startsWith(fence[2]))
        end.push(lines[j++]);
      if (fence[3] === "mermaid")
        out.push(`<pre class="mermaid">${escapeHtml(end.join("\n"))}</pre>`);
      else out.push(line, ...end, lines[j] ?? "");
      i = j;
      continue;
    }
    const figure = screenshotFigure(line, from);
    if (figure) {
      out.push(figure);
      continue;
    }
    out.push(
      line.replace(
        /(\]\()([^)\s]+)(\))/g,
        (_, open, href, close) => open + rewriteLink(href, from) + close,
      ),
    );
  }
  return out.join("\n");
}

/** The generated page: frontmatter, then the converted body. */
export function toPage(text, from) {
  const { title, body } = splitTitle(text);
  const description = firstParagraph(body);
  const front = [
    "---",
    `title: ${JSON.stringify(title)}`,
    ...(description ? [`description: ${JSON.stringify(description)}`] : []),
    "editUrl: " + JSON.stringify(`${REPO}/edit/main/${from}`),
    "---",
    "",
    "<!-- Generated from the repo by scripts/docs-site.mjs: edit the source. -->",
  ];
  return `${front.join("\n")}\n\n${convertBody(alertsToAsides(body), from)}`;
}

/** Writes every page and the screenshots into the site. */
export function sync(root) {
  const site = join(root, "site");
  for (const dir of FOLDERS)
    rmSync(join(site, "src/content/docs", dir), {
      recursive: true,
      force: true,
    });
  for (const p of PAGES) {
    const dest = join(site, "src/content/docs", `${p.slug}.md`);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(
      dest,
      toPage(readFileSync(join(root, p.from), "utf8"), p.from),
    );
  }
  rmSync(join(site, "public/screenshots"), { recursive: true, force: true });
  cpSync(join(root, "docs/screenshots"), join(site, "public/screenshots"), {
    recursive: true,
  });
  // TypeDoc's reference, when built (`npm run docs:api`), is served at /api.
  rmSync(join(site, "public/api"), { recursive: true, force: true });
  if (existsSync(join(root, "docs/api/index.html")))
    cpSync(join(root, "docs/api"), join(site, "public/api"), {
      recursive: true,
    });
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  sync(join(dirname(fileURLToPath(import.meta.url)), ".."));
