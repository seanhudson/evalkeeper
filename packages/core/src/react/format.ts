/**
 * Helpers the screens share on the server and in the browser. They live
 * outside the client components' module because Next.js makes every
 * export of a `"use client"` module a client reference, which server code
 * can't call.
 */

/** A share as a whole percent: 0.874 is "87%". */
export const pct = (x: number): string => `${Math.round(x * 100)}%`;

/**
 * A button that isn't the page's main action: the app's accent as an
 * outline, so it still reads as a button in the app's colors (set
 * `--accent` in evalkeeper.css).
 */
export const QUIET_BUTTON =
  "border border-accent/40 bg-card text-accent hover:bg-accent/10";
