/** What the answer-in-use rule needs from a label: the store's, or an app's own row. */
export type LabelLike = { status: string; updatedAt: Date };

/**
 * The EXPECTED answer tests use: the newest confirmed one, or failing that a
 * provisional one (put to use before review). Pending answers never count.
 * Generic, so pages that read their own label rows (with extra columns)
 * share the rule and keep their row type.
 */
export function confirmedLabel<L extends LabelLike>(
  labels: readonly L[],
): L | null {
  const newest = (status: string) =>
    labels
      .filter((l) => l.status === status)
      .sort((a, b) => +b.updatedAt - +a.updatedAt)[0] ?? null;
  return newest("CONFIRMED") ?? newest("PROVISIONAL");
}

/** In use on an answer nobody has reviewed yet. */
export function isProvisional(labels: readonly LabelLike[]): boolean {
  return confirmedLabel(labels)?.status === "PROVISIONAL";
}
