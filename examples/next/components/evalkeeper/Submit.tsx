"use client";

import { useFormStatus } from "react-dom";

/** A submit button that spins while its form's action runs. */
export function Submit({
  children,
  variant = "primary",
}: {
  children: React.ReactNode;
  variant?: "primary" | "quiet";
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`inline-flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-1.5 text-sm disabled:opacity-60 ${
        variant === "primary"
          ? "bg-accent text-white"
          : "border border-line bg-card text-ink hover:bg-tint"
      }`}
    >
      {pending && <Spinner />}
      {children}
    </button>
  );
}

export function Spinner() {
  return (
    <span
      aria-hidden
      className="inline-block h-3.5 w-3.5 animate-spin rounded-full border border-current border-t-transparent"
    />
  );
}
