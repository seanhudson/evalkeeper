import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  asText,
  barStatus,
  checkBar,
  fieldValue,
  formText,
  inputFromJson,
  labelFromJson,
  linesOf,
} from "./types.js";

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

describe("form text", () => {
  it("reads strings, and treats missing values and files as empty", () => {
    const form = new FormData();
    form.set("a", "  hi ");
    form.set("f", new Blob(["x"]), "x.txt");
    expect(formText(form, "a")).toBe("hi");
    expect(formText(form, "f")).toBe("");
    expect(formText(form, "missing")).toBe("");
  });

  it("shows any value as text", () => {
    expect(asText(null)).toBe("");
    expect(asText(3)).toBe("3");
    expect(asText(true)).toBe("true");
    expect(asText({ a: 1 })).toBe('{"a":1}');
  });
});

describe("JSON form readers", () => {
  const schema = z.object({
    name: z.string(),
    facts: z.array(z.object({ text: z.string() })),
  });
  const formWith = (field: string, value: string) => {
    const form = new FormData();
    form.set(field, value);
    return form;
  };

  it("reads and checks the input field", () => {
    const read = inputFromJson(schema);
    expect(
      read(formWith("input", ' {"name":"Ada","facts":[{"text":"x"}]} ')),
    ).toEqual({ name: "Ada", facts: [{ text: "x" }] });
  });

  it("says when the field is missing or empty", () => {
    expect(() => inputFromJson(schema)(new FormData())).toThrow(
      'Input is empty: fill in the "input" field',
    );
    expect(() => labelFromJson(schema)(formWith("label", "  "))).toThrow(
      'Answer is empty: fill in the "label" field',
    );
  });

  it("says when the text isn't JSON", () => {
    expect(() => inputFromJson(schema)(formWith("input", "{name:"))).toThrow(
      /^Input isn't valid JSON: /,
    );
  });

  it("names the first part that doesn't fit, in plain words", () => {
    expect(() =>
      inputFromJson(schema)(
        formWith("input", '{"name":"Ada","facts":[{"text":"x"},{"text":3}]}'),
      ),
    ).toThrow(/^Input doesn't fit at facts, item 2, text: /);
    // A value of the wrong kind at the top has no path.
    expect(() => labelFromJson(schema)(formWith("label", "[]"))).toThrow(
      /^Answer doesn't fit: /,
    );
  });

  it("reads another field when told to", () => {
    const read = labelFromJson(z.object({ ok: z.boolean() }), "answer");
    expect(read(formWith("answer", '{"ok":true}'))).toEqual({ ok: true });
  });
});
