import { describe, expect, it } from "vitest";
import { at, mustGet } from "./util";

describe("util", () => {
  it("reads checked indexes and keys, and fails loudly otherwise", () => {
    expect(at(["a", "b"], 1)).toBe("b");
    expect(() => at(["a"], 1)).toThrow(RangeError);
    expect(() => at(["a"], -1)).toThrow(RangeError);
    expect(mustGet(new Map([["k", 1]]), "k")).toBe(1);
    expect(() => mustGet(new Map<string, number>(), "k")).toThrow("Missing k");
  });
});
