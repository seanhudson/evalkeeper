import type { Metadata } from "next";
import { WeeklyCheck } from "@/components/evalkeeper/WeeklyCheck";
import {
  HubIntro,
  HubStats,
  SuiteList,
  loadHub,
} from "@/components/evalkeeper/HubSections";
import { requireAdmin } from "@/lib/evalkeeper";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Evals" };

/**
 * The evals hub, where each suite stands and what needs attention: one
 * arrangement of its sections. A hub of your own can load the same data
 * (`loadHub`) and arrange them another way.
 */
export default async function EvalsHub() {
  await requireAdmin();
  const data = await loadHub();
  return (
    <div className="space-y-8">
      <HubIntro />
      <HubStats data={data} />
      <WeeklyCheck weekly={data.weekly} />
      <SuiteList data={data} />
    </div>
  );
}
