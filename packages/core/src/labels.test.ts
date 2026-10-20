import { describe, expect, it } from "vitest";
import { confirmedLabel, isProvisional } from "./labels.js";
import type { LabelRecord } from "./store.js";

const label = (
  status: LabelRecord["status"],
  at: number,
  value = status,
): LabelRecord => ({
  id: `${status}-${at}`,
  kind: "EXPECTED",
  status,
  value,
  raterRole: "OWNER",
  raterId: null,
  note: null,
  createdAt: new Date(at),
  updatedAt: new Date(at),
});

describe("answers in use", () => {
  it("uses the newest confirmed answer", () => {
    const l = confirmedLabel([
      label("CONFIRMED", 1),
      label("CONFIRMED", 3),
      label("PENDING", 5),
    ]);
    expect(l?.id).toBe("CONFIRMED-3");
  });

  it("falls back to a provisional one, and says so", () => {
    const labels = [label("PROVISIONAL", 1), label("PENDING", 2)];
    expect(confirmedLabel(labels)?.status).toBe("PROVISIONAL");
    expect(isProvisional(labels)).toBe(true);
    expect(
      isProvisional([label("CONFIRMED", 1), label("PROVISIONAL", 2)]),
    ).toBe(false);
  });

  it("never uses pending or rejected answers", () => {
    expect(
      confirmedLabel([label("PENDING", 1), label("REJECTED", 2)]),
    ).toBeNull();
  });

  it("works on an app's own label rows and keeps their type", () => {
    const rows = [
      {
        status: "PROVISIONAL",
        updatedAt: new Date(1),
        rater: "agent",
        confidence: 0.6,
      },
      {
        status: "CONFIRMED",
        updatedAt: new Date(2),
        rater: "sam",
        confidence: 1,
      },
    ];
    const l = confirmedLabel(rows);
    // The extra columns come back typed.
    expect(l?.rater).toBe("sam");
    expect(isProvisional(rows.slice(0, 1))).toBe(true);
  });
});
