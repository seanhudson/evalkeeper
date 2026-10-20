"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { runWeeklyCheck, startWeeklyCheck } from "@/lib/weekly";

/**
 * Runs the weekly check now, the same way Monday's schedule does. In your
 * app, check that the person may run evals (an admin) first.
 */
export async function runWeeklyNow(): Promise<void> {
  // Recorded before the page re-renders, so it shows them running.
  const ids = await startWeeklyCheck();
  after(() => runWeeklyCheck(ids));
  revalidatePath("/evals");
}
