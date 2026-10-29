import type { Metadata } from "next/types.js";
import { notFound } from "next/navigation.js";
import type { ReactNode } from "react";
import type { EvalAppConfig } from "../react/app.js";
import { HubPage } from "../react/HubSections.js";
import { SuitePage } from "../react/SuiteSections.js";
import { RunView } from "../react/RunView.js";
import { CompareView } from "../react/CompareView.js";
import { SideBySideView } from "../react/SideBySideView.js";
import { RateView } from "../react/RateView.js";
import { FeedbackView } from "../react/FeedbackView.js";
import type { EvalAdmin } from "./wiring.js";

type Search = Record<string, string | string[] | undefined>;
type Props<P> = { params: Promise<P>; searchParams: Promise<Search> };

/** One page: what a route file exports as its page and its title. */
export type EvalPage<P> = {
  Page: (props: Props<P>) => Promise<ReactNode>;
  generateMetadata: (props: Props<P>) => Promise<Metadata>;
};

/**
 * Evalkeeper's pages for the Next.js App Router. Each route file `add
 * pages` writes exports one of these as its page and title. Every page
 * calls `requireAdmin` first, and a suite or test that isn't there is a
 * 404.
 *
 * @example
 * ```ts
 * // app/evals/[suite]/page.tsx
 * import { pages } from "@/lib/evalkeeper/evals";
 * export const dynamic = "force-dynamic";
 * export const generateMetadata = pages.suite.generateMetadata;
 * export default pages.suite.Page;
 * ```
 *
 * @param app - Your screens' configuration, from `defineEvals`.
 * @param requireAdmin - Who may use the pages; it throws for anyone else.
 */
export function evalPages(
  app: EvalAppConfig,
  requireAdmin: () => Promise<EvalAdmin>,
) {
  /** A page of one suite, titled "{what}: {suite}". */
  function suitePage<P extends { suite: string }>(
    what: string,
    draw: (p: P, search: Search, admin: EvalAdmin) => Promise<ReactNode>,
  ): EvalPage<P> {
    return {
      Page: async ({ params, searchParams }) => {
        const admin = await requireAdmin();
        const view = await draw(await params, await searchParams, admin);
        if (!view) notFound();
        return view;
      },
      generateMetadata: async ({ params }) => {
        const label = app.suiteByKey[(await params).suite]?.label ?? "Evals";
        return { title: what ? `${what}: ${label}` : `Evals: ${label}` };
      },
    };
  }

  return {
    /** The hub: where each suite stands and what needs attention. */
    hub: {
      Page: async () => {
        await requireAdmin();
        return HubPage({ app });
      },
      generateMetadata: async () => {
        return { title: "Evals" };
      },
    } satisfies EvalPage<object>,
    /** A suite: its models, suggestion, versions, checks, and answer key. */
    suite: suitePage<{ suite: string }>("", (p) =>
      SuitePage({ app, suite: p.suite }),
    ),
    /** One test: every answer, with what each check found. */
    run: suitePage<{ suite: string; runId: string }>("Test", (p) =>
      RunView({ app, suite: p.suite, runId: p.runId }),
    ),
    /** Two tests compared: the verdict, each check, and where they differ. */
    compare: suitePage<{ suite: string }>("Compare", (p, search) =>
      CompareView({ app, suite: p.suite, search }),
    ),
    /** Two tests' answers where they differ, side by side. */
    sideBySide: suitePage<{ suite: string }>("Side by side", (p, search) =>
      SideBySideView({ app, suite: p.suite, search }),
    ),
    /** Blind rating: one case at a time, by its input only. */
    rate: suitePage<{ suite: string }>("Rate blind", (p, _search, rater) =>
      RateView({ app, suite: p.suite, rater }),
    ),
    /** Thumbs up and down, and what to do with each. */
    feedback: {
      Page: async () => {
        await requireAdmin();
        return FeedbackView({ app });
      },
      generateMetadata: async () => {
        return { title: "Feedback: Evals" };
      },
    } satisfies EvalPage<object>,
  };
}
