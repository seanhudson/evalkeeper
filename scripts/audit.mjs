// Runs `npm audit` and fails on high or critical advisories, except the
// ones allowed below. CI runs it in place of `npm audit --audit-level=high`,
// so an advisory with no fix we can take yet doesn't hold every pull
// request red. Each allowed advisory says why and when it comes out.
//
//   node scripts/audit.mjs
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/** Advisories allowed for now, by GHSA id, with why. */
export const ALLOWED = {
  // zod below 4.6.6 can exhaust memory validating oversized constrained
  // collections. Every zod 3 version is affected and the fix is zod 4, a
  // planned major. Comes out with the zod 4 upgrade.
  "GHSA-mrhx-c7xc-m3w5": "zod 3: fixed only in zod 4 (planned upgrade)",
};

const BLOCKING = new Set(["high", "critical"]);

/** The GHSA id in an advisory's URL, or its URL when there's none. */
export function advisoryId(url) {
  return url.match(/GHSA(-[a-z0-9]{4}){3}/)?.[0] ?? url;
}

/**
 * Reads an `npm audit --json` report: the high or critical advisories not
 * allowed (`blocking`), and the allowed ones it no longer reports
 * (`stale`), which can come out of the list.
 */
export function readAudit(report, allowed = ALLOWED) {
  const found = new Map();
  for (const v of Object.values(report.vulnerabilities ?? {}))
    for (const via of v.via ?? [])
      if (typeof via === "object" && BLOCKING.has(via.severity))
        found.set(advisoryId(via.url), {
          id: advisoryId(via.url),
          name: via.name,
          severity: via.severity,
          title: via.title,
          url: via.url,
        });
  const all = [...found.values()];
  return {
    blocking: all.filter((a) => !(a.id in allowed)),
    allowed: all.filter((a) => a.id in allowed),
    stale: Object.keys(allowed).filter((id) => !found.has(id)),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let out;
  try {
    out = execFileSync("npm", ["audit", "--json"], { encoding: "utf8" });
  } catch (e) {
    // npm audit exits non-zero when it finds anything; the report is still on stdout.
    out = e.stdout;
  }
  const { blocking, allowed, stale } = readAudit(JSON.parse(out));
  for (const a of allowed)
    console.log(`Allowed for now: ${a.id} (${a.name}): ${ALLOWED[a.id]}`);
  for (const id of stale)
    console.log(`No longer reported, remove from scripts/audit.mjs: ${id}`);
  if (blocking.length) {
    for (const a of blocking)
      console.error(`${a.severity}: ${a.name}: ${a.title} ${a.url}`);
    process.exit(1);
  }
  console.log("No high or critical advisories beyond the allowed ones.");
}
