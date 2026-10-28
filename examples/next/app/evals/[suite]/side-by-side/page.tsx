import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SideBySideView } from "@crowandraven/evalkeeper/react";
import { requireAdmin, SUITE_BY_KEY } from "@/lib/evalkeeper";
import { evals } from "@/lib/evalkeeper/evals";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ suite: string }>;
}): Promise<Metadata> {
  const { suite } = await params;
  return { title: `Side by side: ${SUITE_BY_KEY[suite]?.label ?? "Evals"}` };
}

/** Two tests' answers to the cases they graded differently, side by side. */
export default async function SideBySidePage({
  params,
  searchParams,
}: {
  params: Promise<{ suite: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const { suite } = await params;
  const search = await searchParams;
  const view = await SideBySideView({ app: evals, suite, search });
  if (!view) notFound();
  return view;
}
