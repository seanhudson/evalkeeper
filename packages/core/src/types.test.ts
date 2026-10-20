import { describe, expect, it } from "vitest";
import { barStatus, checkBar } from "./types";

describe("check bars", () => {
  it("defaults by severity and sorts rates against the bar", () => {
    expect(
      checkBar({
        key: "a",
        label: "",
        description: "",
        kind: "code",
        severity: "serious",
      }),
    ).toBe(0.95);
    expect(
      checkBar({
        key: "b",
        label: "",
        description: "",
        kind: "label",
        severity: "minor",
      }),
    ).toBe(0.75);
    expect(
      checkBar({
        key: "c",
        label: "",
        description: "",
        kind: "code",
        severity: "serious",
        bar: 1,
      }),
    ).toBe(1);
    expect(barStatus(0.96, 0.95)).toBe("meets");
    expect(barStatus(0.86, 0.95)).toBe("close");
    expect(barStatus(0.78, 0.95)).toBe("below");
  });
});
