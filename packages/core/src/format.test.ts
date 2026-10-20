import { describe, expect, it } from "vitest";
import { money, perAnswer, seconds } from "./format.js";

describe("format", () => {
  it("shows a test's spend in dollars, rounding small amounts", () => {
    expect(money(0)).toBe("$0");
    expect(money(0.004)).toBe("under 1¢");
    expect(money(1.234)).toBe("$1.23");
    expect(money(42.5)).toBe("$43");
  });

  it("shows one answer's cost in cents, so cheap models still differ", () => {
    expect(perAnswer(null)).toBe("–");
    expect(perAnswer(0.0001)).toBe("0.010¢");
    expect(perAnswer(0.0021)).toBe("0.21¢");
    expect(perAnswer(0.25)).toBe("25¢");
    expect(perAnswer(1.5)).toBe("$1.50");
  });

  it("shows seconds per answer", () => {
    expect(seconds(null)).toBe("–");
    expect(seconds(1234)).toBe("1.2s");
  });
});
