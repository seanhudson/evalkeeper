import "server-only";
import { defineEvals } from "@crowandraven/evalkeeper/react";
import { evalPages } from "@crowandraven/evalkeeper/next";
import * as actions from "./actions";
import { wiring } from ".";
import { EVALS_BASE } from "./paths";

// Written by `npx @crowandraven/evalkeeper add pages`: don't edit it.

/** Everything Evalkeeper's screens read: your wiring, and the actions. */
export const evals = defineEvals({ ...wiring, actions, basePath: EVALS_BASE });

/** Evalkeeper's pages, which the route files under app/evals export. */
export const pages = evalPages(evals, wiring.requireAdmin);
