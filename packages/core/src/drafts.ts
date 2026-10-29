import type { CaseRecord, EvalStore, NewCase } from "./store.js";
import type { AnySuite } from "./types.js";
import { confirmedLabel } from "./labels.js";
import { nextSplit } from "./quickSet.js";
import { draftsToTarget } from "./summary.js";

/** Where a case a model drafted on request came from. */
export const MODEL_DRAFT_SOURCE = "MODEL_DRAFT";

/** What drafting more cases did. */
export type DraftMoreResult = {
  /** Cases added, each with a PENDING answer. */
  drafted: number;
  /** Drafts that didn't fit the suite's input or answer, and why. */
  rejected: { problem: string }[];
};

/**
 * Has the suite's `draftMore` write enough new cases to bring the answer
 * key toward its target size, aimed at what it's missing, with an optional
 * focus from the person asking. Each arrives as a DRAFT case with a
 * PENDING answer, split between DEV and TEST like any new case, and counts
 * only once a person confirms it.
 *
 * @example
 * ```ts
 * const { drafted } = await draftMoreCases({ store, suite, focus: "longer notes" });
 * ```
 */
export async function draftMoreCases(opts: {
  store: EvalStore;
  suite: AnySuite;
  /** What to aim the drafts at, in the person's words; null for none. */
  focus: string | null;
}): Promise<DraftMoreResult> {
  const { store, suite } = opts;
  const result: DraftMoreResult = { drafted: 0, rejected: [] };
  if (!suite.draftMore) return result;
  const all = await store.listCases(suite.key, { includeRetired: true });
  const inUse = all.filter((c) => c.status !== "RETIRED");
  const drafts = await suite.draftMore({
    existing: all.map((c) => ({ input: c.input, tags: c.tags })),
    count: draftsToTarget(inUse.length),
    focus: opts.focus,
  });
  const counts = { DEV: 0, TEST: 0 };
  for (const c of inUse) counts[c.split] += 1;
  for (const d of drafts) {
    const input = suite.input.safeParse(d.input);
    if (!input.success) {
      result.rejected.push({
        problem: `input: ${input.error.issues[0]?.message ?? "invalid"}`,
      });
      continue;
    }
    const label = suite.labelValue.safeParse(d.label);
    if (!label.success) {
      result.rejected.push({
        problem: `answer: ${label.error.issues[0]?.message ?? "invalid"}`,
      });
      continue;
    }
    const split = nextSplit(counts);
    counts[split] += 1;
    const data: NewCase = {
      suite: suite.key,
      input: input.data,
      tags: d.tags,
      split,
      status: "DRAFT",
      source: MODEL_DRAFT_SOURCE,
      sourceRef: null,
      note: d.note || null,
      labels: [
        {
          kind: "EXPECTED",
          status: "PENDING",
          value: label.data,
          raterRole: "MODEL",
          raterId: null,
          note: "Drafted by a model. Confirm it if it's right.",
        },
      ],
    };
    await store.createCase(data);
    result.drafted += 1;
  }
  return result;
}

/**
 * Cases in use whose only answer is a draft: what testing with drafts
 * would put to use.
 */
export function draftAnswers(cases: readonly CaseRecord[]) {
  return cases.flatMap((c) => {
    if (c.status === "RETIRED" || confirmedLabel(c.labels)) return [];
    const pending = c.labels
      .filter((l) => l.status === "PENDING")
      .sort((a, b) => +b.updatedAt - +a.updatedAt)[0];
    return pending ? [{ case: c, label: pending }] : [];
  });
}

/**
 * Puts every draft answer to use before review, so a feature can be
 * tested now: each becomes PROVISIONAL (and its case ACTIVE), and every
 * score resting on one says so until a person confirms it. Returns how
 * many answers it put to use.
 */
export async function useDraftsProvisionally(opts: {
  store: EvalStore;
  suite: AnySuite;
}): Promise<number> {
  const { store, suite } = opts;
  const drafts = draftAnswers(await store.listCases(suite.key));
  for (const d of drafts) {
    await store.setLabelStatus(d.label.id, "PROVISIONAL");
    if (d.case.status === "DRAFT")
      await store.setCaseStatus(d.case.id, "ACTIVE");
  }
  return drafts.length;
}
