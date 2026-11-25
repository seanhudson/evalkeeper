import type { BoardRow } from "./board.js";
import type { ModelCatalog } from "./models.js";
import { stableJson } from "./stableJson.js";
import { suggest, type AttackResults } from "./suggest.js";
import { tooFewBelow } from "./summary.js";
import {
  checkBar,
  pctBeside,
  type CheckDef,
  type SuitePriority,
} from "./types.js";

/**
 * A suite with at least this many checks, more than half of them must
 * pass, gets "Review check levels" on its to-do list.
 */
export const MANY_CHECKS = 4;

/**
 * A suite's to-do list: what to do next, in the order to do it, each with
 * why. The suite's page shows it at the top, where each item is done; the
 * hub shows only whether there is one (`suiteStatus`). Pure, from the same
 * board the page reads, so the two always agree.
 */

/** One thing to do on a suite, with what the page needs to act on it. */
export type Todo =
  | {
      kind: "testAll";
      /** Models with a current test now. */
      tested: number;
    }
  | {
      kind: "retest";
      /** Why, when it isn't a change since the last test (live's answers failed). */
      why?: string;
    }
  | {
      kind: "makeLive";
      /** The model to make live, or the fallback to set. */
      model: string;
      label: string;
      /** True: the fallback changes, live stays. */
      fallback: boolean;
      /** The suggestion's first reason, as the item's why. */
      why: string;
    }
  | {
      kind: "fixCheck";
      check: string;
      label: string;
      /** The live model's pass rate on it (or the best tested one's). */
      rate: number;
      /** The rate it should reach. */
      aim: number;
      /** Cases every tested model misses it on, when the page counted them. */
      missed: number | null;
      /** The live model's test, for the cases it misses. */
      runId: string | null;
    }
  | { kind: "confirm"; answers: number }
  | { kind: "addCases"; add: number; cases: number; target: number }
  | { kind: "makeAttacks"; suites: { key: string; label: string }[] }
  | { kind: "retireStarters"; cases: number }
  | { kind: "reviewSplit"; cases: number }
  | { kind: "reviewLevels"; mustPass: number; checks: number };

/** What a suite's to-do list is made from. */
export type TodoInput = {
  /** The suite's board rows (`runner.board`). */
  rows: readonly BoardRow[];
  checks: readonly CheckDef[];
  priority: SuitePriority;
  models?: ModelCatalog;
  /** The feature's injection suites (`attacksFrom`), for the suggestion. */
  attacks?: AttackResults[];
  /** Cases in use: confirmed or provisional answers, not retired. */
  cases: number;
  /** Of those, answers still provisional. */
  provisional: number;
  /** The suite's target number of cases (`targetCasesOf`). */
  target: number;
  /** Attack suites set up for this feature with no attack cases yet. */
  unmadeAttacks?: { key: string; label: string }[];
  /** Starter cases a starter update replaced (`replacedStarters`). */
  replacedStarters?: number;
  /**
   * The models Test every model tests (`runner.modelsFor`), at the live
   * setting. The retest to-do asks only about their rows, so pressing it
   * clears it; other rows keep their own Test buttons. Every row when
   * absent.
   */
  testAllModels?: readonly string[];
  /**
   * The checks whose levels a person saved (`SuiteSettings.levelsReviewed`).
   * Review check levels stays off while it covers every check; a new check
   * brings it back.
   */
  levelsReviewed?: readonly string[];
  /** Cases models split on (`answerKeyHealth(...).split`). */
  splitCases?: number;
  /**
   * Per must-pass check, cases every tested model misses it on. Only the
   * suite's page counts them (it reads the answers); the hub leaves it out.
   */
  missedByCheck?: Readonly<Record<string, number>>;
};

/** Rows with a current, complete-enough test to count as tested. */
function testedRows(rows: readonly BoardRow[]) {
  return rows.filter((r) => !r.baseline && r.test && !r.test.stale);
}

/**
 * A suite's to-do list, in the order to do it: test every model (or
 * retest), make a better model live, fix must-pass checks every model
 * misses, confirm provisional answers, add cases toward the target, make
 * attack cases, then retire replaced starters and review split cases.
 * Empty when there's nothing to do.
 *
 * @param input - The suite's board, checks, cases, and target.
 */
export function suiteTodos(input: TodoInput): Todo[] {
  const { rows, checks, cases, provisional, target } = input;
  const out: Todo[] = [];
  const testing = rows.some((r) => r.testing);
  const models = rows.filter((r) => !r.baseline && !r.variant);
  const tested = testedRows(rows);
  const retests = input.testAllModels;
  const stale = rows.some(
    (r) =>
      !r.baseline &&
      r.test?.stale &&
      (!retests || (!r.variant && retests.includes(r.model))),
  );

  // 1. Tests first: nothing else can be judged without them.
  if (!testing) {
    if (stale) out.push({ kind: "retest" });
    else if (tested.length < Math.min(2, models.length))
      out.push({ kind: "testAll", tested: tested.length });
  }

  // 2. A better model, by the same rules as the suggestion; not while a
  // test runs, when it would weigh half a board.
  const s =
    !testing && tested.length
      ? suggest(
          rows as BoardRow[],
          [...checks],
          input.priority,
          input.models ?? {},
          { attacks: input.attacks ?? [] },
        )
      : null;
  // Live's test has failed answers: test it again before comparing.
  if (s?.retestLive && !out.some((t) => t.kind === "retest"))
    out.push({ kind: "retest", why: s.reasons[0] ?? "" });
  if (s && !s.same && !s.retestLive) {
    const fallback = s.keepLive;
    const to = fallback ? s.fallback : s.live;
    if (to)
      out.push({
        kind: "makeLive",
        model: to.model,
        label: to.label,
        fallback,
        why: s.reasons[0] ?? "",
      });
  }

  // 3. Must-pass checks every tested model misses: the fix is in the
  // instructions or the answers, not the model.
  if (tested.length) {
    const live = tested.find((r) => r.live) ?? null;
    for (const c of checks) {
      if (c.severity !== "serious") continue;
      const aim = checkBar(c);
      const rates = tested.map((r) => r.test?.byCheck[c.key]?.rate ?? null);
      if (!rates.every((x) => x !== null && x < aim)) continue;
      const shown =
        live?.test?.byCheck[c.key]?.rate ??
        Math.max(...rates.filter((x): x is number => x !== null));
      out.push({
        kind: "fixCheck",
        check: c.key,
        label: c.label,
        rate: shown,
        aim,
        missed: input.missedByCheck?.[c.key] ?? null,
        runId: live?.test?.runId ?? null,
      });
    }
  }

  // 4–7. The answer key.
  if (provisional) out.push({ kind: "confirm", answers: provisional });
  if (cases < target)
    out.push({ kind: "addCases", add: target - cases, cases, target });
  if (input.unmadeAttacks?.length && cases > 0)
    out.push({ kind: "makeAttacks", suites: input.unmadeAttacks });
  if (input.replacedStarters)
    out.push({ kind: "retireStarters", cases: input.replacedStarters });
  if (input.splitCases)
    out.push({ kind: "reviewSplit", cases: input.splitCases });
  // 8. Too many must-pass checks: their misses stop telling models apart.
  // Once a person saved every check's level, that's their call.
  const mustPass = checks.filter((c) => c.severity === "serious").length;
  const reviewed = checks.every((c) => input.levelsReviewed?.includes(c.key));
  if (!reviewed && checks.length >= MANY_CHECKS && mustPass > checks.length / 2)
    out.push({ kind: "reviewLevels", mustPass, checks: checks.length });
  return out;
}

const n = (count: number, word: string, plural = `${word}s`) =>
  `${count} ${count === 1 ? word : plural}`;

/**
 * A to-do item in words: what to do, and why, as the suite's page shows
 * it ("Add 10 cases", "40 of 50, so scores firm up").
 *
 * @param t - The item.
 */
export function todoText(t: Todo): { what: string; why: string } {
  switch (t.kind) {
    case "testAll":
      return {
        what: "Test every model",
        why:
          t.tested === 0
            ? "none has been tested yet."
            : "only one has been tested, so there's nothing to compare it with.",
      };
    case "retest":
      return {
        what: "Test again",
        why:
          t.why ||
          "the instructions, answers, or cases changed since the last test.",
      };
    case "makeLive":
      return {
        what: t.fallback
          ? `Make ${t.label} the fallback`
          : `Make ${t.label} live`,
        // The suggestion's sentence as it is: it starts with a model's name.
        why: t.why,
      };
    case "fixCheck":
      return {
        what: `Fix "${t.label}"`,
        why: `passes ${pctBeside(t.rate, t.aim)} of the time (aim: ${Math.round(t.aim * 100)}%)${
          t.missed
            ? `; every model tested misses it on ${n(t.missed, "case")}`
            : "; every model tested misses it"
        }. The fix is in the instructions or the answers, not the model.`,
      };
    case "confirm":
      return {
        what: `Confirm ${n(t.answers, "answer")}`,
        why: `${t.answers === 1 ? "it's" : "they're"} provisional, so scores rest on answers nobody reviewed.`,
      };
    case "addCases":
      return {
        what: `Add ${n(t.add, "case")}`,
        why: `${t.cases} of ${t.target}, so a score could still be well off.`,
      };
    case "makeAttacks":
      return {
        what: "Make attack cases",
        why: "attacks are set up, but none are made, so nobody knows if a model follows text it can't trust.",
      };
    case "retireStarters":
      return {
        what: `Retire ${n(t.cases, "replaced starter")}`,
        why: `the suite's starter cases changed, and ${t.cases === 1 ? "this one is" : "these are"} no longer among them.`,
      };
    case "reviewSplit":
      return {
        what: `Review ${n(t.cases, "case")} models split on`,
        why: "often the answer is wrong or the case unclear, and either makes every score less trustworthy.",
      };
    case "reviewLevels":
      return {
        what: "Review check levels",
        why: `${t.mustPass} of ${t.checks} checks must pass, so must-pass misses stop telling models apart. Keep must-pass for mistakes that change what your product does.`,
      };
  }
}

/** Where a suite stands on the hub, in one word. */
export type SuiteStatus = "attention" | "unknown" | "healthy";

/** The order the hub lists suites in: what needs you first. */
export const SUITE_STATUS_ORDER: readonly SuiteStatus[] = [
  "attention",
  "unknown",
  "healthy",
];

/** What each status is called on the hub and the suite's page. */
export const SUITE_STATUS_LABEL: Readonly<Record<SuiteStatus, string>> = {
  attention: "Needs attention",
  unknown: "Can't tell yet",
  healthy: "Healthy",
};

/**
 * Where a suite stands: Can't tell yet when no model has a current test or
 * there are too few cases to judge (against the suite's own target),
 * unless a must-pass check is already missed; otherwise Needs attention
 * when its to-do list has anything on it, and Healthy when it doesn't.
 *
 * @param input - What the to-do list is made from.
 * @param todos - The list, when already made (`suiteTodos(input)`).
 */
export function suiteStatus(
  input: TodoInput,
  todos: readonly Todo[] = suiteTodos(input),
): SuiteStatus {
  if (todos.some((t) => t.kind === "fixCheck")) return "attention";
  if (
    testedRows(input.rows).length === 0 ||
    input.cases < tooFewBelow(input.target)
  )
    return "unknown";
  return todos.length ? "attention" : "healthy";
}

/**
 * Starter cases a starter update replaced: added from the suite's
 * `starter` (`sourceRef` "starter:<suite>#<key>") and not retired, whose
 * input no longer matches any current starter. A case with no `sourceRef`
 * is never listed, even when it matches nothing: it may be hand-made.
 *
 * @param suite - The suite: its key and current `starter` cases.
 * @param cases - The suite's cases.
 */
export function replacedStarters<
  C extends { status: string; sourceRef: string | null; input: unknown },
>(
  suite: { key: string; starter?: readonly { input: unknown }[] | undefined },
  cases: readonly C[],
): C[] {
  const prefix = `starter:${suite.key}#`;
  const current = new Set(
    (suite.starter ?? []).map((s) => stableJson(s.input)),
  );
  return cases.filter(
    (c) =>
      c.status !== "RETIRED" &&
      c.sourceRef?.startsWith(prefix) === true &&
      !current.has(stableJson(c.input)),
  );
}
