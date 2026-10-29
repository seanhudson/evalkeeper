import type { EvalApp } from "../react/app.js";

/** Who's using the eval pages, as your `requireAdmin` returns them. */
export type EvalAdmin = { id: string; name: string };

/**
 * Your app's Evalkeeper wiring, as the Next.js glue reads it: everything
 * the screens need except their actions (the glue makes those), and who
 * may use the pages.
 */
export type EvalWiring = Omit<EvalApp, "actions"> & {
  /**
   * Who may use the eval pages. Every page and action calls it first:
   * throw when the person isn't an admin, and return who they are, which
   * is recorded as who made each change.
   */
  requireAdmin: () => Promise<EvalAdmin>;
  /**
   * What the settings history records as who made a change: the admin's
   * `name` (the default) or `id`. Use "id" when your settings store keeps
   * a user id there (a foreign key) and shows names from it.
   */
  changedBy?: "name" | "id";
};
