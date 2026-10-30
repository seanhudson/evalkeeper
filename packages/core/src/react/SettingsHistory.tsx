import { LINK } from "./format.js";
import {
  GLOSSARY,
  describeChange,
  type ChangeKind,
  type HistoryEntry,
  type Settings,
} from "../index.js";
import { RollBack } from "./RollBack.js";
import { ShowEarlier } from "./ShowEarlier.js";
import { Link, Chip, InfoTip, Tip, LocalDate } from "./pieces.js";
import { evalsPath, type EvalAppConfig } from "./app.js";

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
    text: "New instructions",
    tone: "fallback",
    help: GLOSSARY.newInstructions,
  },
  OUTSIDE: {
    text: "Changed outside",
    tone: "warn",
    help: GLOSSARY.changedOutside,
  },
  INSTRUCTIONS: {
    text: "Instructions edited",
    tone: "fallback",
    help: GLOSSARY.instructionsEdited,
  },
};

/** A version's card, on the page's background. */
const BOX = "space-y-2 rounded-md border border-line bg-card p-3 text-sm";

type Evidence = { runId?: string | null; live?: string | null };

/**
 * A feature's settings history: every switch, newest first, with what
 * changed, who, why, and the evidence; any earlier version can be made
 * live again, with a reason. The newest and live versions show; earlier
 * ones open with a toggle.
 */
export function SettingsHistory({
  app,
  suite,
  entries,
  liveId,
  label,
  defaults,
}: {
  /** Your screens' configuration. */
  app: EvalAppConfig;
  suite: string;
  entries: HistoryEntry[];
  liveId: string | null;
  label: (model: string) => string;
  /** The settings in code, shown as v1 until the first change. */
  defaults: Settings;
}) {
  const heading = (
    <h2 id="history" className="text-lg font-semibold">
      Versions
      <InfoTip term="versions" />
    </h2>
  );
  // The newest version shows, and the live one when it's older (the first
  // that points at it: a rollback points at the version it restored).
  const live = entries.findIndex((e) => e.to.id === liveId);
  const recent = (_e: HistoryEntry, i: number) => i === 0 || i === live;
  const entry = (e: HistoryEntry) => (
    <VersionEntry key={e.id} {...{ app, suite, e, liveId, label, box: BOX }} />
  );
  if (entries.some((e, i) => !recent(e, i)))
    return (
      <section className="space-y-3" aria-labelledby="history">
        <ShowEarlier
          heading={heading}
          noun="versions"
          recent={entries.filter(recent).map(entry)}
          earlier={entries.filter((e, i) => !recent(e, i)).map(entry)}
        />
      </section>
    );
  return (
    <section className="space-y-3" aria-labelledby="history">
      {heading}
      <HistoryEntries
        app={app}
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
  app,
  suite,
  entries,
  liveId,
  label,
  defaults,
  plain = false,
}: {
  /** Your screens' configuration. */
  app: EvalAppConfig;
  suite: string;
  entries: HistoryEntry[];
  liveId: string | null;
  label: (model: string) => string;
  /** The settings in code, shown as v1 until the first change. */
  defaults: Settings;
  /** No tint behind each version, for a list already on a tint. */
  plain?: boolean;
}) {
  const box = plain ? "space-y-2 py-2 text-sm" : BOX;
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
      {entries.map((e) => (
        <VersionEntry key={e.id} {...{ app, suite, e, liveId, label, box }} />
      ))}
    </div>
  );
}

/** One version: what changed, who and when, why, its evidence, and rollback. */
function VersionEntry({
  app,
  suite,
  e,
  liveId,
  label,
  box,
}: {
  app: EvalAppConfig;
  suite: string;
  e: HistoryEntry;
  liveId: string | null;
  label: (model: string) => string;
  box: string;
}) {
  const kind = KIND[e.kind];
  const ev = (e.evidence ?? {}) as Evidence;
  const testId = ev.runId ?? ev.live ?? null;
  const isLive = e.to.id === liveId;
  // Said outright: "same models" read as the app switching models.
  const unchanged = (v: typeof e.to) =>
    `Models unchanged: ${label(v.model)} live${v.fallbackModel ? `, ${label(v.fallbackModel)} fallback` : ""}`;
  return (
    <article
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
          {e.by ?? (e.kind === "OUTSIDE" ? "Found by the system" : "System")} ·{" "}
          <LocalDate date={e.createdAt} time />
        </span>
      </div>
      <ul className="readable list-disc pl-5">
        {(e.kind === "ROLLBACK"
          ? [`Back to v${e.to.number}: ${label(e.to.model)} live`]
          : e.kind === "DEPLOY"
            ? [unchanged(e.to), "The instructions in code changed"]
            : e.kind === "INSTRUCTIONS"
              ? [unchanged(e.to), "The instructions were edited at runtime"]
              : describeChange(e.from, e.to, label)
        ).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {e.reason && <p className="readable text-muted">{e.reason}</p>}
      <div className="flex flex-wrap items-center gap-3">
        {testId && (
          <Link
            href={evalsPath(app, suite, "runs", testId)}
            className={`text-xs ${LINK}`}
          >
            The test behind it
          </Link>
        )}
        {!isLive && (
          <RollBack
            action={app.actions.rollBackSettings}
            suite={suite}
            versionId={e.to.id}
            number={e.to.number}
            kind={e.kind}
          />
        )}
      </div>
    </article>
  );
}
