"use client";

import { Button } from "./Controls";
import { useState } from "react";
import { Plus } from "lucide-react";
import { QUIET_BUTTON } from "./Submit";
import { Card } from "./ui";

/**
 * A section's header row with an "Add a case" button at the top right,
 * beside `tools`; the button opens `form` below the header.
 */
export function AddCaseHeader({
  heading,
  tools,
  form,
}: {
  heading: React.ReactNode;
  tools?: React.ReactNode;
  /** The add-a-case form; null hides the button. */
  form: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        {heading}
        <div className="flex items-center gap-2">
          {form && (
            <Button
              type="button"
              aria-expanded={open}
              onClick={() => {
                setOpen(!open);
              }}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm ${QUIET_BUTTON}`}
            >
              <Plus aria-hidden className="h-4 w-4" />
              Add a case
            </Button>
          )}
          {tools}
        </div>
      </div>
      {open && form && (
        <Card className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-medium">New case</h3>
            <Button
              type="button"
              onClick={() => {
                setOpen(false);
              }}
              className="text-sm text-muted hover:text-ink"
            >
              Cancel
            </Button>
          </div>
          {form}
        </Card>
      )}
    </>
  );
}
