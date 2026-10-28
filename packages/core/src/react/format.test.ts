import { describe, expect, it } from "vitest";
import { dayOf, momentOf, pct } from "./format.js";

describe("what the screens print", () => {
  it("writes dates with the month as a word, so no reader misreads them", () => {
    const d = new Date(2026, 9, 28, 15, 4);
    expect(dayOf(d)).toBe("Oct 28, 2026");
    expect(momentOf(d)).toMatch(/^Oct 28, 2026, 3:04\sPM$/);
  });

  it("writes shares as whole percents", () => {
    expect(pct(0.874)).toBe("87%");
  });
});
