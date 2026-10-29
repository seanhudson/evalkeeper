"use client";

import { EvalComponentsProvider } from "@crowandraven/evalkeeper/react";
import { nextComponents } from "@crowandraven/evalkeeper/next/components";

/**
 * Your app's own components for Evalkeeper's screens, so they look like
 * the rest of your app. Next.js's link and refresh come first; name a
 * piece after them to use yours, and leave it out to keep Evalkeeper's
 * (`EvalComponents` lists them all). Each gets the props Evalkeeper's own
 * would, `className` included, which yours can use or ignore. Your
 * components must be client components. This file is yours: `add pages`
 * never overwrites it.
 */
export function AppComponents({ children }: { children: React.ReactNode }) {
  return (
    <EvalComponentsProvider components={{ ...nextComponents }}>
      {children}
    </EvalComponentsProvider>
  );
}
