import assert from "node:assert/strict";

/**
 * The matchers the contracts in `@crowandraven/evalkeeper/testing` use, a
 * small part of Vitest's and Jest's `expect`. Any `expect` with these
 * works: Vitest's, the `expect` package, or `assertExpect`.
 */
export type ContractMatchers = {
  /** Passes when the value is the same one (`Object.is`). */
  toBe(expected: unknown): void;
  /** Passes when the value has the same content, ignoring undefined keys. */
  toEqual(expected: unknown): void;
  /** Passes when the value has at least these keys with these values. */
  toMatchObject(expected: object): void;
  /** Passes when the value's `length` is this. */
  toHaveLength(length: number): void;
  /** Passes when the value is null. */
  toBeNull(): void;
  /** For a promise: passes when it fails as described. */
  rejects: {
    /** Passes when the promise fails with an error whose message has this text. */
    toThrow(expected: string): Promise<void>;
    /** Passes when the promise fails with an instance of this class. */
    toBeInstanceOf(
      expected: abstract new (...args: never[]) => unknown,
    ): Promise<void>;
  };
};

/**
 * An `expect` the contracts can use: takes a value (and a message to show
 * when a check fails) and returns the matchers.
 */
export type ContractExpect = (
  actual: unknown,
  message?: string,
) => ContractMatchers;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (typeof v !== "object" || v === null) return false;
  const proto: unknown = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/** A copy without undefined keys, as Vitest's `toEqual` compares. */
function withoutUndefined(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(withoutUndefined);
  if (!isPlainObject(v)) return v;
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v))
    if (x !== undefined) out[k] = withoutUndefined(x);
  return out;
}

/**
 * The part of `actual` that `expected` names, so a deep comparison of the
 * two checks only those keys (Vitest's `toMatchObject`).
 */
function picked(actual: unknown, expected: unknown): unknown {
  if (Array.isArray(expected) && Array.isArray(actual))
    return actual.length === expected.length
      ? actual.map((a, i) => picked(a, expected[i]))
      : actual;
  if (!isPlainObject(expected) || !isPlainObject(actual)) return actual;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(expected))
    if (k in actual) out[k] = picked(actual[k], expected[k]);
  return out;
}

async function failure(p: unknown): Promise<unknown> {
  try {
    await p;
  } catch (e) {
    return e;
  }
  throw new assert.AssertionError({
    message: "Expected the promise to fail, but it succeeded",
  });
}

/**
 * An `expect` on `node:assert`, with just the matchers the contracts use,
 * for running them outside Vitest (under `node:test`, say). Failures are
 * `node:assert` errors, so any runner reports them.
 *
 * @param actual - The value to check.
 * @param message - What to say when a check fails.
 *
 * @example
 * ```ts
 * import { describe, it } from "node:test";
 * import { assertExpect, describeStoreContract } from "@crowandraven/evalkeeper/testing";
 *
 * describeStoreContract("my store", () => myStore(), {
 *   test: { describe, it, expect: assertExpect },
 * });
 * ```
 */
export const assertExpect: ContractExpect = (actual, message) => ({
  toBe(expected) {
    assert.ok(
      Object.is(actual, expected),
      message ?? `Expected ${String(actual)} to be ${String(expected)}`,
    );
  },
  toEqual(expected) {
    assert.deepStrictEqual(
      withoutUndefined(actual),
      withoutUndefined(expected),
      message,
    );
  },
  toMatchObject(expected) {
    assert.ok(
      typeof actual === "object" && actual !== null,
      message ?? "Expected an object",
    );
    assert.deepStrictEqual(
      withoutUndefined(picked(actual, expected)),
      withoutUndefined(expected),
      message,
    );
  },
  toHaveLength(length) {
    const got: unknown =
      typeof actual === "string" || Array.isArray(actual)
        ? actual.length
        : undefined;
    assert.strictEqual(got, length, message);
  },
  toBeNull() {
    assert.strictEqual(actual, null, message);
  },
  rejects: {
    async toThrow(expected) {
      const e = await failure(actual);
      const text = e instanceof Error ? e.message : String(e);
      assert.ok(
        text.includes(expected),
        message ?? `Expected an error saying "${expected}", got "${text}"`,
      );
    },
    async toBeInstanceOf(expected) {
      const e = await failure(actual);
      assert.ok(
        e instanceof expected,
        message ?? `Expected an error of class ${expected.name}`,
      );
    },
  },
});
