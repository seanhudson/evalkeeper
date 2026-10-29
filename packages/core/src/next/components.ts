/**
 * Next.js's own pieces for Evalkeeper's screens: its `Link`, so moving
 * between eval pages doesn't reload, and a `RefreshWhile` on its router,
 * so a page refreshes while a test runs. Spread them into your provider
 * before your own components:
 *
 * ```tsx
 * <EvalComponentsProvider components={{ ...nextComponents, Button }}>
 * ```
 *
 * Import it from `@crowandraven/evalkeeper/next/components` in a client
 * component.
 *
 * @module evalkeeper/next/components
 */
import NextLink from "next/link.js";
import type { ComponentType } from "react";
import type { EvalComponents, LinkProps } from "../react/pieces.js";
import { RefreshWhile } from "./RefreshWhile.js";

export { RefreshWhile };

// Next.js bundles this, where the default import is the component; the
// cast only bridges how TypeScript types a CommonJS module's default.
const Link = NextLink as unknown as ComponentType<LinkProps>;

/** Next.js's `Link` and a `RefreshWhile` on its router. */
export const nextComponents = {
  Link,
  RefreshWhile,
} satisfies Partial<EvalComponents>;
