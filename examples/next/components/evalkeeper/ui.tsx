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
