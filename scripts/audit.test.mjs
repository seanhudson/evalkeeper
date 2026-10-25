// The audit gate (scripts/audit.mjs). Runs with `npm run test:scripts`,
// part of `npm run check`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { advisoryId, readAudit } from "./audit.mjs";

const advisory = (name, severity, id) => ({
  name,
  severity,
  title: `${name} problem`,
  url: `https://github.com/advisories/${id}`,
});

const REPORT = {
  vulnerabilities: {
    zod: {
      via: [advisory("zod", "high", "GHSA-aaaa-bbbb-cccc")],
    },
    // Reached through zod: named, not repeated.
    lib: { via: ["zod"] },
    left: { via: [advisory("left", "critical", "GHSA-dddd-eeee-ffff")] },
    mild: { via: [advisory("mild", "moderate", "GHSA-gggg-hhhh-iiii")] },
  },
};

test("blocks high and critical advisories that aren't allowed", () => {
  const r = readAudit(REPORT, { "GHSA-aaaa-bbbb-cccc": "why" });
  assert.deepEqual(
    r.blocking.map((a) => a.id),
    ["GHSA-dddd-eeee-ffff"],
  );
  assert.deepEqual(
    r.allowed.map((a) => a.id),
    ["GHSA-aaaa-bbbb-cccc"],
  );
  assert.deepEqual(r.stale, []);
});

test("passes when every high or critical one is allowed, and ignores moderate", () => {
  const r = readAudit(REPORT, {
    "GHSA-aaaa-bbbb-cccc": "why",
    "GHSA-dddd-eeee-ffff": "why",
  });
  assert.deepEqual(r.blocking, []);
});

test("names allowed advisories that are no longer reported", () => {
  const r = readAudit({ vulnerabilities: {} }, { "GHSA-aaaa-bbbb-cccc": "x" });
  assert.deepEqual(r, {
    blocking: [],
    allowed: [],
    stale: ["GHSA-aaaa-bbbb-cccc"],
  });
  assert.deepEqual(readAudit({}).blocking, []);
});

test("reads a GHSA id from an advisory URL", () => {
  assert.equal(
    advisoryId("https://github.com/advisories/GHSA-mrhx-c7xc-m3w5"),
    "GHSA-mrhx-c7xc-m3w5",
  );
  assert.equal(advisoryId("https://example.test/1"), "https://example.test/1");
});
