import Link from "next/link";
import {
  describeChange,
  type ChangeKind,
  type HistoryEntry,
  type Settings,
} from "@crowandraven/evalkeeper";
import { rollBackSettings } from "@/lib/evalkeeper/actions";
import { Submit } from "./Submit";
import { InfoTip, Tip } from "./Tip";
import { Chip } from "./ui";
import { evalsPath } from "@/lib/evalkeeper/paths";

const KIND: Record<
  ChangeKind,
  { text: string; tone: "live" | "fallback" | "warn" | "neutral"; help: string }
> = {
  CHANGE: {
    text: "Changed",
    tone: "neutral",
    help: "A person changed a setting.",
  },
  PROMOTE: {
    text: "Promoted",
    tone: "live",
    help: "Made live or the fallback from a test, with the test as evidence.",
  },
  ROLLBACK: {
    text: "Rolled back",
    tone: "warn",
    help: "An earlier version made live again.",
  },
  DEPLOY: {
    text: "Deployed",
    tone: "fallback",
    help: "The instructions changed in code under the live settings.",
  },
};

type Evidence = { runId?: string | null; live?: string | null };

/**
 * A feature's settings history: every switch, newest first, with what
 * changed, who, why, and the evidence; any earlier version can be made
 * live again, with a reason.
 */
export function SettingsHistory({
  suite,
  entries,
  liveId,
  label,
  defaults,
}: {
  suite: string;
  entries: HistoryEntry[];
  liveId: string | null;
  label: (model: string) => string;
  /** The settings in code, shown as v1 until the first change. */
  defaults: Settings;
}) {
  return (
    <section className="space-y-3" aria-labelledby="history">
      <h2 id="history" className="text-lg font-semibold">
        Versions
        <InfoTip term="versions" />
      </h2>
      <HistoryEntries
        suite={suite}
        entries={entries}
        liveId={liveId}
        label={label}
        defaults={defaults}
      />
    </section>
  );
}

/**
 * The versions in a settings history, newest first, each with a rollback
 * unless it's live. For a page's history section or a card's history toggle.
 */
export function HistoryEntries({
  suite,
  entries,
  liveId,
  label,
  defaults,
  plain = false,
}: {
  suite: string;
  entries: HistoryEntry[];
  liveId: string | null;
  label: (model: string) => string;
  /** The settings in code, shown as v1 until the first change. */
  defaults: Settings;
  /** No tint behind each version, for a list already on a tint. */
  plain?: boolean;
}) {
  const box = `space-y-2 text-sm ${plain ? "py-2" : "rounded-md border border-line bg-card p-3"}`;
  if (entries.length === 0)
    return (
      <article aria-label="Version 1: Defaults" className={box}>
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium">v1</span>
          <Chip tone="neutral">Defaults</Chip>
          <Chip tone="live">Live now</Chip>
        </span>
        <p>
          {label(defaults.model)} live
          {defaults.fallbackModel
            ? ` · fallback ${label(defaults.fallbackModel)}`
            : " · no fallback"}
        </p>
        <p className="readable text-muted">
          The settings in code. The first change records them as v1, so
          there&apos;s always something to roll back to.
        </p>
      </article>
    );
  return (
    <div className="space-y-2">
      {entries.map((e) => {
        const kind = KIND[e.kind];
        const ev = (e.evidence ?? {}) as Evidence;
        const testId = ev.runId ?? ev.live ?? null;
        const isLive = e.to.id === liveId;
        return (
          <article
            key={e.id}
            aria-label={`Version ${e.to.number}: ${kind.text}`}
            className={box}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-medium">v{e.to.number}</span>
                <Tip text={kind.help} id={`kind-${e.id}`}>
                  <Chip tone={kind.tone}>{kind.text}</Chip>
                </Tip>
                {isLive && <Chip tone="live">Live now</Chip>}
              </span>
              <span className="text-xs text-muted">
                {e.by ?? "System"} · {e.createdAt.toLocaleString()}
              </span>
            </div>
            <ul className="readable list-disc pl-5">
              {(e.kind === "ROLLBACK"
                ? [`Back to v${e.to.number}: ${label(e.to.model)} live`]
                : e.kind === "DEPLOY"
                  ? ["Same models, new instructions"]
                  : describeChange(e.from, e.to, label)
              ).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            {e.reason && <p className="readable text-muted">{e.reason}</p>}
            <div className="flex flex-wrap items-center gap-3">
              {testId && (
                <Link
                  href={evalsPath(suite, "runs", testId)}
                  className="text-xs underline"
                >
                  The test behind it
                </Link>
              )}
              {!isLive && (
                <form
                  action={rollBackSettings}
                  className="flex flex-wrap items-center gap-2"
                >
                  <input type="hidden" name="suite" value={suite} />
                  <input type="hidden" name="version" value={e.to.id} />
                  <label htmlFor={`why-${e.id}`} className="sr-only">
                    Why roll back to v{e.to.number}?
                  </label>
                  <input
                    id={`why-${e.id}`}
                    name="reason"
                    required
                    placeholder="Why roll back?"
                    className="rounded-md border border-line bg-card px-2 py-1 text-xs focus:border-accent focus:outline-none"
                  />
                  <Submit variant="quiet">Roll back to v{e.to.number}</Submit>
                </form>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
