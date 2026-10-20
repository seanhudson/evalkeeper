/**
 * JSON with object keys sorted, so a case's input compares equal however
 * its keys were ordered (Postgres jsonb reorders them on save).
 */
export function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>).sort(([a], [b]) =>
            a < b ? -1 : a > b ? 1 : 0,
          ),
        )
      : v,
  );
}

/** Drafted cases not yet in the answer key. */
export function newStarters<T extends { input: unknown }>(
  starter: T[] | undefined,
  existing: { input: unknown }[],
): T[] {
  const have = new Set(existing.map((c) => stableJson(c.input)));
  return (starter ?? []).filter((c) => !have.has(stableJson(c.input)));
}
