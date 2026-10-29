import type { Metadata } from "next";
import { FeedbackView } from "@crowandraven/evalkeeper/react";
import { requireAdmin } from "@/lib/evalkeeper";
import { evals } from "@/lib/evalkeeper/evals";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Feedback: Evals" };

/** Thumbs up and down, and what to do with each. */
export default async function FeedbackPage() {
  await requireAdmin();
  return FeedbackView({ app: evals });
}
