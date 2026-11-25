"use client";

import { QUIET_BUTTON } from "./format.js";

import { Button } from "./pieces.js";
import { useState } from "react";
import { Menu, MenuButton, MenuForm } from "./Menu.js";
import { CloseButton } from "./InfoPopover.js";

/**
 * A case's menu, in the top right of the open case: edit its answer (the
 * form opens below the menu's row) and retire it. The eval pages' one
 * `Menu`.
 */
export function CaseMenu({
  suite,
  caseId,
  editLabel,
  edit,
  retire,
  startEditing = false,
  review,
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
  /**
   * For an answer nobody has confirmed yet (pending or provisional): the
   * confirm button, shown with **Edit answer** beside it, in plain sight.
   */
  review?: React.ReactNode;
}) {
  const [editing, setEditing] = useState(startEditing);

  return (
    <>
      <Menu
        label="Case actions"
        width="w-44"
        className="absolute right-3 top-0 z-10"
      >
        {editLabel && (
          <MenuButton
            onSelect={() => {
              setEditing(true);
            }}
          >
            {editLabel}
          </MenuButton>
        )}
        <MenuForm action={retire} fields={{ suite, case: caseId }} danger>
          Retire case
        </MenuForm>
      </Menu>
      {review && !editing && (
        <div className="flex flex-wrap items-center gap-2">
          {review}
          {editLabel && (
            <Button
              type="button"
              onClick={() => {
                setEditing(true);
              }}
              className={`rounded-md px-3 py-1.5 text-sm ${QUIET_BUTTON}`}
            >
              {editLabel}
            </Button>
          )}
        </div>
      )}
      {editing && (
        <div className="space-y-3 rounded-md bg-tint p-3">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-medium">{editLabel}</h4>
            <CloseButton
              onClick={() => {
                setEditing(false);
              }}
            />
          </div>
          {edit}
        </div>
      )}
    </>
  );
}
