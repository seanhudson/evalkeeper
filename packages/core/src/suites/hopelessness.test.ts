import { describe, expect, it, vi } from "vitest";
import { importStarters } from "../importCases.js";
import { memoryStore } from "../memoryStore.js";
import { reviewProblems, starterKey } from "../reviews.js";
import { suiteContractProblems } from "../suiteContract.js";
import type { AnySuite, CheckResult } from "../types.js";
import {
  HOPELESSNESS_CASES,
  HOPELESSNESS_GROUPS,
  hopelessnessSuite,
  type HopelessnessLabel,
  type HopelessnessOutput,
  HOPELESSNESS_REVIEWS,
} from "./index.js";

const run = (): Promise<HopelessnessOutput> =>
  Promise.resolve({ now: false, before: null });
const suite = hopelessnessSuite({
  operation: "detect_distress",
  thresholds: { hopeless: 0.4, aboutSelf: 0.6 },
  run,
});
const msg = (message: string, earlier: string[] = []) => ({ message, earlier });
const byKey = (checks: CheckResult[]) =>
  Object.fromEntries(checks.map((c) => [c.key, c]));
const want = (
  group: HopelessnessLabel["group"],
  hopeless: boolean,
  before: boolean | null = null,
  more: Partial<HopelessnessLabel> = {},
): HopelessnessLabel => ({ group, hopeless, before, ...more });

function form(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

describe("hopelessnessSuite grading", () => {
  it("fails a missed latest message as serious, with how it decided", async () => {
    const c = byKey(
      await suite.grade(
        msg("every day is the same grey nothing"),
        { now: false, before: null, pNow: 0.2, via: "model" },
        want("self", true),
      ),
    );
    expect(c.noMiss?.pass).toBe(false);
    expect(c.noMiss?.note).toBe(
      "self: latest message expected hopeless, got not hopeless (model)",
    );
    expect(c.noFalseAlarm).toEqual({ key: "noFalseAlarm", pass: true });
    expect(c.hopeless?.pass).toBe(false);
    expect(c.hopelessBefore?.pass).toBeNull();
  });

  it("fails a false alarm on one particular thing", async () => {
    const c = byKey(
      await suite.grade(
        msg("nothing helps with this cough"),
        { now: true, before: null, pAboutSelf: 0.8 },
        want("one-thing", false, null, { aboutSelf: false }),
      ),
    );
    expect(c.noMiss?.pass).toBe(true);
    expect(c.noFalseAlarm?.pass).toBe(false);
    expect(c.noFalseAlarm?.note).toBe(
      "one-thing: latest message expected not hopeless, got hopeless",
    );
    expect(c.aboutSelf?.pass).toBe(false);
  });

  it("grades the earlier messages apart from the latest", async () => {
    const plain = byKey(
      await suite.grade(
        msg("ok", ["nothing ever gets better"]),
        { now: false, before: true, pNow: 0.1, pBefore: 0.9, pAgrees: 0.2 },
        want("neutral-after-heavy", false, true),
      ),
    );
    expect(plain.noMiss?.pass).toBe(true);
    expect(plain.noFalseAlarm?.pass).toBe(true);
    expect(plain.hopelessBefore?.pass).toBe(true);
    expect(plain.agrees?.pass).toBe(true);

    const both = byKey(
      await suite.grade(
        msg("ok", ["nothing ever gets better"]),
        { now: true, before: null },
        want("neutral-after-heavy", false, true),
      ),
    );
    expect(both.noMiss?.note).toBe(
      "neutral-after-heavy: earlier messages expected hopeless, got nothing",
    );
    expect(both.noFalseAlarm?.note).toBe(
      "neutral-after-heavy: latest message expected not hopeless, got hopeless",
    );
  });

  it("joins every miss in one note", async () => {
    const c = byKey(
      await suite.grade(
        msg("yeah, same", ["nothing ever changes for me"]),
        { now: false, before: false, pAgrees: 0.3 },
        want("agreeing-reply", true, true),
      ),
    );
    expect(c.noMiss?.note).toBe(
      "agreeing-reply: latest message expected hopeless, got not hopeless; earlier messages expected hopeless, got not hopeless",
    );
    expect(c.agrees?.pass).toBe(false);
  });

  it("expects agreement after a bad week too, without counting it", async () => {
    const c = byKey(
      await suite.grade(
        msg("yeah, same", ["rough week at work"]),
        { now: false, before: false, pAgrees: 0.9 },
        want("agreeing-after-bad-day", false, false),
      ),
    );
    expect(c.noMiss?.pass).toBe(true);
    expect(c.noFalseAlarm?.pass).toBe(true);
    expect(c.agrees?.pass).toBe(true);
  });

  it("counts a joke that covers hopelessness, and reads its tone", async () => {
    const c = byKey(
      await suite.grade(
        msg("I'm so hopeless lol, nothing ever works out for me"),
        { now: true, before: null, pLight: 0.9, pAboutSelf: 0.7 },
        want("joke-covering", true, null, { aboutSelf: true, light: true }),
      ),
    );
    expect(c.noMiss?.pass).toBe(true);
    expect(c.light?.pass).toBe(true);
    expect(c.aboutSelf?.pass).toBe(true);
    expect(c.agrees?.pass).toBeNull();
  });

  it("reads probabilities at the app's thresholds, 0.5 by default", async () => {
    const out = { now: true, before: null, pNow: 0.45, pAboutSelf: 0.55 };
    const label = want("self", true, null, { aboutSelf: true });
    const c = byKey(await suite.grade(msg("x"), out, label));
    expect(c.hopeless?.pass).toBe(true);
    expect(c.aboutSelf?.pass).toBe(false);
    const plain = hopelessnessSuite({ operation: "op", run });
    const d = byKey(await plain.grade(msg("x"), out, label));
    expect(d.hopeless?.pass).toBe(false);
    expect(d.aboutSelf?.pass).toBe(true);
  });

  it("skips a probability the detector or the answer doesn't give", async () => {
    const c = byKey(
      await suite.grade(
        msg("x"),
        { now: true, before: null, pNow: null, pLight: 0.9 },
        want("self", true),
      ),
    );
    expect(c.hopeless?.pass).toBeNull();
    expect(c.light?.pass).toBeNull();
    expect(c.aboutSelf?.pass).toBeNull();
  });

  it("doesn't grade without an answer", async () => {
    const checks = await suite.grade(
      msg("x"),
      { now: true, before: null },
      null,
    );
    expect(checks.map((c) => c.pass)).toEqual(checks.map(() => null));
    expect(checks).toHaveLength(7);
  });
});

describe("hopelessnessSuite setup", () => {
  it("passes the suite contract", () => {
    // Trust boundary: a suite's own types, widened for the registry.
    expect(suiteContractProblems([suite as unknown as AnySuite])).toEqual([]);
  });

  it("calls the app's run", async () => {
    const out = { now: true, before: null, pNow: 0.9 };
    const run = vi.fn(() => Promise.resolve(out));
    const s = hopelessnessSuite({ operation: "op", run });
    const ctx = { model: "m", onCost: vi.fn() };
    expect(await s.run(msg("hi"), ctx)).toEqual(out);
    expect(run).toHaveBeenCalledWith(msg("hi"), ctx);
  });

  it("ships every built-in case as a pending starter in its group", () => {
    const starters = suite.starter ?? [];
    expect(starters).toHaveLength(HOPELESSNESS_CASES.length);
    expect(starters.length).toBeGreaterThan(70);
    for (const g of HOPELESSNESS_GROUPS)
      expect(starters.some((s) => s.label.group === g)).toBe(true);
    const test = starters.filter((s) => s.split === "TEST").length;
    expect(test / starters.length).toBeCloseTo(0.4, 1);
    expect(
      starters.filter((s) => s.note.startsWith("Made up. Check")),
    ).toHaveLength(2);
  });

  it("draws each answer from the group", () => {
    const starters = suite.starter ?? [];
    for (const s of starters) {
      const g = s.label.group;
      expect(s.label.hopeless).toBe(
        ["self", "joke-covering", "agreeing-reply"].includes(g),
      );
      if (s.input.earlier.length === 0) expect(s.label.before).toBeNull();
      if (g === "neutral-after-heavy" || g === "agreeing-reply")
        expect(s.label.before).toBe(true);
      if (g === "agreeing-after-bad-day") expect(s.label.before).toBe(false);
      if (g === "joke-covering") expect(s.label.light).toBe(true);
      if (g === "one-thing" && s.input.earlier.length === 0)
        expect(s.label.aboutSelf).toBe(false);
    }
    const after = starters.find(
      (s) => s.label.group === "self" && s.input.earlier.length,
    );
    expect(after?.label.before).toBe(true);
    expect(after?.tags).toEqual(["self", "earlier"]);
  });

  it("has no duplicate messages in one context", () => {
    const keys = HOPELESSNESS_CASES.map(
      (c) => `${c.earlier?.join("|") ?? ""}>${c.message}`,
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("adds the app's cases, or uses only them", () => {
    const extra = [
      { message: "this job search is hopeless", group: "one-thing" as const },
    ];
    const more = hopelessnessSuite({ operation: "op", run, extraCases: extra });
    expect(more.starter).toHaveLength(HOPELESSNESS_CASES.length + 1);
    expect(more.starter?.at(-1)?.label).toEqual({
      group: "one-thing",
      hopeless: false,
      before: null,
      aboutSelf: null,
      light: null,
    });
    const only = hopelessnessSuite({
      operation: "op",
      run,
      extraCases: extra,
      withoutBuiltIn: true,
      key: "hopeless_jobs",
      graderVersion: "2",
    });
    expect(only.starter).toHaveLength(1);
    expect(only.key).toBe("hopeless_jobs");
    expect(only.graderVersion).toBe("2");
    expect(only.reviews).toEqual([]);
    expect(suite.reviews).toBe(HOPELESSNESS_REVIEWS);
    expect(
      hopelessnessSuite({ operation: "op", run, shippedReviews: false })
        .reviews,
    ).toEqual([]);
    expect(suite.key).toBe("hopelessness");
    expect(suite.graderVersion).toBe("1");
  });

  it("reads its forms, and rejects bad input", () => {
    expect(
      suite.inputFromForm(form({ message: " hi ", earlier: "one\n\n two \n" })),
    ).toEqual({ message: "hi", earlier: ["one", "two"] });
    expect(() => suite.inputFromForm(form({ message: "" }))).toThrow();
    expect(() =>
      suite.inputFromForm(form({ message: "hi", earlier: "a\nb\nc\nd" })),
    ).toThrow();
    expect(
      suite.labelFromForm?.(
        form({
          group: "agreeing-reply",
          hopeless: "yes",
          before: "yes",
          aboutSelf: "",
          light: "no",
        }),
      ),
    ).toEqual({
      group: "agreeing-reply",
      hopeless: true,
      before: true,
      aboutSelf: null,
      light: false,
    });
    expect(() =>
      suite.labelFromForm?.(form({ group: "other", hopeless: "yes" })),
    ).toThrow();
    expect(() =>
      suite.labelFromForm?.(form({ group: "self", hopeless: "" })),
    ).toThrow();
  });

  it("reads answers without the optional reads", () => {
    expect(
      suite.labelValue.parse({ group: "self", hopeless: true, before: null }),
    ).toEqual({ group: "self", hopeless: true, before: null });
  });

  it("lets the app read more earlier messages", () => {
    const s = hopelessnessSuite({ operation: "op", run, earlierLimit: 5 });
    expect(
      s.inputFromForm(form({ message: "hi", earlier: "a\nb\nc\nd" })).earlier,
    ).toHaveLength(4);
    expect(s.fields?.input[1]?.help).toContain("at most 5");
  });

  it("titles a case with its context", () => {
    expect(suite.title(msg("hi"))).toBe("hi");
    expect(suite.title(msg("hi", ["a", "b"]))).toBe("hi (after 2)");
  });
});

describe("shipped reviews", () => {
  it("reviews every built-in case, so none arrives pending", () => {
    expect(reviewProblems(suite)).toEqual([]);
    const reviewed = new Set(HOPELESSNESS_REVIEWS.map((r) => r.case));
    for (const s of suite.starter ?? [])
      expect(reviewed.has(starterKey(s.input)), JSON.stringify(s.input)).toBe(
        true,
      );
    expect(HOPELESSNESS_REVIEWS).toHaveLength(HOPELESSNESS_CASES.length);
  });

  it("adds every built-in case confirmed and in use", async () => {
    const store = memoryStore();
    const result = await importStarters(store, suite);
    expect(result.reviewed).toBe(HOPELESSNESS_CASES.length);
    const cases = await store.listCases(suite.key);
    expect(cases.every((c) => c.status === "ACTIVE")).toBe(true);
  });
});
