import type { LabelRecord } from "./store";

/**
 * The EXPECTED answer tests use: the newest confirmed one, or failing that a
 * provisional one (put to use before review). Pending answers never count.
 */
export function confirmedLabel(labels: LabelRecord[]): LabelRecord | null {
  const newest = (status: LabelRecord["status"]) =>
    labels
      .filter((l) => l.status === status && l.kind === "EXPECTED")
      .sort((a, b) => +b.updatedAt - +a.updatedAt)[0] ?? null;
  return newest("CONFIRMED") ?? newest("PROVISIONAL");
}

/** In use on an answer nobody has reviewed yet. */
export function isProvisional(labels: LabelRecord[]): boolean {
  return confirmedLabel(labels)?.status === "PROVISIONAL";
}
