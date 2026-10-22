// The store contracts under node:test with Vitest unresolvable (run by
// contracts-node.test.mjs with block-vitest.mjs): the testing entry still
// loads, says what to pass when given nothing, and runs with node:test.
import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { memoryStore } from "../../packages/core/dist/memoryStore.js";
import {
  assertExpect,
  describeFeedbackStoreContract,
  describeSettingsStoreContract,
  describeStoreContract,
} from "../../packages/core/dist/testing.js";

const test = { describe, it, expect: assertExpect, afterAll: after };

it("can't import Vitest here", async () => {
  await assert.rejects(import("vitest"), { code: "ERR_MODULE_NOT_FOUND" });
});

it("says to pass test functions when given none", () => {
  assert.throws(
    () => describeStoreContract("no functions", () => memoryStore()),
    /Vitest couldn't be loaded \(Cannot find package 'vitest'\), so pass your own test functions/,
  );
});

describeStoreContract("memoryStore without Vitest", () => memoryStore(), {
  test,
});
describeFeedbackStoreContract(
  "memoryStore without Vitest",
  () => memoryStore(),
  { test },
);
describeSettingsStoreContract(
  "memoryStore without Vitest",
  () => memoryStore(),
  { test },
);
