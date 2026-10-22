import { describe, expect, it } from "vitest";
import { assertExpect } from "./assertExpect.js";

class Odd extends Error {}

describe("assertExpect", () => {
  it("passes and fails toBe on the same value", () => {
    const o = {};
    assertExpect(o).toBe(o);
    assertExpect(Number.NaN).toBe(Number.NaN);
    expect(() => {
      assertExpect({}).toBe({});
    }).toThrow(/to be/);
    expect(() => {
      assertExpect(1, "one is not two").toBe(2);
    }).toThrow("one is not two");
  });

  it("compares content with toEqual, ignoring undefined keys", () => {
    assertExpect({ a: 1, b: undefined, c: [{ d: undefined }] }).toEqual({
      a: 1,
      c: [{}],
    });
    assertExpect([1, 2]).toEqual([1, 2]);
    expect(() => {
      assertExpect({ a: 1 }).toEqual({ a: 2 });
    }).toThrow();
  });

  it("checks only the named keys with toMatchObject, deeply", () => {
    const when = new Date(5);
    assertExpect({
      a: 1,
      b: { c: 2, d: 3 },
      e: when,
      f: [{ g: 1, h: 2 }],
    }).toMatchObject({
      b: { c: 2 },
      e: new Date(5),
      f: [{ g: 1 }],
    });
    expect(() => {
      assertExpect({ a: 1 }).toMatchObject({ a: 1, b: 2 });
    }).toThrow();
    expect(() => {
      assertExpect({ f: [1] }).toMatchObject({ f: [1, 2] });
    }).toThrow();
    expect(() => {
      assertExpect(null, "no object").toMatchObject({});
    }).toThrow("no object");
    expect(() => {
      assertExpect({ a: 1 }).toMatchObject({ a: { b: 1 } });
    }).toThrow();
  });

  it("checks lengths and null", () => {
    assertExpect([1, 2]).toHaveLength(2);
    assertExpect("abc").toHaveLength(3);
    assertExpect(null).toBeNull();
    expect(() => {
      assertExpect({ length: 2 }).toHaveLength(2);
    }).toThrow();
    expect(() => {
      assertExpect(undefined).toBeNull();
    }).toThrow();
  });

  it("checks how a promise fails", async () => {
    await assertExpect(
      Promise.reject(new Error("no temperature column")),
    ).rejects.toThrow("temperature");
    await assertExpect(Promise.reject(new Error("x"))).rejects.toThrow("x");
    await assertExpect(Promise.reject(new Odd("x"))).rejects.toBeInstanceOf(
      Odd,
    );
    await expect(
      assertExpect(Promise.reject(new Error("other"))).rejects.toThrow(
        "temperature",
      ),
    ).rejects.toThrow(/temperature/);
    await expect(
      // A promise can fail with something that isn't an Error.
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      assertExpect(Promise.reject("plain words")).rejects.toThrow(
        "temperature",
      ),
    ).rejects.toThrow(/plain words/);
    await expect(
      assertExpect(Promise.reject(new Error("x"))).rejects.toBeInstanceOf(Odd),
    ).rejects.toThrow(/Odd/);
    await expect(
      assertExpect(Promise.resolve(1)).rejects.toThrow("x"),
    ).rejects.toThrow(/succeeded/);
  });
});
