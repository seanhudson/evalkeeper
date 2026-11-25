import { describe, expect, it } from "vitest";
import {
  NO_SUITE_SETTINGS,
  readSuiteSettings,
  suiteSettingsFromForm,
} from "./suiteSettings.js";
import { draftsToTarget, targetCasesOf, tooFewBelow } from "./summary.js";

const form = (entries: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
};

describe("readSuiteSettings", () => {
  it("reads a saved target", () => {
    expect(readSuiteSettings({ targetCases: 10 })).toEqual({ targetCases: 10 });
  });
  it("drops what doesn't fit, so a bad row can't break a page", () => {
    expect(readSuiteSettings(null)).toEqual(NO_SUITE_SETTINGS);
    expect(readSuiteSettings("10")).toEqual(NO_SUITE_SETTINGS);
    expect(readSuiteSettings({})).toEqual(NO_SUITE_SETTINGS);
    expect(readSuiteSettings({ targetCases: 2 })).toEqual(NO_SUITE_SETTINGS);
    expect(readSuiteSettings({ targetCases: 10.5 })).toEqual(NO_SUITE_SETTINGS);
    expect(readSuiteSettings({ targetCases: "ten" })).toEqual(
      NO_SUITE_SETTINGS,
    );
  });
});

describe("suiteSettingsFromForm", () => {
  it("reads a whole number of cases", () => {
    expect(suiteSettingsFromForm(form({ targetCases: " 12 " }))).toEqual({
      targetCases: 12,
    });
  });
  it("reads empty as the suite's own", () => {
    expect(suiteSettingsFromForm(form({ targetCases: "" }))).toEqual({
      targetCases: null,
    });
    expect(suiteSettingsFromForm(form({}))).toEqual({ targetCases: null });
  });
  it("rejects what isn't a whole number in range", () => {
    for (const bad of ["4", "501", "10.5", "ten"])
      expect(() => suiteSettingsFromForm(form({ targetCases: bad }))).toThrow(
        /whole number of cases from 5 to 500/,
      );
  });
});

describe("targetCasesOf", () => {
  it("takes the saved target, then the suite's, then 50", () => {
    expect(targetCasesOf({ targetCases: 10 }, { targetCases: 8 })).toBe(8);
    expect(targetCasesOf({ targetCases: 10 }, { targetCases: null })).toBe(10);
    expect(targetCasesOf({ targetCases: 10 })).toBe(10);
    expect(targetCasesOf({}, null)).toBe(50);
  });
});

describe("a suite's own target", () => {
  it("is never too few at its target", () => {
    expect(tooFewBelow(10)).toBe(10);
    expect(tooFewBelow(50)).toBe(20);
    expect(tooFewBelow()).toBe(20);
  });
  it("drafts toward it, at least a small batch", () => {
    expect(draftsToTarget(4, 10)).toBe(10);
    expect(draftsToTarget(20, 40)).toBe(20);
    expect(draftsToTarget(10, 10)).toBe(10);
    expect(draftsToTarget(0, 8)).toBe(8);
  });
});
