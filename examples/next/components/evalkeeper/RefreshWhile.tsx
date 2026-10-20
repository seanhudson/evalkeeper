"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Refreshes the page every few seconds while something runs. */
export function RefreshWhile({
  active,
  ms = 2000,
}: {
  active: boolean;
  ms?: number;
}) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), ms);
    return () => clearInterval(t);
  }, [active, ms, router]);
  return null;
}
