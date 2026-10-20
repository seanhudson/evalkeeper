import { describe, expect, it } from "vitest";
import { wordPairs } from "evalkeeper";
import { ticketTriage, TRIAGE_STARTERS } from "../lib/suites/ticketTriage";
import {
  actionItems,
  ACTION_STARTERS,
  useMatcher,
} from "../lib/suites/actionItems";
import { SUITES } from "../lib/suites";
import { demoCall } from "../lib/demo";

const check = (r: { key: string; pass: boolean | null }[], key: string) =>
  r.find((c) => c.key === key)?.pass;

describe("every suite", () => {
  it("gives every form field a label and help", () => {
    for (const suite of SUITES) {
      const fields = [
        ...(suite.fields?.input ?? []),
        ...(suite.fields?.label ?? []),
      ];
      expect(fields.length, suite.key).toBeGreaterThan(0);
      for (const f of fields) {
        expect(f.label, `${suite.key}.${f.name}`).not.toBe("");
        expect(f.help.length, `${suite.key}.${f.name} help`).toBeGreaterThan(
          10,
        );
      }
    }
  });

  it("has valid starters whose answers parse", () => {
    for (const suite of SUITES)
      for (const s of suite.starter ?? []) {
        expect(suite.input.safeParse(s.input).success, suite.key).toBe(true);
        expect(suite.labelValue.safeParse(s.label).success, suite.key).toBe(
          true,
        );
      }
  });

  it("puts some starters in TEST, never all", () => {
    for (const suite of SUITES) {
      const test = (suite.starter ?? []).filter(
        (s) => s.split === "TEST",
      ).length;
      expect(test, suite.key).toBeGreaterThan(0);
      expect(test, suite.key).toBeLessThan(suite.starter?.length ?? 0);
    }
  });
});

describe("ticket triage grading", () => {
  const input = { subject: "Board won't load", body: "Blank screen." };
  it("passes the right queue and urgency", async () => {
    const r = await ticketTriage.grade(
      input,
      { category: "bug", urgency: "high" },
      { category: "bug", urgency: "high" },
    );
    expect(r.every((c) => c.pass !== false)).toBe(true);
  });
  it("fails a wrong queue, and an urgent ticket marked low, as serious", async () => {
    const r = await ticketTriage.grade(
      input,
      { category: "account", urgency: "low" },
      { category: "bug", urgency: "high" },
    );
    expect(check(r, "category")).toBe(false);
    expect(check(r, "not_missed")).toBe(false);
  });
  it("doesn't apply the urgent check to tickets that aren't urgent", async () => {
    const r = await ticketTriage.grade(
      input,
      { category: "bug", urgency: "low" },
      { category: "bug", urgency: "normal" },
    );
    expect(check(r, "not_missed")).toBeNull();
    expect(check(r, "urgency")).toBe(false);
  });
  it("grades nothing without an answer", async () => {
    const r = await ticketTriage.grade(
      input,
      { category: "bug", urgency: "low" },
      null,
    );
    expect(r.every((c) => c.pass === null)).toBe(true);
  });
  it("reads a case and an answer from the form", () => {
    const form = new FormData();
    form.set("subject", " Hi ");
    form.set("body", "There");
    form.set("category", "billing");
    form.set("urgency", "low");
    expect(ticketTriage.inputFromForm(form)).toEqual({
      subject: "Hi",
      body: "There",
    });
    expect(ticketTriage.labelFromForm?.(form)).toEqual({
      category: "billing",
      urgency: "low",
    });
    form.set("category", "nonsense");
    expect(() => ticketTriage.labelFromForm?.(form)).toThrow();
  });
});

describe("action items grading", () => {
  useMatcher(async (e, a) => ({ pairs: wordPairs(e, a), by: "words" }));
  const input = { notes: "Notes." };
  const want = {
    items: ["Priya sends the release notes", "Tom fixes the typo"],
  };

  it("gives partial credit for each item found", async () => {
    const r = await actionItems.grade(
      input,
      { items: ["Priya sends release notes"] },
      want,
    );
    const found = r.find((c) => c.key === "found");
    expect(found?.pass).toBe(false);
    expect(found?.units).toEqual({ right: 1, total: 2 });
    expect(found?.note).toMatch(/Tom fixes the typo/);
  });

  it("allows one extra item, not two", async () => {
    const one = await actionItems.grade(
      input,
      { items: [...want.items, "Lunch"] },
      want,
    );
    expect(check(one, "no_extras")).toBe(true);
    const two = await actionItems.grade(
      input,
      { items: [...want.items, "Lunch", "Coffee"] },
      want,
    );
    expect(check(two, "no_extras")).toBe(false);
  });

  it("passes an empty list when there's nothing to do", async () => {
    const r = await actionItems.grade(input, { items: [] }, { items: [] });
    expect(check(r, "found")).toBe(true);
  });

  it("reads one item per line from the form", () => {
    const form = new FormData();
    form.set("items", "One\n\n Two \n");
    expect(actionItems.labelFromForm?.(form)).toEqual({
      items: ["One", "Two"],
    });
  });

  it("has starters for its edge cases", () => {
    expect(ACTION_STARTERS.some((s) => s.label.items.length === 0)).toBe(true);
    expect(TRIAGE_STARTERS.some((s) => s.label.urgency === "high")).toBe(true);
  });
});

describe("demo models", () => {
  it("answer the same way every time, so tests are repeatable", async () => {
    const run = () =>
      demoCall(
        "demo-quick",
        "case-1",
        () => "right",
        () => "wrong",
        () => undefined,
      );
    expect(await run()).toBe(await run());
  });

  it("report a cost for each answer", async () => {
    let spent = 0;
    await demoCall(
      "demo-careful",
      "case-1",
      () => 1,
      () => 0,
      (u) => (spent += u),
    );
    expect(spent).toBeGreaterThan(0);
  });
});

describe("ticket routing (a decision suite)", () => {
  it("answers through experimental_decide and grades both questions", async () => {
    const { ticketRouting, ROUTING_STARTERS } =
      await import("../lib/suites/ticketRouting");
    const starter = ROUTING_STARTERS[0];
    if (!starter) throw new Error("no starters");
    let spent = 0;
    const out = await ticketRouting.run(starter.input, {
      model: "demo-careful",
      onCost: (u) => (spent += u),
    });
    expect(out.queue.type).toBe("choice");
    expect(out.queue.probabilities).toBeDefined();
    expect(spent).toBeGreaterThan(0);
    const checks = await ticketRouting.grade(starter.input, out, starter.label);
    expect(checks.map((c) => c.key)).toEqual(["queue", "urgent"]);
    expect(checks[0]?.measures?.brier).toBeDefined();
  });

  it("gives a prompted model's choice no distribution", async () => {
    const { ticketRouting, ROUTING_STARTERS } =
      await import("../lib/suites/ticketRouting");
    const starter = ROUTING_STARTERS[1];
    if (!starter) throw new Error("no starters");
    const out = await ticketRouting.run(starter.input, {
      model: "demo-legacy",
      onCost: () => undefined,
    });
    expect(out.queue.probabilities).toBeUndefined();
    const [queue] = await ticketRouting.grade(
      starter.input,
      out,
      starter.label,
    );
    expect(queue?.measures?.brier).toBeUndefined();
  });
});

describe("models per feature", () => {
  it("offers decision models for decision features and text models for the rest", async () => {
    const { availableModels } = await import("../lib/models");
    const decisions = availableModels("decisions");
    const text = availableModels("text");
    expect(decisions).toContain("demo-careful");
    expect(text).toContain("demo-careful");
    // Jev answers decisions only, and only with its key.
    expect(text).not.toContain("jev-latest");
  });
});
