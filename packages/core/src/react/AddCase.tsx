"use client";

import { Button, Card } from "./pieces.js";
import { QUIET_BUTTON } from "./format.js";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Plus } from "lucide-react";

/** The address's hash, kept current; "" on the server. */
const hashNow = () => window.location.hash;
const noHash = () => "";
const onHash = (change: () => void) => {
  window.addEventListener("hashchange", change);
  return () => {
    window.removeEventListener("hashchange", change);
  };
};

/**
 * A section's header row with an "Add a case" button at the top right,
 * beside `tools`; the button opens `form` below the header. With `draft`,
 * a second tab drafts cases from a request in the person's own words. A
 * link to "#add-case=<topic>" opens it with that topic in the tags.
 */
export function AddCaseHeader({
  heading,
  tools,
  form,
  draft,
}: {
  heading: React.ReactNode;
  tools?: React.ReactNode;
  /** The add-a-case form; null hides the button. */
  form: React.ReactNode;
  /** A form that drafts cases from a description; null for none. */
  draft?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"write" | "describe">("write");
  const hash = useSyncExternalStore(onHash, hashNow, noHash);
  const topic = hash.startsWith("#add-case=")
    ? decodeURIComponent(hash.slice("#add-case=".length))
    : null;
  const shown = open || topic !== null;
  // A topic from the link goes into the new case's tags.
  useEffect(() => {
    if (!topic) return;
    const tags = document.getElementById("new-tags");
    if (tags instanceof HTMLInputElement && !tags.value.includes(topic))
      tags.value = tags.value ? `${tags.value}, ${topic}` : topic;
    tags?.scrollIntoView({ block: "center" });
  }, [topic]);
  const close = () => {
    setOpen(false);
    if (topic !== null)
      history.replaceState(null, "", window.location.pathname);
  };
  const tabClass = (on: boolean) =>
    `rounded-md px-3 py-1.5 text-sm ${on ? "bg-tint font-medium text-ink" : "text-muted hover:text-ink"}`;
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        {heading}
        <div className="flex items-center gap-2">
          {form && (
            <Button
              type="button"
              aria-expanded={shown}
              onClick={() => {
                if (shown) close();
                else setOpen(true);
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
      {shown && form && (
        <Card className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {draft ? (
              <div role="tablist" className="flex gap-1">
                <Button
                  type="button"
                  role="tab"
                  aria-selected={tab === "write"}
                  onClick={() => {
                    setTab("write");
                  }}
                  className={tabClass(tab === "write")}
                >
                  Write one
                </Button>
                <Button
                  type="button"
                  role="tab"
                  aria-selected={tab === "describe"}
                  onClick={() => {
                    setTab("describe");
                  }}
                  className={tabClass(tab === "describe")}
                >
                  Describe them
                </Button>
              </div>
            ) : (
              <h3 className="font-medium">New case</h3>
            )}
            <Button
              type="button"
              onClick={close}
              className="text-sm text-muted hover:text-ink"
            >
              Cancel
            </Button>
          </div>
          {draft && tab === "describe" ? draft : form}
        </Card>
      )}
    </>
  );
}

/**
 * Opens the case a link points at ("#case-…", from Answer key health's
 * "Fix the answer"), on load and whenever the address changes, and
 * scrolls it into view. Draws nothing.
 */
export function OpenLinkedCase() {
  useEffect(() => {
    const open = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!id.startsWith("case-")) return;
      const el = document.getElementById(id);
      if (el instanceof HTMLDetailsElement) {
        el.open = true;
        el.scrollIntoView({ block: "start" });
      }
    };
    open();
    window.addEventListener("hashchange", open);
    return () => {
      window.removeEventListener("hashchange", open);
    };
  }, []);
  return null;
}
