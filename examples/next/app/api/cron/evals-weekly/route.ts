import { after, type NextRequest, NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cronAuth";
import { runWeeklyCheck, startWeeklyCheck } from "@/lib/weekly";

/** The checks run after the response, within this function's time limit. */
export const maxDuration = 300;

/**
 * Mondays (vercel.json): the weekly eval check. Answers at once, then
 * runs each suite's quick set on its live model. Results show on the
 * evals hub. Call it with "Authorization: Bearer $CRON_SECRET".
 */
export async function GET(request: NextRequest) {
  if (
    !isAuthorizedCron(
      request.headers.get("authorization"),
      process.env.CRON_SECRET,
    )
  )
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ids = await startWeeklyCheck();
  after(() => runWeeklyCheck(ids));
  return NextResponse.json({ started: ids.length }, { status: 202 });
}
