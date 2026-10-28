"use client";

import { TextInput } from "./Controls";
import { useState } from "react";
import type { ChangeKind } from "@crowandraven/evalkeeper";
import { rollBackSettings } from "@/lib/evalkeeper/actions";
import { Submit } from "./Submit";
import { Tip } from "./Tip";

/**
 * Rolls a feature back to an earlier version. The button stays off until
 * there's a note saying why: the note is kept with the version, for
 * whoever reads the history next. Only settings go back, so a version made
 * by an instructions change says the instructions stay as they are now.
 */
export function RollBack({
  suite,
  versionId,
  number,
  kind,
}: {
  suite: string;
  versionId: string;
  number: number;
  /** How the version was made, for what rolling back to it does. */
  kind?: ChangeKind;
}) {
  const [reason, setReason] = useState("");
  const missing = reason.trim() === "";
  const note = WHAT_GOES_BACK[kind ?? "CHANGE"]?.(number);
  const button = (
    <Submit variant="quiet" disabled={missing}>
      Roll back to v{number}
    </Submit>
  );
  return (
    <form
      action={rollBackSettings}
      className="flex flex-wrap items-center gap-2"
    >
      <input type="hidden" name="suite" value={suite} />
      <input type="hidden" name="version" value={versionId} />
      <label htmlFor={`why-${versionId}`} className="sr-only">
        Why roll back to v{number}?
      </label>
      <TextInput
        id={`why-${versionId}`}
        name="reason"
        required
        value={reason}
        onChange={(e) => {
          setReason(e.target.value);
        }}
        placeholder="Why roll back?"
        className="rounded-md border border-line bg-card px-2 py-1 text-xs focus:border-accent focus:outline-none"
      />
      {missing ? (
        <Tip
          text="Say why you're rolling back first. The note is kept with the version, for whoever reads the history next."
          id={`rollback-${versionId}`}
        >
          {button}
        </Tip>
      ) : note ? (
        <Tip text={note} id={`rollback-${versionId}`}>
          {button}
        </Tip>
      ) : (
        button
      )}
    </form>
  );
}

/** What rolling back to a version does, when it's more than its settings. */
const WHAT_GOES_BACK: Partial<Record<ChangeKind, (n: number) => string>> = {
  DEPLOY: (n) =>
    `Makes v${n}'s settings live again. The instructions stay as they are now: a deploy changed them, and only a deploy changes them back.`,
  INSTRUCTIONS: (n) =>
    `Makes v${n}'s settings live again. The instructions stay as they are now: they were edited at runtime, so undo that edit where it was made.`,
  OUTSIDE: (n) =>
    `Makes v${n}'s settings, found changed outside these settings, live again.`,
};
