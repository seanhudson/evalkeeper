/**
 * The item at `i`, for indexes the caller has already checked (a loop
 * bound, a non-empty list). Throws instead of returning undefined, so a
 * wrong index fails loudly rather than as NaN or a missing row.
 */
export function at<T>(items: readonly T[], i: number): T {
  if (i < 0 || i >= items.length)
    throw new RangeError(`Index ${i} is outside 0..${items.length - 1}`);
  return items[i] as T;
}

/** A map's value for a key the caller knows is there. Throws otherwise. */
export function mustGet<K, V>(map: ReadonlyMap<K, V>, key: K): V {
  const v = map.get(key);
  if (v === undefined) throw new Error(`Missing ${String(key)}`);
  return v;
}
