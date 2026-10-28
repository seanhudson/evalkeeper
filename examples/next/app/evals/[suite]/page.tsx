import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RefreshWhile } from "@/components/evalkeeper/RefreshWhile";
import {
  AnswerKeySection,
  CasesInInstructions,
  ChecksSection,
  ChosenOnBase,
  ModelTable,
  SuggestionCard,
  SuiteHeader,
  Versions,
  loadSuitePage,
} from "@/components/evalkeeper/SuiteSections";
import { requireAdmin, SUITE_BY_KEY } from "@/lib/evalkeeper";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ suite: string }>;
}): Promise<Metadata> {
  const { suite } = await params;
  return { title: `Evals: ${SUITE_BY_KEY[suite]?.label ?? "Evals"}` };
}

/**
 * A suite's page: one arrangement of its sections. A page of your own can
 * load the same data (`loadSuitePage`) and arrange them another way.
 */
export default async function SuitePage({
  params,
}: {
  params: Promise<{ suite: string }>;
}) {
  await requireAdmin();
  const { suite: key } = await params;
  const data = await loadSuitePage(key);
  if (!data) notFound();
  return (
    <div className="space-y-8">
      <RefreshWhile active={data.testing} />
      <SuiteHeader data={data} />
      <ChosenOnBase data={data} />
      <SuggestionCard data={data} />
      <CasesInInstructions data={data} />
      <ModelTable data={data} />
      <Versions data={data} />
      <ChecksSection data={data} />
      <AnswerKeySection data={data} />
    </div>
  );
}
