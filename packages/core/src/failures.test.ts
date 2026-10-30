import { describe, expect, it } from "vitest";
import { failureHints, failureKind } from "./failures.js";

describe("failureKind", () => {
  it("names timeouts, answers cut short, and empty accounts", () => {
    expect(failureKind("No answer within 60s")).toBe("timeout");
    expect(failureKind("No output generated.")).toBe("cutShort");
    expect(
      failureKind("No object generated: could not parse the response."),
    ).toBe("cutShort");
    expect(
      failureKind(
        "Failed after 3 attempts. Last error: You have no credits remaining.",
      ),
    ).toBe("credits");
  });
  it("leaves other errors alone", () => {
    expect(failureKind("Rate limited")).toBeNull();
    expect(failureKind(null)).toBeNull();
  });
});

describe("failureHints", () => {
  it("gives one hint per kind, the most common first", () => {
    const hints = failureHints([
      "No answer within 60s",
      "No output generated.",
      "No object generated: could not parse the response.",
      "Rate limited",
      null,
    ]);
    expect(hints).toHaveLength(2);
    expect(hints[0]).toMatch(/output limit/);
    expect(hints[1]).toMatch(/reasoning setting answers sooner/);
  });
  it("is empty when nothing has a hint", () => {
    expect(failureHints(["Rate limited", null])).toEqual([]);
  });
});
