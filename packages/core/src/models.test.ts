import { describe, expect, it } from "vitest";
import {
  effortFor,
  priceCall,
  retiresLabel,
  type ModelCatalog,
} from "./models.js";

const MODELS: ModelCatalog = {
  big: { label: "Big", provider: "acme", inputPer1M: 2, outputPer1M: 10 },
  cached: {
    label: "Cached",
    provider: "acme",
    inputPer1M: 2,
    outputPer1M: 10,
    cachedInputPer1M: 0.2,
    cacheWriteInputPer1M: 2.5,
  },
  old: { label: "Old", provider: "acme", retiring: "2027-01-15" },
  thinker: {
    label: "Thinker",
    provider: "acme",
    efforts: ["low", "medium", "high"],
  },
  // Takes the newer settings, and rejects "none".
  astra: {
    label: "Astra",
    provider: "acme",
    efforts: ["minimal", "low", "medium", "high", "xhigh", "max"],
  },
  odd: { label: "Odd", provider: "acme", efforts: ["fast", "deep"] },
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

  it("prices cached and cache-write input at the cache prices", () => {
    // 1M input: 600k read from cache, 100k written, 300k plain.
    const tokens = {
      input: 1_000_000,
      output: 0,
      cachedInput: 600_000,
      cacheWriteInput: 100_000,
    };
    expect(priceCall(MODELS, "cached", tokens)).toBeCloseTo(
      0.3 * 2 + 0.6 * 0.2 + 0.1 * 2.5,
    );
    // Without cache prices, cached input costs the input price.
    expect(priceCall(MODELS, "big", tokens)).toBeCloseTo(2);
  });

  it("never counts more cached input than the call had", () => {
    expect(
      priceCall(MODELS, "cached", {
        input: 100,
        output: 0,
        cachedInput: 500,
        cacheWriteInput: 50,
      }),
    ).toBeCloseTo((100 * 0.2) / 1e6);
    expect(
      priceCall(MODELS, "cached", { input: 100, output: 0, cachedInput: -5 }),
    ).toBeCloseTo((100 * 2) / 1e6);
  });

  it("places settings a model lacks against the ones it has", () => {
    // The newer names are settings like any other.
    expect(effortFor(MODELS, "astra", "xhigh")).toBe("xhigh");
    expect(effortFor(MODELS, "astra", "max")).toBe("max");
    // Below its lowest: its lowest, so "none" never reaches a model that
    // rejects it.
    expect(effortFor(MODELS, "astra", "none")).toBe("minimal");
    expect(effortFor(MODELS, "thinker", "minimal")).toBe("low");
    // Above its highest: its highest.
    expect(effortFor(MODELS, "thinker", "xhigh")).toBe("high");
    // A name it doesn't place, or a model with names of its own: its default.
    expect(effortFor(MODELS, "thinker", "turbo")).toBeUndefined();
    expect(effortFor(MODELS, "odd", "deep")).toBe("deep");
    expect(effortFor(MODELS, "odd", "high")).toBeUndefined();
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
