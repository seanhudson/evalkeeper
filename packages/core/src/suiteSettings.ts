import { z } from "zod";
import { TARGET_CASES } from "./summary.js";
import { SEVERITY_LABEL, SEVERITY_ORDER, type CheckDef } from "./types.js";

/**
 * Settings a person adjusts on a suite's page (its title menu, Suite
 * settings), kept apart from the versioned model settings: changing how
 * many cases a suite aims for shouldn't make a new model version. Each is
 * optional; a missing one means the suite's own value in code.
 */
export type SuiteSettings = {
  /**
   * How many cases the answer key aims for, replacing the suite's
   * `targetCases` (and 50). Null: the suite's own.
   */
  targetCases: number | null;
  /**
   * Per check, by key: a level and an aim (a share, 0 to 1) a person set
   * in place of the check's own. A check left out keeps its own.
   */
  checks: Readonly<Record<string, CheckOverride>>;
};

/** A person's level or aim for one check; either may be left to the check's own. */
export type CheckOverride = {
  severity?: CheckDef["severity"] | undefined;
  /** The pass rate it aims for, 0 to 1. */
  aim?: number | undefined;
};

/** No saved settings: every value comes from the suite in code. */
export const NO_SUITE_SETTINGS: SuiteSettings = {
  targetCases: null,
  checks: {},
};

/** The fewest and most cases a person can set as a suite's target. */
export const TARGET_CASES_RANGE = { min: 5, max: 500 } as const;

const override = z.object({
  severity: z
    .enum(["serious", "moderate", "minor"])
    .optional()
    .catch(undefined),
  aim: z.number().gt(0).max(1).optional().catch(undefined),
});

const schema = z.object({
  targetCases: z
    .number()
    .int()
    .min(TARGET_CASES_RANGE.min)
    .max(TARGET_CASES_RANGE.max)
    .nullable()
    .catch(null),
  checks: z.record(z.string(), override.catch({})).catch({}),
});

/**
 * Saved suite settings read back from storage (a JSON column), with
 * anything that doesn't fit dropped, so a bad row can't break a page.
 *
 * @param value - What the store read; anything.
 */
export function readSuiteSettings(value: unknown): SuiteSettings {
  if (typeof value !== "object" || value === null) return NO_SUITE_SETTINGS;
  const targetCases: unknown = Reflect.get(value, "targetCases");
  const checks: unknown = Reflect.get(value, "checks");
  const parsed = schema.safeParse({
    targetCases: targetCases ?? null,
    checks: checks ?? {},
  });
  if (!parsed.success) return NO_SUITE_SETTINGS;
  // Only what was set: an override with neither part is no override.
  const kept = Object.entries(parsed.data.checks).flatMap(([key, o]) => {
    const one: CheckOverride = {
      ...(o.severity ? { severity: o.severity } : {}),
      ...(o.aim !== undefined ? { aim: o.aim } : {}),
    };
    return Object.keys(one).length ? [[key, one] as const] : [];
  });
  return {
    targetCases: parsed.data.targetCases,
    checks: Object.fromEntries(kept),
  };
}

/**
 * Reads the Suite settings form: `targetCases` as a whole number in
 * TARGET_CASES_RANGE, and for each of the suite's checks `level:<key>`
 * (serious, moderate, or minor; its own level, or empty, saves no
 * override) and `aim:<key>` (a whole percent, 1 to 100; empty for its
 * own). Throws a sentence a person can act
 * on when one doesn't fit.
 *
 * @param form - The submitted form.
 * @param checks - The suite's checks in code, for their keys and names.
 */
export function suiteSettingsFromForm(
  form: FormData,
  checks: readonly CheckDef[] = [],
): SuiteSettings {
  const text = (name: string) => {
    const raw = form.get(name);
    return typeof raw === "string" ? raw.trim() : "";
  };
  const typed = text("targetCases");
  let targetCases: number | null = null;
  if (typed) {
    const n = Number(typed);
    const { min, max } = TARGET_CASES_RANGE;
    if (!Number.isInteger(n) || n < min || n > max)
      throw new Error(
        `Enter a whole number of cases from ${min} to ${max}, or leave it empty for the suite's own (${TARGET_CASES} unless it sets one).`,
      );
    targetCases = n;
  }
  const out: Record<string, CheckOverride> = {};
  for (const c of checks) {
    const level = text(`level:${c.key}`);
    const aimText = text(`aim:${c.key}`).replace(/%$/, "").trim();
    const one: CheckOverride = {};
    // The check's own level isn't an override: it follows the code.
    if (level && level !== c.severity) {
      if (!SEVERITY_ORDER.includes(level as CheckDef["severity"]))
        throw new Error(
          `Pick a level for ${c.label}: ${SEVERITY_ORDER.map((l) => SEVERITY_LABEL[l]).join(", ")}.`,
        );
      // Trust boundary: checked against the levels just above.
      one.severity = level as CheckDef["severity"];
    }
    if (aimText) {
      const pct = Number(aimText);
      if (!Number.isInteger(pct) || pct < 1 || pct > 100)
        throw new Error(
          `Enter ${c.label}'s aim as a whole percent from 1 to 100, or leave it empty for its own.`,
        );
      one.aim = pct / 100;
    }
    if (Object.keys(one).length) out[c.key] = one;
  }
  return { targetCases, checks: out };
}

/**
 * A suite's checks with a person's levels and aims in place of their own,
 * where they set one. The pages, the suggestion, and grading all read
 * these, so a change in Suite settings shows everywhere.
 *
 * @param checks - The suite's checks in code.
 * @param saved - The suite's saved settings.
 */
export function effectiveChecks(
  checks: readonly CheckDef[],
  saved: Pick<SuiteSettings, "checks"> | null | undefined,
): CheckDef[] {
  return checks.map((c) => {
    const o = saved?.checks[c.key];
    if (!o) return c;
    const severity = o.severity ?? c.severity;
    // A new level without an aim of its own takes the level's aim, unless
    // the check set one in code.
    return {
      ...c,
      severity,
      ...(o.aim !== undefined
        ? { bar: o.aim }
        : c.bar !== undefined
          ? { bar: c.bar }
          : {}),
    };
  });
}

/**
 * Each check's level, by key, as a test records the levels it was graded
 * with (`RunMetrics.levels`).
 *
 * @param checks - The checks in force.
 */
export function levelsOf(
  checks: readonly CheckDef[],
): Record<string, CheckDef["severity"]> {
  return Object.fromEntries(checks.map((c) => [c.key, c.severity]));
}

/**
 * Where suite settings are kept: one row per suite. `memoryStore` keeps
 * them in memory; `prismaSuiteSettingsStore` in the EvalSuiteSetting
 * table. Give one to the runner as `suiteSettings`.
 */
export type SuiteSettingsStore = {
  /** A suite's saved settings; NO_SUITE_SETTINGS when none were saved. */
  getSuiteSettings(suite: string): Promise<SuiteSettings>;
  /** Replaces a suite's saved settings, recording who saved them. */
  saveSuiteSettings(
    suite: string,
    settings: SuiteSettings,
    by: string | null,
  ): Promise<void>;
};
