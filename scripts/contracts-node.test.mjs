// The store and suite contracts outside Vitest: under node:test with
// assertExpect, both here (Vitest installed) and in a child process where
// Vitest can't be found, as in an app that doesn't install it. Runs with
// `npm run test:scripts`, part of `npm run check`, on the built packages.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { memoryStore } from "../packages/core/dist/memoryStore.js";
import {
  assertExpect,
  describeFeedbackStoreContract,
  describeSettingsStoreContract,
  describeStoreContract,
  describeSuiteContract,
} from "../packages/core/dist/testing.js";

const test = { describe, it, expect: assertExpect, afterAll: after };

describeStoreContract("memoryStore under node:test", () => memoryStore(), {
  test,
});
describeFeedbackStoreContract(
  "memoryStore under node:test",
  () => memoryStore(),
  { test },
);
describeSettingsStoreContract(
  "memoryStore under node:test",
  () => memoryStore(),
  { test },
);

// One store holding other rows, with the contracts scoped and a cleanup
// that runs once after them.
const shared = memoryStore();
const kept = await shared.createCase({
  suite: "s",
  input: { text: "ours" },
  tags: [],
  split: "TEST",
  status: "ACTIVE",
  source: "OWNER",
  sourceRef: null,
  note: null,
  labels: [],
});
const cleaned = [];
describe("scoped, under node:test", () => {
  describeStoreContract("memoryStore, scoped", () => shared, {
    test,
    scope: "contract-",
    cleanup: async (scope) => {
      cleaned.push(scope);
    },
  });
  it("left the other rows alone, and cleaned up once", async () => {
    assert.deepEqual(await shared.listCases("s"), [kept]);
    assert.deepEqual(cleaned, ["contract-"]);
  });
});

describeSuiteContract(
  "a suite under node:test",
  [
    {
      key: "echo",
      operation: "echo",
      priority: { favor: "quality" },
      label: "Echo",
      description: "Says the text back.",
      graderVersion: "1",
      input: z.object({ text: z.string() }),
      labelValue: z.object({ want: z.string() }),
      fields: {
        input: [
          {
            name: "text",
            label: "Text",
            help: "What to say back, word for word.",
          },
        ],
        label: [
          {
            name: "want",
            label: "Wanted",
            help: "The text as it should come back.",
          },
        ],
      },
      checks: [
        {
          key: "match",
          label: "Matches",
          description: "The answer is the text: serious, since it's the job.",
          kind: "label",
          severity: "serious",
        },
      ],
      run: async (i) => i,
      grade: async () => [],
      inputFromForm: () => ({ text: "" }),
      title: (i) => i.text,
    },
  ],
  { test },
);

it("runs the contracts where Vitest can't be found", () => {
  const here = (p) => fileURLToPath(new URL(p, import.meta.url));
  // A fresh node:test run of its own, not a part of this one.
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const child = spawnSync(
    process.execPath,
    [
      "--import",
      here("./fixtures/block-vitest.mjs"),
      "--test",
      "--test-reporter=tap",
      here("./fixtures/contracts-without-vitest.mjs"),
    ],
    { encoding: "utf8", env },
  );
  assert.equal(child.status, 0, child.stdout + child.stderr);
  const passed = Number(/^# pass (\d+)$/m.exec(child.stdout)?.[1]);
  assert.ok(passed > 20, `Only ${passed} tests passed:\n${child.stdout}`);
  assert.match(child.stdout, /^# fail 0$/m);
});
