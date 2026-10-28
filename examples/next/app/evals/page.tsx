import type { Metadata } from "next";
import { WeeklyCheck } from "@crowandraven/evalkeeper/react";
import {
  HubIntro,
  HubStats,
  SuiteList,
  loadHub,
} from "@crowandraven/evalkeeper/react";
import { requireAdmin } from "@/lib/evalkeeper";
import { evals } from "@/lib/evalkeeper/evals";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Evals" };

/**
 * The evals hub, where each suite stands and what needs attention: one
 * arrangement of its sections. A hub of your own can load the same data
 * (`loadHub`) and arrange them another way.
 */
export default async function EvalsHub() {
  await requireAdmin();
  const data = await loadHub(evals);
  return (
    <div className="space-y-8">
      <HubIntro />
      <HubStats data={data} />
      <WeeklyCheck app={evals} weekly={data.weekly} />
      <SuiteList data={data} />
    </div>
  );
}
