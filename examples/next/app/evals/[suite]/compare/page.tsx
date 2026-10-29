import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CompareView } from "@crowandraven/evalkeeper/react";
import { requireAdmin, SUITE_BY_KEY } from "@/lib/evalkeeper";
import { evals } from "@/lib/evalkeeper/evals";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ suite: string }>;
}): Promise<Metadata> {
  const { suite } = await params;
  return { title: `Compare: ${SUITE_BY_KEY[suite]?.label ?? "Evals"}` };
}

/** Two tests of a suite compared: the verdict, each check, and the cases they graded differently. */
export default async function ComparePage({
  params,
  searchParams,
}: {
  params: Promise<{ suite: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const { suite } = await params;
  const search = await searchParams;
  const view = await CompareView({ app: evals, suite, search });
  if (!view) notFound();
  return view;
}
