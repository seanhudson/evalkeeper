import type { HealthStatus } from "evalkeeper";

export const pct = (x: number) => `${Math.round(x * 100)}%`;

const STATUS: Record<HealthStatus, { label: string; tone: string }> = {
  good: { label: "Good", tone: "text-good" },
  fair: { label: "Fair", tone: "text-warn" },
  improve: { label: "Room to improve", tone: "text-bad" },
  few: { label: "Needs more cases", tone: "text-warn" },
  stale: { label: "Test again", tone: "text-warn" },
  untested: { label: "Not tested", tone: "text-muted" },
};

export function StatusBadge({ status }: { status: HealthStatus }) {
  const s = STATUS[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm ${s.tone}`}>
      <span className="h-2 w-2 rounded-full bg-current" />
      {s.label}
    </span>
  );
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
