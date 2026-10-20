import Link from "next/link";
import { describeChange, type ChangeKind, type HistoryEntry } from "evalkeeper";
import { rollBackSettings } from "@/lib/evalkeeper/actions";
import { Submit } from "./Submit";
import { InfoTip, Tip } from "./Tip";
import { Card, Chip } from "./ui";
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
}: {
  suite: string;
  entries: HistoryEntry[];
  liveId: string | null;
  label: (model: string) => string;
}) {
  return (
    <section className="space-y-3" aria-labelledby="history">
      <h2 id="history" className="text-lg font-semibold">
        Settings history
        <InfoTip term="settingsHistory" />
      </h2>
      {entries.length === 0 ? (
        <p className="readable text-sm text-muted">
          Running on the defaults from code. The first change records them as
          version 1, so there&apos;s always something to roll back to.
        </p>
      ) : (
        <Card className="space-y-2">
          {entries.map((e) => {
            const kind = KIND[e.kind];
            const ev = (e.evidence ?? {}) as Evidence;
            const testId = ev.runId ?? ev.live ?? null;
            const isLive = e.to.id === liveId;
            return (
              <article
                key={e.id}
                aria-label={`Version ${e.to.number}: ${kind.text}`}
                className="space-y-2 rounded-md bg-tint p-3 text-sm"
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
                      <Submit variant="quiet">
                        Roll back to v{e.to.number}
                      </Submit>
                    </form>
                  )}
                </div>
              </article>
            );
          })}
        </Card>
      )}
    </section>
  );
}
