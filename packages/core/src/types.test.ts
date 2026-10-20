import { describe, expect, it } from "vitest";
import { barStatus, checkBar, fieldValue, linesOf } from "./types";

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

describe("form fields", () => {
  it("shows lists one per line and reads them back", () => {
    const f = {
      name: "items",
      label: "Items",
      help: "",
      kind: "lines" as const,
    };
    expect(fieldValue(f, { items: ["a", "b"] })).toBe("a\nb");
    const form = new FormData();
    form.set("items", " a \n\nb\n");
    expect(linesOf(form, "items")).toEqual(["a", "b"]);
    expect(fieldValue(f, null)).toBe("");
  });
});
