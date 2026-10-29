import { weeklyCronRoute } from "@crowandraven/evalkeeper/next";
import { wiring } from "@/lib/evalkeeper";

// Written by `npx @crowandraven/evalkeeper add pages`: don't edit it.

/** The checks run after the response, within this function's time limit. */
export const maxDuration = 300;

/**
 * Mondays (vercel.json): the weekly eval check. Answers at once, then
 * runs each suite's quick set on its live model. Results show on the
 * evals hub. Call it with "Authorization: Bearer $CRON_SECRET".
 */
export const GET = weeklyCronRoute(wiring);
