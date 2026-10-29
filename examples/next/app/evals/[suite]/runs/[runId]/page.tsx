import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RunView } from "@crowandraven/evalkeeper/react";
import { requireAdmin, SUITE_BY_KEY } from "@/lib/evalkeeper";
import { evals } from "@/lib/evalkeeper/evals";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ suite: string }>;
}): Promise<Metadata> {
  const { suite } = await params;
  return { title: `Test: ${SUITE_BY_KEY[suite]?.label ?? "Evals"}` };
}

/** One test: every answer, with what each check found. */
export default async function RunPage({
  params,
}: {
  params: Promise<{ suite: string; runId: string }>;
}) {
  await requireAdmin();
  const { suite, runId } = await params;
  const view = await RunView({ app: evals, suite, runId });
  if (!view) notFound();
  return view;
}
