import { describe, expect, it } from "vitest";
import {
  limitsFromForm,
  memorySpending,
  parseLimit,
  spendingHalt,
  spendingNeedsRoom,
  usd,
  type SpendingReading,
} from "./spending.js";

const reading = (over: Partial<SpendingReading> = {}): SpendingReading => ({
  spentUsd: 2,
  limitUsd: 15,
  stoppedUntil: null,
  running: 0,
  ...over,
});
const form = (entries: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
};

describe("money and limits", () => {
  it("shows money to the cent", () => {
    expect(usd(15)).toBe("$15.00");
    expect(usd(0.5)).toBe("$0.50");
  });
  it("reads a typed limit, with or without a $ and commas", () => {
    expect(parseLimit(" $15 ")).toBe(15);
    expect(parseLimit("1,0.005")).toBe(10.01);
    expect(parseLimit("")).toBeNull();
    for (const bad of ["0", "-1", "501", "ten"])
      expect(() => parseLimit(bad)).toThrow(/from \$0\.01 to \$500\.00/);
  });
  it("reads the form: both limits, or just the overall one", () => {
    expect(limitsFromForm(form({ allUsd: "20" }))).toEqual({ allUsd: 20 });
    expect(
      limitsFromForm(
        form({ allUsd: "20", operation: "posting", featureUsd: "" }),
      ),
    ).toEqual({ allUsd: 20, feature: { operation: "posting", usd: null } });
    expect(() => limitsFromForm(form({ allUsd: "" }))).toThrow(
      /daily limit for all tests/,
    );
  });
});

describe("spendingHalt", () => {
  const now = new Date("2026-11-24T12:00:00Z");
  it("is null under every limit", () => {
    expect(spendingHalt(reading(), now)).toBeNull();
    expect(spendingNeedsRoom(reading(), now)).toBe(false);
  });
  it("says what to do when stopped, over the overall limit, or over a feature's", () => {
    expect(
      spendingHalt(reading({ stoppedUntil: new Date(+now + 60_000) }), now),
    ).toMatch(/^Tests are stopped until .*Allow tests/);
    expect(spendingHalt(reading({ spentUsd: 15 }), now)).toMatch(
      /\$15\.00 in the last 24 hours, over the \$15\.00 daily limit.*Raise the limit/,
    );
    const feature = {
      operation: "posting",
      spentUsd: 5,
      limitUsd: 5,
      defaultUsd: 5,
    };
    expect(spendingHalt(reading({ feature }), now)).toMatch(
      /This feature's tests .* over its \$5\.00 daily limit/,
    );
    expect(
      spendingHalt(reading({ feature: { ...feature, limitUsd: null } }), now),
    ).toBeNull();
    // A stop that has run out no longer counts.
    expect(
      spendingHalt(reading({ stoppedUntil: new Date(+now - 1) }), now),
    ).toBeNull();
  });
  it("takes room while a test runs, for Stop", () => {
    expect(spendingNeedsRoom(reading({ running: 1 }), now)).toBe(true);
  });
});

describe("memorySpending", () => {
  it("adds up the last 24 hours, saves limits, and stops", async () => {
    const s = memorySpending({ featureDefaults: { posting: 5 } });
    s.spend("posting", 3);
    s.spend("triage", 1);
    s.spend("posting", 9, new Date(Date.now() - 25 * 60 * 60 * 1000));
    expect(await s.read()).toMatchObject({ spentUsd: 4, limitUsd: 15 });
    expect((await s.read("posting")).feature).toEqual({
      operation: "posting",
      spentUsd: 3,
      limitUsd: 5,
      defaultUsd: 5,
    });
    await s.saveLimits(
      { allUsd: 20, feature: { operation: "posting", usd: 8 } },
      "p",
    );
    expect(await s.read("posting")).toMatchObject({
      limitUsd: 20,
      feature: { limitUsd: 8 },
    });
    await s.saveLimits(
      { allUsd: 20, feature: { operation: "posting", usd: null } },
      "p",
    );
    expect((await s.read("posting")).feature?.limitUsd).toBe(5);
    s.setRunning(2);
    expect(await s.stopAll?.("p")).toBe(2);
    const stopped = await s.read();
    expect(stopped.running).toBe(0);
    expect(stopped.stoppedUntil).not.toBeNull();
    await s.allow?.();
    expect((await s.read()).stoppedUntil).toBeNull();
  });
});
