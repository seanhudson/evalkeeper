import { describe, expect, it } from "vitest";
import {
  BLIND_RATER,
  blindRating,
  nextToRate,
  rateQueue,
  raterStatus,
  skipMark,
} from "./blind.js";
import { confirmedLabel } from "./labels.js";
import { memoryStore } from "./memoryStore.js";
import { datasetVersion } from "./runner.js";
import type { CaseRecord, LabelRecord } from "./store.js";

const label = (
  raterId: string | null,
  status: LabelRecord["status"] = "CONFIRMED",
): LabelRecord => ({
  id: `l-${raterId}-${status}`,
  kind: "EXPECTED",
  status,
  value: status === "SKIPPED" ? null : { queue: "billing" },
  raterRole: raterId ? BLIND_RATER : "OWNER",
  raterId,
  note: null,
  createdAt: new Date(1),
  updatedAt: new Date(1),
});

const kase = (
  id: string,
  at: number,
  labels: LabelRecord[] = [],
  status: CaseRecord["status"] = "ACTIVE",
): CaseRecord => ({
  id,
  suite: "s",
  input: { subject: id },
  tags: [],
  split: "DEV",
  status,
  source: "IMPORT",
  sourceRef: null,
  note: null,
  createdAt: new Date(at),
  updatedAt: new Date(at),
  labels,
});

describe("raterStatus", () => {
  it("says whether this person rated, skipped, or hasn't seen a case", () => {
    expect(raterStatus(kase("a", 1), "pat")).toBeNull();
    expect(raterStatus(kase("a", 1, [label("pat")]), "pat")).toBe("rated");
    expect(raterStatus(kase("a", 1, [label("pat", "SKIPPED")]), "pat")).toBe(
      "skipped",
    );
  });

  it("counts any answer of theirs as rated, even after a skip", () => {
    const c = kase("a", 1, [label("pat", "SKIPPED"), label("pat", "PENDING")]);
    expect(raterStatus(c, "pat")).toBe("rated");
  });

  it("ignores other people's answers and skips", () => {
    const c = kase("a", 1, [
      label(null),
      label("lee"),
      label("kim", "SKIPPED"),
    ]);
    expect(raterStatus(c, "pat")).toBeNull();
  });
});

describe("rateQueue and nextToRate", () => {
  it("offers the oldest case the person hasn't rated or skipped", () => {
    const cases = [
      kase("newest", 30),
      kase("rated", 5, [label("pat")]),
      kase("skipped", 1, [label("pat", "SKIPPED")]),
      kase("oldest left", 10, [label("lee")]),
    ];
    expect(rateQueue(cases, "pat")).toMatchObject({
      rated: 1,
      skipped: 1,
      left: 2,
    });
    expect(nextToRate(cases, "pat")?.id).toBe("oldest left");
    // Another person starts from the oldest case of all.
    expect(nextToRate(cases, "lee")?.id).toBe("skipped");
  });

  it("leaves out retired cases, and has nothing next when all are done", () => {
    const cases = [
      kase("retired", 1, [], "RETIRED"),
      kase("done", 2, [label("pat")]),
    ];
    expect(rateQueue(cases, "pat")).toEqual({
      next: null,
      rated: 1,
      skipped: 0,
      left: 0,
    });
    expect(nextToRate([], "pat")).toBeNull();
  });

  it("doesn't reorder the cases it was given", () => {
    const cases = [kase("b", 2), kase("a", 1)];
    nextToRate(cases, "pat");
    expect(cases.map((c) => c.id)).toEqual(["b", "a"]);
  });
});

describe("blindRating and skipMark", () => {
  it("makes the rater's own confirmed answer, with their reason", () => {
    expect(
      blindRating({
        raterId: "pat",
        value: { queue: "bug" },
        reason: "  It says the app crashes.  ",
      }),
    ).toEqual({
      kind: "EXPECTED",
      status: "CONFIRMED",
      value: { queue: "bug" },
      raterRole: BLIND_RATER,
      raterId: "pat",
      note: "It says the app crashes.",
    });
  });

  it("refuses a rating without a reason or a rater", () => {
    expect(() =>
      blindRating({ raterId: "pat", value: {}, reason: "  " }),
    ).toThrow(/reason/);
    expect(() => blindRating({ raterId: "", value: {}, reason: "x" })).toThrow(
      /rater/,
    );
    expect(() => skipMark("")).toThrow(/rater/);
  });

  it("marks a skip with no value, which is never graded against", () => {
    const skip = skipMark("pat");
    expect(skip).toMatchObject({
      status: "SKIPPED",
      value: null,
      raterId: "pat",
    });
    expect(confirmedLabel([{ ...label("pat", "SKIPPED") }])).toBeNull();
  });

  it("keeps everyone's answers on a memory store, and a skip changes no test", async () => {
    const store = memoryStore();
    const c = await store.createCase({
      suite: "s",
      input: { subject: "Refund" },
      tags: [],
      split: "DEV",
      status: "ACTIVE",
      source: "IMPORT",
      sourceRef: null,
      note: null,
      labels: [{ ...label("lee"), raterRole: BLIND_RATER }],
    });
    const before = datasetVersion(await store.listCases("s"));
    await store.addLabel(c.id, skipMark("pat"));
    expect(datasetVersion(await store.listCases("s"))).toBe(before);
    expect(nextToRate(await store.listCases("s"), "pat")).toBeNull();

    await store.addLabel(
      c.id,
      blindRating({ raterId: "kim", value: { queue: "bug" }, reason: "Crash" }),
    );
    const [listed] = await store.listCases("s");
    expect(listed?.labels.map((l) => [l.raterId, l.status])).toEqual([
      ["lee", "CONFIRMED"],
      ["pat", "SKIPPED"],
      ["kim", "CONFIRMED"],
    ]);
  });
});
