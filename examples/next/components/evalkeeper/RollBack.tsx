"use client";

import { useState } from "react";
import { rollBackSettings } from "@/lib/evalkeeper/actions";
import { Submit } from "./Submit";
import { Tip } from "./Tip";

/**
 * Rolls a feature back to an earlier version. The button stays off until
 * there's a note saying why: the note is kept with the version, for
 * whoever reads the history next.
 */
export function RollBack({
  suite,
  versionId,
  number,
}: {
  suite: string;
  versionId: string;
  number: number;
}) {
  const [reason, setReason] = useState("");
  const missing = reason.trim() === "";
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
      <input
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
      ) : (
        button
      )}
    </form>
  );
}
