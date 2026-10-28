"use client";

import Link from "next/link";
import { EvalComponentsProvider } from "@crowandraven/evalkeeper/react";
import { RefreshWhile } from "@/components/evalkeeper/RefreshWhile";

/**
 * Your app's own components for Evalkeeper's screens, so they look like
 * the rest of your app. Name a piece to use yours and leave it out to keep
 * Evalkeeper's: start with the link and button, and add more when you want
 * them (`EvalComponents` lists them all). Each gets the props Evalkeeper's
 * own would, `className` included, which yours can use or ignore. Your
 * components must be client components. This file is yours: copying the
 * pages again never overwrites it.
 */
export function AppComponents({ children }: { children: React.ReactNode }) {
  return (
    // Next.js's Link, so moving between eval pages doesn't reload, and its
    // router, so a page refreshes while a test runs.
    <EvalComponentsProvider components={{ Link, RefreshWhile }}>
      {children}
    </EvalComponentsProvider>
  );
}
