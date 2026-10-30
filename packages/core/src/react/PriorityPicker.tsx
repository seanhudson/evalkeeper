"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { Button, Select, Submit, TextInput } from "./pieces.js";
import type { FormAction } from "./app.js";
import type { SuitePriority } from "../types.js";

type Favor = SuitePriority["favor"];

/** The choices when changing it: accuracy is always held. */
const CHOICES = {
  quality: "Accuracy alone",
  speed: "Speed",
  cost: "Cost",
} as const;

/**
 * The "Favors …" chip as a button: it opens what the priority means and
 * a form to change it, saved as a new settings version with an optional
 * reason, so it shows under Versions and can be rolled back. Closes with
 * its X, Escape, or a click outside.
 */
export function PriorityPicker({
  action,
  suite,
  favor,
  own,
  label,
  why,
}: {
  action: FormAction;
  suite: string;
  favor: Favor;
  /** The suite's own priority, from its code. */
  own: Favor;
  /** The chip's words: "Favors speed". */
  label: string;
  /** What the priority means for the suggestion, as a sentence. */
  why: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (
        e instanceof KeyboardEvent
          ? e.key === "Escape"
          : !ref.current?.contains(e.target as Node)
      )
        setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative text-sm font-normal">
      <Button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
        }}
        className="inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-full bg-tint px-2.5 text-xs font-medium leading-none text-muted hover:text-ink"
      >
        {label}
        <ChevronDown aria-hidden className="h-3 w-3" />
      </Button>
      {open && (
        <div
          role="dialog"
          aria-label="What this feature favors"
          className="absolute left-0 z-20 mt-2 w-80 rounded-md border border-line bg-card p-4 shadow-lg"
        >
          <div className="flex items-start justify-between gap-3">
            <p className="text-muted">{why}</p>
            <Button
              type="button"
              aria-label="Close"
              title="Close"
              onClick={() => {
                setOpen(false);
              }}
              className="-mr-1 -mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted hover:bg-tint hover:text-ink"
            >
              <X aria-hidden className="h-4 w-4" />
            </Button>
          </div>
          <form
            action={action}
            // Closes once saved (after the submit is read).
            onSubmit={() =>
              setTimeout(() => {
                setOpen(false);
              })
            }
            className="mt-4 space-y-3"
          >
            <input type="hidden" name="suite" value={suite} />
            <div>
              <label htmlFor="favor" className="block font-medium">
                Once accuracy holds, favor
              </label>
              <Select
                id="favor"
                name="favor"
                defaultValue={favor}
                className="mt-1 w-full rounded-md border border-line bg-card px-3 py-2"
              >
                {(["quality", "speed", "cost"] as const).map((f) => (
                  <option key={f} value={f}>
                    {CHOICES[f]}
                    {f === own ? " (the suite's own)" : ""}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label htmlFor="favor-reason" className="block font-medium">
                Why? <span className="font-normal text-muted">(optional)</span>
              </label>
              <TextInput
                id="favor-reason"
                name="reason"
                maxLength={300}
                className="mt-1 w-full rounded-md border border-line bg-card px-3 py-2"
              />
            </div>
            <Submit>Save as a new version</Submit>
          </form>
        </div>
      )}
    </div>
  );
}
