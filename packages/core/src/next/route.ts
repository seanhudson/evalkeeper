import { after } from "next/server.js";
import { isAuthorizedCron } from "./cron.js";
import { weeklyCheck } from "./weekly.js";
import type { EvalWiring } from "./wiring.js";

/**
 * The weekly check's cron route: answers at once, then runs each suite's
 * quick set on its live model after the response. Call it with
 * "Authorization: Bearer $CRON_SECRET"; anything else gets a 401.
 *
 * @example
 * ```ts
 * // app/api/cron/evals-weekly/route.ts
 * import { weeklyCronRoute } from "@crowandraven/evalkeeper/next";
 * import { wiring } from "@/lib/evalkeeper";
 * export const maxDuration = 300;
 * export const GET = weeklyCronRoute(wiring);
 * ```
 *
 * @param w - Your wiring: its runner, store, and suites.
 * @param secret - The cron secret; `process.env.CRON_SECRET` by default.
 */
export function weeklyCronRoute(
  w: Pick<EvalWiring, "runner" | "store" | "suites">,
  secret: () => string | undefined = () => process.env.CRON_SECRET,
) {
  const weekly = weeklyCheck(w);
  return async function GET(request: Request): Promise<Response> {
    const startedAt = Date.now();
    if (!isAuthorizedCron(request.headers.get("authorization"), secret()))
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    const ids = await weekly.start();
    after(() => weekly.run(ids, startedAt));
    return Response.json({ started: ids.length }, { status: 202 });
  };
}
