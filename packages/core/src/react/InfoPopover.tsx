"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { Info, X } from "lucide-react";
import { Button } from "./pieces.js";

/**
 * Closes a popup on Escape or a click outside `ref`, while it's open.
 */
export function useDismiss(
  open: boolean,
  setOpen: (open: boolean) => void,
  ref: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!open) return;
    const onEvent = (e: MouseEvent | KeyboardEvent) => {
      if (
        e instanceof KeyboardEvent
          ? e.key === "Escape"
          : !ref.current?.contains(e.target as Node)
      )
        setOpen(false);
    };
    document.addEventListener("mousedown", onEvent);
    document.addEventListener("keydown", onEvent);
    return () => {
      document.removeEventListener("mousedown", onEvent);
      document.removeEventListener("keydown", onEvent);
    };
  }, [open, setOpen, ref]);
}

/** The X that closes a popup. */
export function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      type="button"
      aria-label="Close"
      title="Close"
      onClick={onClick}
      className="-mr-1 -mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted hover:bg-tint hover:text-ink"
    >
      <X aria-hidden className="h-4 w-4" />
    </Button>
  );
}

/**
 * An info button that opens more than a tooltip holds: a list, steps, a
 * guide. Opens on press, closes with its X, Escape, or a click outside.
 * For a sentence or two, use InfoTip.
 */
export function InfoPopover({
  label,
  children,
}: {
  /** What the popup is, for screen readers: "About the answer key". */
  label: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(open, setOpen, ref);
  return (
    <div
      ref={ref}
      className="relative ml-1 inline-flex align-middle text-sm font-normal"
    >
      <Button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label}
        onClick={() => {
          setOpen(!open);
        }}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted hover:text-ink"
      >
        <Info aria-hidden className="h-3.5 w-3.5" />
      </Button>
      {open && (
        <div
          role="dialog"
          aria-label={label}
          className="absolute left-0 top-full z-20 mt-2 max-h-[70vh] w-[min(28rem,calc(100vw-2rem))] overflow-y-auto rounded-md border border-line bg-card p-4 shadow-lg"
        >
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1 space-y-3">{children}</div>
            <CloseButton
              onClick={() => {
                setOpen(false);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
