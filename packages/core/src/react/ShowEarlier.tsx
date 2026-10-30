"use client";

import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "./pieces.js";

/**
 * A section whose earlier items stay folded until asked for: the heading
 * with a toggle across from it, the recent items, then the rest when open.
 */
export function ShowEarlier({
  heading,
  recent,
  earlier,
  noun,
}: {
  heading: React.ReactNode;
  recent: React.ReactNode;
  earlier: React.ReactNode[];
  /** What the items are, plural: "versions". */
  noun: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <>
      <div className="flex items-center justify-between gap-4">
        {heading}
        <Button
          type="button"
          aria-expanded={open}
          aria-controls={open ? id : undefined}
          onClick={() => {
            setOpen(!open);
          }}
          className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink"
        >
          {open
            ? `Hide earlier ${noun}`
            : `Show ${earlier.length} earlier ${earlier.length === 1 ? noun.replace(/s$/, "") : noun}`}
          <ChevronDown
            aria-hidden
            className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </Button>
      </div>
      <div className="space-y-2">
        {recent}
        {open && (
          <div id={id} className="space-y-2">
            {earlier}
          </div>
        )}
      </div>
    </>
  );
}
