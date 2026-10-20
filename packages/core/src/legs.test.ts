import { describe, expect, it } from "vitest";
import { MAX_LEGS, isStuck, shouldContinue } from "./legs.js";

describe("shouldContinue", () => {
  const base = { left: 10, done: 20, leg: 1, outOfCredits: false };
  it("hands off when answers are left and the leg made progress", () => {
    expect(shouldContinue(base)).toBe(true);
  });
  it("stops when nothing is left, nothing was done, or credits ran out", () => {
    expect(shouldContinue({ ...base, left: 0 })).toBe(false);
    expect(shouldContinue({ ...base, done: 0 })).toBe(false);
    expect(shouldContinue({ ...base, outOfCredits: true })).toBe(false);
  });
  it("stops at the last leg", () => {
    expect(shouldContinue({ ...base, leg: MAX_LEGS })).toBe(false);
  });
});

describe("isStuck", () => {
  const min = 60_000;
  const now = Date.UTC(2026, 9, 20, 12);
  it("is stuck when nothing happened recently", () => {
    expect(isStuck(new Date(now - 10 * min), null, now, 6 * min)).toBe(true);
  });
  it("a recent answer keeps a long test alive", () => {
    expect(
      isStuck(new Date(now - 20 * min), new Date(now - min), now, 6 * min),
    ).toBe(false);
  });
});
