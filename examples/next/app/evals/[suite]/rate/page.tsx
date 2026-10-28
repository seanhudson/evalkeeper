import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RateView } from "@crowandraven/evalkeeper/react";
import { requireAdmin, SUITE_BY_KEY } from "@/lib/evalkeeper";
import { evals } from "@/lib/evalkeeper/evals";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ suite: string }>;
}): Promise<Metadata> {
  const { suite } = await params;
  return { title: `Rate blind: ${SUITE_BY_KEY[suite]?.label ?? "Evals"}` };
}

/** Blind rating: one case at a time, by its input only. */
export default async function RateBlindPage({
  params,
}: {
  params: Promise<{ suite: string }>;
}) {
  const rater = await requireAdmin();
  const { suite } = await params;
  const view = await RateView({ app: evals, suite, rater });
  if (!view) notFound();
  return view;
}
