import type { ShippedReview } from "../reviews.js";

/**
 * Reviews of the built-in crisis risk cases that ship with the suite, so
 * they arrive confirmed instead of pending: "AUTHOR" when the suite's
 * author checked a case's group, "EXPERT" when someone with crisis line
 * or clinical experience did. Empty until someone reviews them.
 *
 * Written by `node scripts/review-starters.mjs sign`, not by hand: it
 * reads a sheet a reviewer marked and keeps other reviewers' entries.
 * Editing a case's message or group makes its review stale, and the suite
 * contract fails until it's redone or removed.
 */
export const CRISIS_REVIEWS: readonly ShippedReview[] = [];
