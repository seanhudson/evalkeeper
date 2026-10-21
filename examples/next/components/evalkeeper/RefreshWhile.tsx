"use client";

import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";

/**
 * Refreshes the page every few seconds while something runs, waiting for
 * each refresh to land before scheduling the next. A refresh on a timer
 * cancels one still in flight, so when the page takes longer to render
 * than the interval (the board against a remote database), no refresh ever
 * lands and the page never updates (#25).
 */
export function RefreshWhile({
  active,
  ms = 2000,
}: {
  active: boolean;
  ms?: number;
}) {
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();
  useEffect(() => {
    if (!active || refreshing) return;
    const t = setTimeout(() => {
      startTransition(() => {
        router.refresh();
      });
    }, ms);
    return () => {
      clearTimeout(t);
    };
  }, [active, refreshing, ms, router]);
  return null;
}
