"use client";

import { useState, type ReactNode } from "react";
import { Button } from "./pieces.js";

/**
 * Long content, folded: `short` shows until the person opens the rest.
 * For a posting's text or a long list, so a case reads at a glance.
 */
export function Folded({
  short,
  children,
  more,
}: {
  /** What shows while folded. */
  short: ReactNode;
  /** The whole of it. */
  children: ReactNode;
  /** The button's label: "Show all 24" or "Show the whole text". */
  more: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {open ? children : short}
      <Button
        type="button"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
        }}
        className="mt-1 text-xs text-accent hover:underline"
      >
        {open ? "Show less" : more}
      </Button>
    </>
  );
}
