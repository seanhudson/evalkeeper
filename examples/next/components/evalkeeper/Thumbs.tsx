"use client";

import { Button, TextInput } from "@crowandraven/evalkeeper/react";
import { useState, useTransition } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { formText } from "@crowandraven/evalkeeper";

type Rating = "UP" | "DOWN";

/**
 * Thumbs up or down on one AI answer, with "what was wrong?" after a
 * thumbs down. Clicking the same thumb again takes the rating back.
 * `action` is your server action; it gets targetId, rating, and reason (or
 * clear=1), and looks the answer up itself.
 */
export function Thumbs({
  targetId,
  initial = null,
  action,
}: {
  targetId: string;
  initial?: Rating | null;
  action: (form: FormData) => Promise<void>;
}) {
  const [rating, setRating] = useState<Rating | null>(initial);
  const [asking, setAsking] = useState(false);
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();

  const send = (fields: Record<string, string>, after: () => void) => {
    const form = new FormData();
    form.set("targetId", targetId);
    for (const [k, v] of Object.entries(fields)) form.set(k, v);
    start(async () => {
      await action(form);
      after();
    });
  };

  const thumb = (value: Rating) => {
    const on = rating === value;
    const label = on
      ? "Take back your rating"
      : value === "UP"
        ? "Good answer"
        : "Not a good answer";
    return (
      <Button
        type="button"
        aria-label={label}
        title={label}
        aria-pressed={on}
        disabled={pending}
        onClick={() => {
          send(on ? { rating: value, clear: "1" } : { rating: value }, () => {
            setRating(on ? null : value);
            setAsking(!on && value === "DOWN");
            setSent(false);
          });
        }}
        className={`inline-flex h-8 w-8 items-center justify-center rounded-md border text-sm disabled:opacity-60 ${
          on
            ? "border-accent bg-tint text-accent"
            : "border-line bg-card text-muted hover:text-ink"
        }`}
      >
        {value === "UP" ? (
          <ThumbsUp aria-hidden className="h-4 w-4" />
        ) : (
          <ThumbsDown aria-hidden className="h-4 w-4" />
        )}
      </Button>
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1">
        {thumb("UP")}
        {thumb("DOWN")}
        {sent && (
          <span className="ml-2 text-sm text-muted">Thanks: that helps.</span>
        )}
      </div>
      {asking && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const reason = formText(new FormData(e.currentTarget), "reason");
            send({ rating: "DOWN", reason }, () => {
              setAsking(false);
              setSent(true);
            });
          }}
        >
          <label htmlFor={`why-${targetId}`} className="sr-only">
            What was wrong?
          </label>
          <TextInput
            id={`why-${targetId}`}
            name="reason"
            maxLength={1000}
            placeholder="What was wrong? (optional)"
            className="min-w-0 flex-1 rounded-md border border-line bg-card px-3 py-1.5 text-sm focus:border-accent focus:outline-none"
          />
          <Button
            type="submit"
            disabled={pending}
            className="rounded-md border border-line bg-card px-3 py-1.5 text-sm hover:bg-tint disabled:opacity-60"
          >
            Send
          </Button>
        </form>
      )}
    </div>
  );
}
