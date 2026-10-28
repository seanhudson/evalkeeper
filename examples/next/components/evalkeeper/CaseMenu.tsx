"use client";

import { Button } from "./Controls";
import { useEffect, useRef, useState } from "react";
import { EllipsisVertical } from "lucide-react";

/**
 * A case's menu, in the top right of the open case: edit its answer (the
 * form opens below the menu's row) and retire it. Closes on a click
 * outside or Escape.
 */
export function CaseMenu({
  suite,
  caseId,
  editLabel,
  edit,
  retire,
  startEditing = false,
}: {
  suite: string;
  caseId: string;
  /** "Edit answer" or "Write the answer"; null when there's no form. */
  editLabel: string | null;
  /** The answer form, shown when someone picks editLabel. */
  edit: React.ReactNode;
  /** Your server action that retires a case (gets suite and case). */
  retire: (form: FormData) => Promise<void>;
  /** Open the form from the start, for a case with no answer yet. */
  startEditing?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(startEditing);
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

  const item =
    "block w-full rounded px-3 py-1.5 text-left text-sm hover:bg-tint";

  return (
    <>
      <div ref={ref} className="absolute right-3 top-0 z-10">
        <Button
          type="button"
          aria-label="Case actions"
          title="Case actions"
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
            className="absolute right-0 mt-1 w-44 rounded-md border border-line bg-card p-1 shadow-lg"
          >
            {editLabel && (
              <Button
                type="button"
                role="menuitem"
                className={item}
                onClick={() => {
                  setEditing(true);
                  setOpen(false);
                }}
              >
                {editLabel}
              </Button>
            )}
            <form action={retire}>
              <input type="hidden" name="suite" value={suite} />
              <input type="hidden" name="case" value={caseId} />
              <Button
                type="submit"
                role="menuitem"
                className={`${item} text-bad`}
              >
                Retire case
              </Button>
            </form>
          </div>
        )}
      </div>
      {editing && (
        <div className="space-y-3 rounded-md bg-tint p-3">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-medium">{editLabel}</h4>
            <Button
              type="button"
              onClick={() => {
                setEditing(false);
              }}
              className="text-sm text-muted hover:text-ink"
            >
              Cancel
            </Button>
          </div>
          {edit}
        </div>
      )}
    </>
  );
}
