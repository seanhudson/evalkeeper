"use client";

import { useRef, useState } from "react";
import { RotateCw } from "lucide-react";
import { rescoreMessage } from "../rescore.js";
import type { RescoreAction } from "./app.js";
import { IconSubmit, Tip, useNotify } from "./pieces.js";

/** The most requests one press makes, so a rescore that can't finish stops. */
const MAX_REQUESTS = 30;

/**
 * Rescore tests, for a suite's answer key. Each request rescores what
 * fits in the time limit and says what's left, so the button goes on in
 * a new request until it's done, then says what it cost: free, or what
 * the judge spent. If a request fails part way (the page ran out of time),
 * it says how far it got, and pressing again picks up where it left off.
 */
export function RescoreButton({
  suite,
  action,
  judged,
}: {
  suite: string;
  /** Your rescore action. */
  action: RescoreAction;
  /** The suite's checks ask the judge (`usesJudge`): its rescore may cost a little. */
  judged: boolean;
}) {
  const notify = useNotify();
  // Tests done by an earlier press that stopped part way.
  const done = useRef<string[]>([]);
  const [note, setNote] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  async function rescore() {
    setNote(null);
    let total = 0;
    let left = 0;
    let judgeCostUsd = 0;
    let failed = false;
    for (let i = 0; i < MAX_REQUESTS; i++) {
      const form = new FormData();
      form.set("suite", suite);
      for (const id of done.current) form.append("done", id);
      let r;
      try {
        r = await action(form);
      } catch {
        failed = true;
        break;
      }
      if (!r) {
        left = 0;
        break;
      }
      if (r.waiting) {
        show({ type: "error", text: r.waiting });
        return;
      }
      done.current.push(...r.rescored);
      total = r.total;
      left = r.left;
      judgeCostUsd += r.judgeCostUsd;
      // Finished, or made no headway: never ask again for nothing.
      if (!r.left || !r.rescored.length) break;
    }
    const rescored = done.current.length;
    const m = rescoreMessage({
      rescored,
      total: Math.max(total, rescored + left),
      left,
      judgeCostUsd,
      judged,
      failed,
    });
    // Done: the next press starts over. Stopped part way: it picks up here.
    if (!failed && left === 0) done.current = [];
    show(m);
  }

  function show(m: { type: "success" | "error"; text: string }) {
    if (notify) notify(m.type, m.text);
    else setNote(m);
  }

  return (
    <form action={rescore} className="flex items-center gap-2">
      <Tip
        control
        term={judged ? "rescoreJudged" : "rescore"}
        side="bottom"
        align="end"
      >
        <IconSubmit
          label="Rescore tests"
          icon={<RotateCw aria-hidden className="h-4 w-4" />}
        />
      </Tip>
      {note && (
        <p
          role={note.type === "error" ? "alert" : "status"}
          className={`readable text-xs ${note.type === "error" ? "text-bad" : "text-muted"}`}
        >
          {note.text}
        </p>
      )}
    </form>
  );
}
