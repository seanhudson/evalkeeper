"use client";

import type { FormAction } from "./app.js";
import { Submit } from "./pieces.js";

/**
 * Confirms a case's pending answer and moves straight on: this case closes
 * and the next one waiting for a confirmation opens, while the save and
 * the page's refresh finish behind it. Reviewing a run of drafts shouldn't
 * wait on the whole page each time.
 */
export function ConfirmAnswer({
  suite,
  labelId,
  action,
}: {
  suite: string;
  labelId: string;
  /** Your confirmAnswer action. */
  action: FormAction;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        const here = e.currentTarget.closest("details");
        if (!here) return;
        here.open = false;
        let next = here.nextElementSibling;
        while (
          next &&
          !(
            next instanceof HTMLDetailsElement &&
            next.dataset.pending === "true"
          )
        )
          next = next.nextElementSibling;
        if (next instanceof HTMLDetailsElement) {
          next.open = true;
          next.scrollIntoView({ block: "nearest" });
        }
      }}
    >
      <input type="hidden" name="suite" value={suite} />
      <input type="hidden" name="label" value={labelId} />
      <Submit>Confirm this answer</Submit>
    </form>
  );
}
