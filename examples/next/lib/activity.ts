import { prisma } from "./db";

/**
 * The app's own activity, for suites that draft cases from it. In the
 * example that's the "try it" page's answers; in your app, whatever your
 * feature records (inputs people rated, inputs admins flagged).
 */

/**
 * Emails, phone numbers, and long digit runs (account and card numbers)
 * replaced with placeholders. Names can't be found this way: keep only
 * inputs people agreed to share, and review each draft before confirming.
 */
export function stripContacts(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[email]")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "[number]");
}

/**
 * Answers the feature gave since a date whose people agreed to keep the
 * input, newest first, leaving out the ids in `known`.
 */
export async function keptAnswers(args: {
  operation: string;
  since: Date;
  known: ReadonlySet<string>;
  limit: number;
}): Promise<{ id: string; input: unknown; output: unknown }[]> {
  if (args.limit <= 0) return [];
  const rows = await prisma.demoAnswer.findMany({
    where: {
      operation: args.operation,
      consented: true,
      createdAt: { gte: args.since },
      id: { notIn: [...args.known] },
    },
    orderBy: { createdAt: "desc" },
    take: args.limit,
  });
  return rows.map((r) => ({ id: r.id, input: r.input, output: r.output }));
}
