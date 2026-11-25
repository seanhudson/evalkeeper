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

/**
 * A day, with the month as a word so no reader mistakes it:
 * "Oct 28, 2026" (10/28 is the 10th of the 28th month in most of the world).
 */
export const dayOf = (d: Date, timeZone?: string): string =>
  d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(timeZone ? { timeZone } : {}),
  });

/** A day and time, the same way: "Oct 28, 2026, 3:04 PM". */
export const momentOf = (d: Date, timeZone?: string): string =>
  d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  });

/**
 * Every link that reads as words: the app's accent, underlined on hover.
 * Numbers that link (a score, a count) keep their own color, and links
 * styled as buttons, card titles, and the back link have their own look.
 */
export const LINK = "text-accent hover:underline";

/**
 * A tinted background with readable text, from the app's color names
 * (`--color-good`, `--color-warn`, `--color-bad`), so the app's
 * evalkeeper.css decides both themes: no fixed palette colors and no
 * `dark:` variants, which follow the system rather than the app.
 */
export const TINT = {
  good: "bg-good/15 text-[color-mix(in_srgb,var(--color-good)_55%,var(--color-ink))]",
  warn: "bg-warn/15 text-[color-mix(in_srgb,var(--color-warn)_55%,var(--color-ink))]",
  bad: "bg-bad/10 text-[color-mix(in_srgb,var(--color-bad)_60%,var(--color-ink))]",
} as const;

/** A warning panel's tint: the warn color, faint, behind ink text. */
export const WARN_PANEL = "bg-warn/10 border border-warn/40";
