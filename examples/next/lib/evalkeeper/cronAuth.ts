import { timingSafeEqual } from "node:crypto";

/**
 * Whether a request carries the cron secret ("Authorization: Bearer …").
 * Fails closed when no secret is set, and compares in constant time so the
 * secret can't be guessed a character at a time.
 */
export function isAuthorizedCron(
  header: string | null,
  secret: string | undefined,
): boolean {
  if (!secret || !header) return false;
  const presented = Buffer.from(header);
  const expected = Buffer.from(`Bearer ${secret}`);
  return (
    presented.length === expected.length && timingSafeEqual(presented, expected)
  );
}
