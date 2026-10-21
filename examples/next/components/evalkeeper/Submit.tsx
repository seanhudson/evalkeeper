"use client";

import { LoaderCircle } from "lucide-react";
import { useFormStatus } from "react-dom";

/**
 * A button that isn't the page's main action: the app's accent as an
 * outline, so it still reads as a button in the app's colors (set
 * `--accent` in evalkeeper.css).
 */
export const QUIET_BUTTON =
  "border border-accent/40 bg-card text-accent hover:bg-accent/10";

/** A submit button that spins while its form's action runs. */
export function Submit({
  children,
  variant = "primary",
  disabled = false,
}: {
  children: React.ReactNode;
  variant?: "primary" | "quiet";
  /** Off until the form is ready; wrap it in a `<Tip>` saying why. */
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className={`inline-flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-1.5 text-sm disabled:opacity-60 ${
        variant === "primary" ? "bg-accent text-white" : QUIET_BUTTON
      }`}
    >
      {pending && <Spinner />}
      {children}
    </button>
  );
}

/**
 * An icon-only submit button. `label` is its accessible name; wrap it in a
 * `<Tip control>` for the tooltip. The icon turns into the loader while the
 * action runs.
 */
export function IconSubmit({
  label,
  icon,
}: {
  label: string;
  icon: React.ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      aria-label={label}
      disabled={pending}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-line bg-card text-ink hover:bg-tint disabled:opacity-60"
    >
      {pending ? <Spinner /> : icon}
    </button>
  );
}

export function Spinner() {
  return <LoaderCircle aria-hidden className="h-3.5 w-3.5 animate-spin" />;
}
