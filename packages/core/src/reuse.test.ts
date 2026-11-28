import { describe, expect, it } from "vitest";
import { RESUME_WITHIN_MS, resumeWithin, spanText } from "./reuse.js";

describe("resumeWithin", () => {
  it("takes the suite's own window, or a day", () => {
    expect(resumeWithin({})).toBe(RESUME_WITHIN_MS);
    expect(RESUME_WITHIN_MS).toBe(86_400_000);
    expect(resumeWithin({ resumeWithinMs: 0 })).toBe(0);
    expect(resumeWithin({ resumeWithinMs: 3_600_000 })).toBe(3_600_000);
  });
});

describe("spanText", () => {
  it("says hours and days in words", () => {
    expect(spanText(0)).toBe("an hour");
    expect(spanText(3_600_000)).toBe("an hour");
    expect(spanText(6 * 3_600_000)).toBe("6 hours");
    expect(spanText(86_400_000)).toBe("a day");
    expect(spanText(2 * 86_400_000)).toBe("2 days");
    expect(spanText(36 * 3_600_000)).toBe("36 hours");
  });
});
