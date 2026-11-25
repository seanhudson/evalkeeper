"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import type { GlossaryTerm } from "../index.js";
import type { FormAction } from "./app.js";
import {
  Button,
  Chip,
  Spinner,
  Tip,
  useNotify,
  type ChipTone,
} from "./pieces.js";

// Answers confirmed here, ahead of the page's refresh: saving while the
// save runs, saved once it's done.
type Here = "saving" | "saved";
const confirmedHere = new Map<string, Here>();
const listeners = new Set<() => void>();
function setConfirmedHere(labelId: string, now: Here | null) {
  if (now) confirmedHere.set(labelId, now);
  else confirmedHere.delete(labelId);
  for (const l of listeners) l();
}
function useConfirmedHere(labelId: string): Here | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => confirmedHere.get(labelId) ?? null,
    () => null,
  );
}

type Status = { text: string; tone: ChipTone; term: GlossaryTerm };

/**
 * A case's answer status, which turns to Confirmed the moment someone
 * confirms it there, with a spinner until the save finishes.
 */
export function CaseStatusChip({
  labelId,
  status,
  confirmed,
  id,
}: {
  /** The answer it describes; null for a case without one. */
  labelId: string | null;
  status: Status;
  /** How a confirmed answer shows. */
  confirmed: Status;
  /** For the tooltip. */
  id: string;
}) {
  const saved = useConfirmedHere(labelId ?? "");
  const here = labelId ? saved : null;
  const now = here ? confirmed : status;
  return (
    <Tip term={now.term} id={id} align="end">
      <Chip tone={now.tone}>
        <span className="inline-flex items-center gap-1">
          {here === "saving" && (
            <>
              <Spinner />
              <span className="sr-only">Saving: </span>
            </>
          )}
          {now.text}
        </span>
      </Chip>
    </Tip>
  );
}

/**
 * Confirms a case's pending answer and moves straight on: the case shows
 * Confirmed and closes, and the next one waiting for a confirmation opens,
 * while the save and the page's refresh finish behind it. If the save
 * fails, the case opens again and says so (or your app's toast does).
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
  const [saving, start] = useTransition();
  const [failed, setFailed] = useState(false);
  const notify = useNotify();

  function confirm(button: HTMLElement) {
    setFailed(false);
    setConfirmedHere(labelId, "saving");
    const here = button.closest("details");
    if (here) {
      here.open = false;
      let next = here.nextElementSibling;
      while (
        next &&
        !(next instanceof HTMLDetailsElement && next.dataset.pending === "true")
      )
        next = next.nextElementSibling;
      if (next instanceof HTMLDetailsElement) {
        next.open = true;
        next.scrollIntoView({ block: "nearest" });
      }
    }
    const form = new FormData();
    form.set("suite", suite);
    form.set("label", labelId);
    start(async () => {
      try {
        await action(form);
        setConfirmedHere(labelId, "saved");
        notify?.("success", "Answer confirmed");
      } catch {
        setConfirmedHere(labelId, null);
        if (here) {
          here.open = true;
          here.scrollIntoView({ block: "nearest" });
        }
        if (notify)
          notify("error", "Couldn't confirm that answer. Please try again.");
        else setFailed(true);
      }
    });
  }

  return (
    <>
      <Button
        type="button"
        disabled={saving}
        onClick={(e) => {
          confirm(e.currentTarget);
        }}
        className="inline-flex items-center gap-2 whitespace-nowrap rounded-md bg-accent px-3 py-1.5 text-sm text-white disabled:opacity-60"
      >
        {saving && <Spinner />}
        Confirm this answer
      </Button>
      {failed && (
        <p role="alert" className="w-full text-xs text-bad">
          Couldn&apos;t confirm that answer. Please try again.
        </p>
      )}
    </>
  );
}
