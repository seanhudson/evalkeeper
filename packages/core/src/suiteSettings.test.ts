import { describe, expect, it } from "vitest";
import {
  NO_SUITE_SETTINGS,
  effectiveChecks,
  levelsOf,
  readSuiteSettings,
  suiteSettingsFromForm,
} from "./suiteSettings.js";
import { allPassed } from "./stats.js";
import { checkBar, type CheckDef } from "./types.js";
import { draftsToTarget, targetCasesOf, tooFewBelow } from "./summary.js";

const form = (entries: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
};

describe("readSuiteSettings", () => {
  it("reads a saved target", () => {
    expect(readSuiteSettings({ targetCases: 10 })).toEqual({
      targetCases: 10,
      checks: {},
    });
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
      checks: {},
    });
  });
  it("reads empty as the suite's own", () => {
    expect(suiteSettingsFromForm(form({ targetCases: "" }))).toEqual({
      targetCases: null,
      checks: {},
    });
    expect(suiteSettingsFromForm(form({}))).toEqual({
      targetCases: null,
      checks: {},
    });
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

const checks: CheckDef[] = [
  {
    key: "fact",
    label: "Right facts",
    description: "",
    kind: "label",
    severity: "serious",
  },
  {
    key: "category",
    label: "Category",
    description: "",
    kind: "label",
    severity: "serious",
  },
  {
    key: "tone",
    label: "Tone",
    description: "",
    kind: "code",
    severity: "minor",
    bar: 0.7,
  },
];

describe("a check's level and aim, set per suite", () => {
  it("reads saved levels and aims, dropping what doesn't fit", () => {
    expect(
      readSuiteSettings({
        targetCases: null,
        checks: {
          category: { severity: "minor" },
          tone: { severity: "moderate", aim: 0.8 },
          bad: { severity: "huge", aim: 2 },
          empty: {},
        },
      }),
    ).toEqual({
      targetCases: null,
      checks: {
        category: { severity: "minor" },
        tone: { severity: "moderate", aim: 0.8 },
      },
    });
    expect(readSuiteSettings({ checks: "lots" })).toEqual(NO_SUITE_SETTINGS);
  });

  it("reads the form: a level and an aim per check, empty for its own", () => {
    expect(
      suiteSettingsFromForm(
        form({
          "level:category": "minor",
          "aim:tone": "80%",
          "level:fact": "serious",
          "aim:fact": "",
        }),
        checks,
      ),
    ).toEqual({
      targetCases: null,
      checks: { category: { severity: "minor" }, tone: { aim: 0.8 } },
      // Each level field sent counts as reviewed, changed or not.
      levelsReviewed: ["fact", "category"],
    });
    expect(() =>
      suiteSettingsFromForm(form({ "level:fact": "huge" }), checks),
    ).toThrow(
      /Pick a level for Right facts: Must pass, Should pass, Nice to have/,
    );
    for (const bad of ["0", "101", "85.5", "most"])
      expect(() =>
        suiteSettingsFromForm(form({ "aim:tone": bad }), checks),
      ).toThrow(/Tone's aim as a whole percent from 1 to 100/);
  });

  it("keeps which checks' levels were reviewed, even unchanged", () => {
    const kept = suiteSettingsFromForm(
      form({
        "level:fact": "serious",
        "level:category": "",
        "level:tone": "minor",
      }),
      checks,
    );
    expect(kept).toEqual({
      targetCases: null,
      checks: {},
      levelsReviewed: ["fact", "category", "tone"],
    });
    // Saved and read back; a form without level fields marks none.
    expect(readSuiteSettings(JSON.parse(JSON.stringify(kept)))).toEqual(kept);
    expect(suiteSettingsFromForm(form({ targetCases: "60" }), checks)).toEqual({
      targetCases: 60,
      checks: {},
    });
    expect(readSuiteSettings({ checks: {}, levelsReviewed: "all" })).toEqual({
      targetCases: null,
      checks: {},
    });
  });

  it("reads back the models removed from a suite, and drops bad ones", () => {
    expect(
      readSuiteSettings({ checks: {}, removedModels: ["old-model"] }),
    ).toEqual({ targetCases: null, checks: {}, removedModels: ["old-model"] });
    // None removed, or not a list: no field at all.
    for (const removedModels of [[], "old-model", [1]])
      expect(readSuiteSettings({ checks: {}, removedModels })).toEqual({
        targetCases: null,
        checks: {},
      });
  });

  it("puts a person's level and aim in place of the check's own", () => {
    const [fact, category, tone] = effectiveChecks(checks, {
      checks: {
        category: { severity: "minor" },
        tone: { severity: "moderate", aim: 0.8 },
      },
    });
    expect(fact).toBe(checks[0]);
    // A new level takes that level's aim, unless the check set its own.
    expect(category?.severity).toBe("minor");
    expect(category && checkBar(category)).toBe(0.75);
    expect(tone).toMatchObject({ severity: "moderate", bar: 0.8 });
    const [, , kept] = effectiveChecks(checks, {
      checks: { tone: { severity: "moderate" } },
    });
    expect(kept && checkBar(kept)).toBe(0.7);
    expect(effectiveChecks(checks, null)).toEqual(checks);
    expect(levelsOf(checks)).toEqual({
      fact: "serious",
      category: "serious",
      tone: "minor",
    });
  });

  it("aims at 85% for should pass, by default", () => {
    expect(checkBar({ ...checks[0], severity: "moderate" } as CheckDef)).toBe(
      0.85,
    );
  });
});

describe("allPassed", () => {
  it("never fails an answer on a nice-to-have miss", () => {
    expect(
      allPassed([
        { key: "fact", pass: true, level: "serious" },
        { key: "tone", pass: false, level: "minor" },
      ]),
    ).toBe(true);
    expect(
      allPassed([
        { key: "fact", pass: true, level: "serious" },
        { key: "category", pass: false, level: "moderate" },
      ]),
    ).toBe(false);
    // Graded before levels were kept: every check counts.
    expect(allPassed([{ key: "tone", pass: false }])).toBe(false);
    expect(allPassed(null)).toBe(false);
  });
});

describe("how careful with attacks", () => {
  it("reads a saved setting, and drops one that doesn't fit", () => {
    expect(readSuiteSettings({ attacks: "balanced" })).toEqual({
      targetCases: null,
      checks: {},
      attacks: "balanced",
    });
    expect(readSuiteSettings({ attacks: "loose" })).toEqual(NO_SUITE_SETTINGS);
  });

  it("reads the form: another setting saves, the suite's own doesn't", () => {
    expect(suiteSettingsFromForm(form({ attacks: "off" }))).toEqual({
      targetCases: null,
      checks: {},
      attacks: "off",
    });
    expect(suiteSettingsFromForm(form({ attacks: "strict" }))).toEqual(
      NO_SUITE_SETTINGS,
    );
    expect(
      suiteSettingsFromForm(form({ attacks: "strict" }), [], "balanced"),
    ).toMatchObject({ attacks: "strict" });
    expect(() => suiteSettingsFromForm(form({ attacks: "loose" }))).toThrow(
      /Strict, Balanced, Off/,
    );
  });
});
