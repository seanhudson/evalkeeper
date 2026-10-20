/** Eval costs in dollars, for admin pages; server and client both use it. */
export function money(usd: number): string {
  if (usd === 0) return "$0";
  if (usd < 0.01) return "under 1¢";
  return `$${usd.toFixed(usd < 10 ? 2 : 0)}`;
}

/** One answer's cost: in cents below a dollar, so cheap models still differ. */
export function perAnswer(usd: number | null): string {
  if (usd === null) return "–";
  if (usd >= 1) return `$${usd.toFixed(2)}`;
  const cents = usd * 100;
  return `${cents >= 10 ? cents.toFixed(0) : cents.toPrecision(2)}¢`;
}

/** Seconds per answer. */
export function seconds(ms: number | null): string {
  return ms === null ? "–" : `${(ms / 1000).toFixed(1)}s`;
}
