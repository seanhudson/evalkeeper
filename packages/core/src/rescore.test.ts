import { describe, expect, it } from "vitest";
import { centsText, rescoreMessage } from "./rescore.js";

describe("rescore wording", () => {
  it("says small amounts in cents", () => {
    expect(centsText(0.001)).toBe("under a cent");
    expect(centsText(0.009)).toBe("1 cent");
    expect(centsText(0.034)).toBe("3 cents");
    expect(centsText(1.2)).toBe("$1.20");
  });

  it("says a rescore without the judge is free", () => {
    expect(
      rescoreMessage({
        rescored: 1,
        total: 1,
        left: 0,
        judgeCostUsd: 0,
        judged: false,
      }),
    ).toEqual({
      type: "success",
      text: "Rescored 1 test. Free: no model calls.",
    });
  });

  it("says what the judge cost, or that it cost nothing", () => {
    const base = { rescored: 12, total: 12, left: 0, judged: true };
    expect(rescoreMessage({ ...base, judgeCostUsd: 0.04 }).text).toBe(
      "Rescored 12 tests. The judge compared new wording for 4 cents.",
    );
    expect(rescoreMessage({ ...base, judgeCostUsd: 0 }).text).toBe(
      "Rescored 12 tests. Free: the judge had already compared all the wording.",
    );
  });

  it("says how far it got when it stops part way", () => {
    const m = rescoreMessage({
      rescored: 7,
      total: 20,
      left: 13,
      judgeCostUsd: 0.02,
      judged: true,
    });
    expect(m.type).toBe("error");
    expect(m.text).toMatch(
      /^Rescored 7 of 20 tests before running out of time/,
    );
    expect(m.text).toMatch(
      /pick up where it left off\. The judge .* 2 cents\.$/,
    );
    expect(
      rescoreMessage({
        rescored: 0,
        total: 0,
        left: 0,
        judgeCostUsd: 0,
        judged: false,
        failed: true,
      }).text,
    ).toMatch(/^Rescoring ran out of time\. What's done is kept/);
  });

  it("says when there's nothing to rescore", () => {
    expect(
      rescoreMessage({
        rescored: 0,
        total: 0,
        left: 0,
        judgeCostUsd: 0,
        judged: false,
      }).text,
    ).toBe("No finished tests to rescore yet.");
  });
});
