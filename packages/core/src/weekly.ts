import { ACTIVITY_SOURCE } from "./activity.js";
import type { ThumbsSummary } from "./feedback.js";
import { retiresLabel, type ModelCatalog } from "./models.js";
import type { CaseRecord, RunMetrics, RunRecord } from "./store.js";
import { daysUntil, drifted, retiresSoon } from "./upkeepRules.js";

/**
 * The weekly check: each suite's quick set on its live model, with fresh
 * answers, so a provider quietly changing a model under the same name shows
 * up as drift. The summary also flags models retiring soon and features
 * people rate poorly, and counts the cases suites drafted from the app's
 * activity. It only reports; a person decides what to change.
 * Pure.
 */

/** `startedBy` on tests the weekly check starts, so they're told apart. */
export const SCHEDULED = "schedule";

const DAY = 86_400_000;

/**
 * What the last weekly check found: drift, unfinished checks, retiring models, and
 * thumbs-down, plus when it ran, what it cost, and the cases drafted from
 * activity.
 */
export type WeeklySummary = {
  /** When the last weekly check started; null before the first. */
  lastAt: Date | null;
  /** What last week's quick sets cost (reused answers are free). */
  costUsd: number;
  /** Quick sets still running. */
  running: number;
  drift: {
    suite: string;
    label: string;
    model: string;
    previous: number;
    latest: number;
  }[];
  /** Quick sets that didn't finish, and why. */
  failed: { suite: string; label: string; error: string }[];
  /** Live and fallback models retiring within the warning window. */
  retiring: {
    suite: string;
    label: string;
    model: string;
    role: "live" | "fallback";
    when: string;
    days: number;
  }[];
  /** Features with a high thumbs-down share this week. */
  thumbs: ThumbsSummary[];
  /**
   * Cases each suite drafted from the app's activity in the last 7 days,
   * and how many of them still wait for a person (no confirmed answer, not
   * retired). Drafts are news, not trouble: they don't affect `clear`.
   */
  drafted: { suite: string; label: string; count: number; waiting: number }[];
  /** Ran, and nothing needs a look. */
  clear: boolean;
};

/** A test's headline score: parts right where it gives partial credit. */
export function headline(m: RunMetrics | null): number | null {
  if (!m) return null;
  return m.units && m.units.total
    ? m.units.right / m.units.total
    : (m.allPass.rate ?? 0);
}

/**
 * What the last weekly check found, from every suite's tests.
 *
 * @example
 * ```ts
 * const runs = (await Promise.all(SUITES.map((s) => store.listRuns(s.key, { limit: 50 })))).flat();
 * const weekly = weeklySummary({ runs, suites: SUITES, routes, models: MODELS, thumbs });
 * if (!weekly.clear) console.log(weekly.drift, weekly.retiring);
 * ```
 */
export function weeklySummary(args: {
  /** Every suite's tests, newest first or not. */
  runs: RunRecord[];
  suites: { key: string; label: string; operation: string }[];
  /** Each operation's live and fallback model. */
  routes: Record<string, { model: string; fallbackModel: string | null }>;
  models: ModelCatalog;
  /** From thumbsSummary over the last week; only flagged ones are shown. */
  thumbs?: ThumbsSummary[];
  /**
   * Every suite's cases (`store.listCases`), to count the drafts from
   * activity. Leave out to skip the count.
   */
  cases?: CaseRecord[];
  today?: Date;
}): WeeklySummary {
  const today = args.today ?? new Date();
  const label = (key: string) =>
    args.suites.find((s) => s.key === key)?.label ?? key;
  const scheduled = args.runs
    .filter((r) => r.startedBy === SCHEDULED && r.set === "SMOKE")
    .sort((a, b) => +b.startedAt - +a.startedAt);
  const lastAt = scheduled[0]?.startedAt ?? null;
  // The last weekly batch: everything started within a day of the newest.
  const batch = lastAt
    ? scheduled.filter((r) => +lastAt - +r.startedAt < DAY)
    : [];

  const drift: WeeklySummary["drift"] = [];
  const failed: WeeklySummary["failed"] = [];
  for (const r of batch) {
    if (r.status === "FAILED") {
      failed.push({
        suite: r.suite,
        label: label(r.suite),
        error: r.error ?? "unknown error",
      });
      continue;
    }
    if (r.status !== "SUCCEEDED") continue;
    // The last check of the same model, temperature, output cap,
    // instructions, and grading, a day or more earlier: anything else changed for a known
    // reason.
    const prior = scheduled.find(
      (p) =>
        p.suite === r.suite &&
        p.status === "SUCCEEDED" &&
        p.model === r.model &&
        (p.temperature ?? null) === (r.temperature ?? null) &&
        (p.maxOutputTokens ?? null) === (r.maxOutputTokens ?? null) &&
        p.promptVersion === r.promptVersion &&
        p.graderVersion === r.graderVersion &&
        +r.startedAt - +p.startedAt >= DAY,
    );
    const latest = headline(r.metrics);
    const previous = headline(prior?.metrics ?? null);
    if (latest !== null && previous !== null && drifted(previous, latest))
      drift.push({
        suite: r.suite,
        label: label(r.suite),
        model: args.models[r.model]?.label ?? r.model,
        previous,
        latest,
      });
  }

  const retiring: WeeklySummary["retiring"] = [];
  for (const s of args.suites) {
    const route = args.routes[s.operation];
    if (!route) continue;
    for (const [model, role] of [
      [route.model, "live"],
      [route.fallbackModel, "fallback"],
    ] as const) {
      const when = model ? args.models[model]?.retiring : undefined;
      if (model && when && retiresSoon(when, today))
        retiring.push({
          suite: s.key,
          label: s.label,
          model: args.models[model]?.label ?? model,
          role,
          when: retiresLabel(args.models, model) ?? when,
          days: daysUntil(when, today),
        });
    }
  }

  const thumbs = (args.thumbs ?? []).filter((t) => t.alert);

  const drafted: WeeklySummary["drafted"] = [];
  for (const s of args.suites) {
    const recent = (args.cases ?? []).filter(
      (c) =>
        c.suite === s.key &&
        c.source === ACTIVITY_SOURCE &&
        +today - +c.createdAt < 7 * DAY,
    );
    if (recent.length)
      drafted.push({
        suite: s.key,
        label: s.label,
        count: recent.length,
        waiting: recent.filter(
          (c) =>
            c.status !== "RETIRED" &&
            !c.labels.some((l) => l.status === "CONFIRMED"),
        ).length,
      });
  }
  return {
    lastAt,
    costUsd: batch.reduce((t, r) => t + (r.metrics?.costUsd ?? 0), 0),
    running: batch.filter((r) => r.status === "RUNNING").length,
    drift,
    failed,
    retiring,
    thumbs,
    drafted,
    clear:
      lastAt !== null &&
      !drift.length &&
      !failed.length &&
      !retiring.length &&
      !thumbs.length,
  };
}
