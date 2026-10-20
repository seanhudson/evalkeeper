import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { HealthStatus } from "@crowandraven/evalkeeper";

export const pct = (x: number) => `${Math.round(x * 100)}%`;

const STATUS: Record<HealthStatus, { label: string; tone: keyof typeof CHIP }> =
  {
    good: { label: "Good", tone: "live" },
    fair: { label: "Fair", tone: "warn" },
    improve: { label: "Needs work", tone: "serious" },
    few: { label: "Few cases", tone: "warn" },
    stale: { label: "Retest", tone: "warn" },
    untested: { label: "Untested", tone: "neutral" },
  };

/** A suite's health as a chip; the card's details say why. */
export function StatusBadge({ status }: { status: HealthStatus }) {
  const s = STATUS[status];
  return <Chip tone={s.tone}>{s.label}</Chip>;
}

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-lg border border-line bg-card p-5 ${className}`}
    >
      {children}
    </section>
  );
}

/** A score with a thin bar, for tables. */
export function Score({ right, total }: { right: number; total: number }) {
  const rate = total ? right / total : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="w-10 tabular-nums">{pct(rate)}</span>
      <span className="h-1.5 w-20 rounded-full bg-tint">
        <span
          className="block h-1.5 rounded-full bg-accent"
          style={{ width: `${rate * 100}%` }}
        />
      </span>
      <span className="text-xs text-muted tabular-nums">
        {right}/{total}
      </span>
    </div>
  );
}

const CHIP = {
  live: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
  fallback: "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-200",
  warn: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200",
  serious: "bg-red-50 text-red-800 dark:bg-red-500/10 dark:text-red-200",
  neutral: "bg-tint text-muted",
} as const;

/** A chip's color. */
export type ChipTone = keyof typeof CHIP;

/** A small rounded label: Live, Fallback, Retires …, serious, minor. */
export function Chip({
  tone,
  children,
}: {
  tone: keyof typeof CHIP;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-xs font-medium leading-none ${CHIP[tone]}`}
    >
      {children}
    </span>
  );
}

/** A link back to the page above, with an arrow. */
export function BackLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink"
    >
      <ArrowLeft aria-hidden className="h-4 w-4" />
      {children}
    </Link>
  );
}
