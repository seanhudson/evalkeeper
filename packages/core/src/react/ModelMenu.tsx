"use client";

import { useEffect, useRef, useState } from "react";
import { EllipsisVertical } from "lucide-react";
import { Button } from "./pieces.js";
import type { FormAction } from "./app.js";

/**
 * A model row's menu: test it (with what that costs now), make it live,
 * or make it the fallback, where the row allows either. Keeps the model
 * table narrow. Closes on a click outside or Escape.
 */
export function ModelMenu({
  suite,
  model,
  label,
  test,
  makeLive,
  makeFallback,
  effort,
}: {
  suite: string;
  model: string;
  /** The model's name, for the button's accessible name. */
  label: string;
  /**
   * Your testModel action, its words ("Test", "Test again"), and what
   * testing costs now ("free, all 34 reused"), when known.
   */
  test?: { action: FormAction; text: string; note: string | null };
  /** Your makeLive action, when the model can be made live. */
  makeLive: FormAction | null;
  /** Your makeFallback action, when it can be the fallback. */
  makeFallback: FormAction | null;
  /**
   * The row's reasoning setting, for a row at a setting other than the
   * feature's (null: the model's own default); unset for the others.
   */
  effort?: string | null | undefined;
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

  if (!test && !makeLive && !makeFallback) return null;
  const item =
    "block w-full rounded px-3 py-1.5 text-left text-sm hover:bg-tint";
  const choice = (action: FormAction, text: string, note?: string | null) => (
    // Closes once chosen (after the submit is read), so the open menu
    // doesn't cover the rows below it.
    <form
      action={action}
      onSubmit={() =>
        setTimeout(() => {
          setOpen(false);
        })
      }
    >
      <input type="hidden" name="suite" value={suite} />
      <input type="hidden" name="model" value={model} />
      {effort !== undefined && (
        <input type="hidden" name="effort" value={effort ?? "default"} />
      )}
      <Button type="submit" role="menuitem" className={item}>
        {text}
        {note && <span className="block text-xs text-muted">{note}</span>}
      </Button>
    </form>
  );

  return (
    <div ref={ref} className="relative">
      <Button
        type="button"
        aria-label={`Choose ${label}`}
        title={`Choose ${label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
        }}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-tint hover:text-ink"
      >
        <EllipsisVertical aria-hidden className="h-4 w-4" />
      </Button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 w-56 rounded-md border border-line bg-card p-1 shadow-lg"
        >
          {test && choice(test.action, test.text, test.note)}
          {makeLive && choice(makeLive, "Make live")}
          {makeFallback && choice(makeFallback, "Make fallback")}
        </div>
      )}
    </div>
  );
}
