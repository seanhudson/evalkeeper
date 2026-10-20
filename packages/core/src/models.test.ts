import { describe, expect, it } from "vitest";
import {
  effortFor,
  priceCall,
  retiresLabel,
  type ModelCatalog,
} from "./models.js";

const MODELS: ModelCatalog = {
  big: { label: "Big", provider: "acme", inputPer1M: 2, outputPer1M: 10 },
  old: { label: "Old", provider: "acme", retiring: "2027-01-15" },
  thinker: {
    label: "Thinker",
    provider: "acme",
    efforts: ["low", "medium", "high"],
  },
};

describe("models", () => {
  it("names a retirement by month and year, or null", () => {
    expect(retiresLabel(MODELS, "old")).toBe("January 2027");
    expect(retiresLabel(MODELS, "big")).toBeNull();
    expect(retiresLabel(MODELS, "unknown")).toBeNull();
  });

  it("prices a call from its tokens, or null without a price", () => {
    expect(
      priceCall(MODELS, "big", { input: 1_000_000, output: 100_000 }),
    ).toBe(3);
    expect(priceCall(MODELS, "old", { input: 1, output: 1 })).toBeNull();
  });

  it("gives a model the reasoning setting it accepts", () => {
    expect(effortFor(MODELS, "thinker", "high")).toBe("high");
    // "none" on a model without it: its lowest.
    expect(effortFor(MODELS, "thinker", "none")).toBe("low");
    // Models without settings get nothing sent.
    expect(effortFor(MODELS, "big", "high")).toBeUndefined();
    expect(effortFor(MODELS, "thinker", null)).toBeUndefined();
  });
});
