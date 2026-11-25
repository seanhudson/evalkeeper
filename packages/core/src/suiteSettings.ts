import { z } from "zod";
import { TARGET_CASES } from "./summary.js";

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
};

/** No saved settings: every value comes from the suite in code. */
export const NO_SUITE_SETTINGS: SuiteSettings = { targetCases: null };

/** The fewest and most cases a person can set as a suite's target. */
export const TARGET_CASES_RANGE = { min: 5, max: 500 } as const;

const schema = z.object({
  targetCases: z
    .number()
    .int()
    .min(TARGET_CASES_RANGE.min)
    .max(TARGET_CASES_RANGE.max)
    .nullable()
    .catch(null),
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
  const parsed = schema.safeParse({ targetCases: targetCases ?? null });
  return parsed.success ? parsed.data : NO_SUITE_SETTINGS;
}

/**
 * Reads the Suite settings form: `targetCases` as a whole number in
 * TARGET_CASES_RANGE, or empty for the suite's own. Throws a sentence a
 * person can act on when it doesn't fit.
 *
 * @param form - The submitted form.
 */
export function suiteSettingsFromForm(form: FormData): SuiteSettings {
  const raw = form.get("targetCases");
  const typed = typeof raw === "string" ? raw.trim() : "";
  if (!typed) return { targetCases: null };
  const n = Number(typed);
  const { min, max } = TARGET_CASES_RANGE;
  if (!Number.isInteger(n) || n < min || n > max)
    throw new Error(
      `Enter a whole number of cases from ${min} to ${max}, or leave it empty for the suite's own (${TARGET_CASES} unless it sets one).`,
    );
  return { targetCases: n };
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
