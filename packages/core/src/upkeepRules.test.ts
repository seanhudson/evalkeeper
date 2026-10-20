import { describe, expect, it } from "vitest";
import { daysUntil, drifted, retiresSoon, thumbsAlert } from "./upkeepRules.js";

describe("weekly check rules", () => {
  it("flags a quick-set drop of 15 points or more", () => {
    expect(drifted(0.9, 0.75)).toBe(true);
    expect(drifted(0.9, 0.8)).toBe(false);
    expect(drifted(0.7, 0.9)).toBe(false);
  });

  it("warns 60 days before a retirement, and after", () => {
    const oct20 = new Date("2026-10-20T00:00:00Z");
    expect(daysUntil("2027-01", oct20)).toBe(73);
    expect(retiresSoon("2027-01", oct20)).toBe(false);
    expect(retiresSoon("2026-12-15", oct20)).toBe(true);
    expect(retiresSoon("2026-01", oct20)).toBe(true);
    expect(retiresSoon(undefined, oct20)).toBe(false);
  });

  it("needs enough ratings before a thumbs-down rate counts", () => {
    expect(thumbsAlert(2, 2)).toBe(false);
    expect(thumbsAlert(8, 2)).toBe(true);
    expect(thumbsAlert(9, 1)).toBe(false);
  });
});
