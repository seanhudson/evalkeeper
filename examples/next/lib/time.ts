/** The moment `days` days ago, for "this week" summaries. */
export function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 86_400_000);
}
