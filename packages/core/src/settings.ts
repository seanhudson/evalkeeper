import type { ReasoningEffort } from "./models";
import type { Route } from "./runner";

/**
 * Versioned model settings. Each AI feature's settings (its model,
 * fallback, reasoning setting, and output limit, with the instructions they
 * ran with) are numbered versions that never change. Changing a setting
 * makes a new version live; rolling back makes an earlier one live again;
 * every switch is logged with who, when, why, and its evidence. A feature
 * never changed runs on its default from code. Optional: use it, or keep
 * your own routing and pass `route` to the runner yourself.
 */

export type Settings = {
  model: string;
  fallbackModel: string | null;
  /** Null: the model's own default. */
  reasoningEffort: ReasoningEffort | null;
  /** Null: the call's own default. */
  maxOutputTokens: number | null;
};

export type SettingsVersion = Settings & {
  id: string;
  operation: string;
  /** 1, 2, 3, … per feature. */
  number: number;
  /** The instructions' hash when this version was made. */
  promptVersion: string | null;
  createdAt: Date;
};

/**
 * CHANGE: a person changed a setting. PROMOTE: a model was made live or
 * the fallback from a test, with the test as evidence. ROLLBACK: an
 * earlier version made live again. DEPLOY: the instructions changed in code
 * under the live settings.
 */
export type ChangeKind = "CHANGE" | "PROMOTE" | "ROLLBACK" | "DEPLOY";

export type SettingsChange = {
  id: string;
  operation: string;
  kind: ChangeKind;
  fromVersionId: string | null;
  toVersionId: string;
  reason: string | null;
  /** Who made it; null for the system (a deploy, the first default). */
  by: string | null;
  /** Why it's safe: the tests compared, the verdict. */
  evidence: unknown;
  createdAt: Date;
};

/** One atomic switch: maybe a new version, then live, then the log. */
export type SettingsSwitch = {
  /** Make a new version with these settings (numbered next). */
  create?: { settings: Settings; promptVersion: string | null };
  /** Or make this existing version live. */
  versionId?: string;
  kind: ChangeKind;
  reason: string | null;
  by: string | null;
  evidence?: unknown;
  /**
   * The live version this switch was decided against (null: none). The
   * store refuses the switch if another one got in first.
   */
  expectLive: string | null;
};

/** Where versions live. `@evalkeeper/prisma` and `memoryStore` implement it. */
export interface SettingsStore {
  liveVersion(operation: string): Promise<SettingsVersion | null>;
  /** Newest first. */
  listVersions(operation: string): Promise<SettingsVersion[]>;
  /** Newest first. */
  listChanges(
    operation: string,
    opts?: { limit?: number },
  ): Promise<SettingsChange[]>;
  /**
   * Applies a switch atomically. Throws SettingsConflict when the live
   * version is no longer `expectLive`.
   */
  switchTo(operation: string, s: SettingsSwitch): Promise<SettingsVersion>;
}

/** Another change landed first: reload and decide again. */
export class SettingsConflict extends Error {
  constructor(operation: string) {
    super(
      `The settings for ${operation} changed meanwhile. Reload and try again.`,
    );
    this.name = "SettingsConflict";
  }
}

export function sameSettings(a: Settings, b: Settings): boolean {
  return (
    a.model === b.model &&
    a.fallbackModel === b.fallbackModel &&
    a.reasoningEffort === b.reasoningEffort &&
    a.maxOutputTokens === b.maxOutputTokens
  );
}

export function settingsOf(v: Settings): Settings {
  return {
    model: v.model,
    fallbackModel: v.fallbackModel,
    reasoningEffort: v.reasoningEffort,
    maxOutputTokens: v.maxOutputTokens,
  };
}

/** What changed between two settings, in plain words. */
export function describeChange(
  from: Settings | null,
  to: Settings,
  label: (model: string) => string = (m) => m,
): string[] {
  if (!from) return [`Live: ${label(to.model)}`];
  const out: string[] = [];
  if (from.model !== to.model)
    out.push(`Live: ${label(from.model)} → ${label(to.model)}`);
  if (from.fallbackModel !== to.fallbackModel)
    out.push(
      `Fallback: ${from.fallbackModel ? label(from.fallbackModel) : "none"} → ${to.fallbackModel ? label(to.fallbackModel) : "none"}`,
    );
  if (from.reasoningEffort !== to.reasoningEffort)
    out.push(
      `Reasoning: ${from.reasoningEffort ?? "default"} → ${to.reasoningEffort ?? "default"}`,
    );
  if (from.maxOutputTokens !== to.maxOutputTokens)
    out.push(
      `Output limit: ${from.maxOutputTokens ?? "default"} → ${to.maxOutputTokens ?? "default"}`,
    );
  return out;
}

export type HistoryEntry = SettingsChange & {
  to: SettingsVersion;
  from: SettingsVersion | null;
};

export function createSettings(opts: {
  store: SettingsStore;
  /** Each feature's settings in code, used until it's first changed. */
  defaults: (operation: string) => Settings;
  /** The instructions' current hash, so a version records what it ran. */
  promptVersion?: (operation: string) => string | Promise<string>;
}) {
  const { store } = opts;
  const prompt = async (op: string) =>
    opts.promptVersion ? await opts.promptVersion(op) : null;

  /** The live settings: the live version's, else the default from code. */
  async function current(
    operation: string,
  ): Promise<{ settings: Settings; version: SettingsVersion | null }> {
    const version = await store.liveVersion(operation);
    return {
      settings: version ? settingsOf(version) : opts.defaults(operation),
      version,
    };
  }

  /** The runner's route for a feature, from its live settings. */
  async function route(operation: string): Promise<Route> {
    const { settings } = await current(operation);
    return {
      model: settings.model,
      fallbackModel: settings.fallbackModel,
      reasoningEffort: settings.reasoningEffort,
    };
  }

  /**
   * Makes new settings live as a new version. The first change to a
   * feature first records its default as version 1, so there's always
   * something to roll back to. With `evidence`, it's a promotion. Returns
   * null when nothing changed.
   */
  async function change(
    operation: string,
    next: Settings,
    by: { by: string | null; reason: string | null; evidence?: unknown },
  ): Promise<SettingsVersion | null> {
    const promptVersion = await prompt(operation);
    let live = await store.liveVersion(operation);
    if (!live) {
      const initial = opts.defaults(operation);
      if (sameSettings(initial, next)) return null;
      live = await store.switchTo(operation, {
        create: { settings: initial, promptVersion },
        kind: "CHANGE",
        reason: "The default from code, before the first change",
        by: null,
        expectLive: null,
      });
    } else if (sameSettings(settingsOf(live), next)) return null;
    return store.switchTo(operation, {
      create: { settings: settingsOf(next), promptVersion },
      kind: by.evidence === undefined ? "CHANGE" : "PROMOTE",
      reason: by.reason,
      by: by.by,
      evidence: by.evidence,
      expectLive: live.id,
    });
  }

  /** Changes only some settings (e.g. the fallback), keeping the rest. */
  async function update(
    operation: string,
    patch: Partial<Settings>,
    by: { by: string | null; reason: string | null; evidence?: unknown },
  ): Promise<SettingsVersion | null> {
    const { settings } = await current(operation);
    return change(operation, { ...settings, ...patch }, by);
  }

  /** Makes an earlier version live again. */
  async function rollBack(
    operation: string,
    versionId: string,
    by: { by: string | null; reason: string },
  ): Promise<SettingsVersion> {
    const versions = await store.listVersions(operation);
    const to = versions.find((v) => v.id === versionId);
    if (!to) throw new Error("No such version for this feature");
    const live = await store.liveVersion(operation);
    if (live?.id === to.id) return to;
    return store.switchTo(operation, {
      versionId: to.id,
      kind: "ROLLBACK",
      reason: by.reason,
      by: by.by,
      expectLive: live?.id ?? null,
    });
  }

  /**
   * Instructions live in code, so a deploy can change them under live
   * settings. When it has, records a version with the same settings and the
   * new instructions, so the history says what changed and when. Call it
   * where the feature's settings are read (or after each deploy).
   */
  async function syncPrompt(
    operation: string,
  ): Promise<SettingsVersion | null> {
    const live = await store.liveVersion(operation);
    const now = await prompt(operation);
    if (!live || !now || now === live.promptVersion) return live;
    try {
      return await store.switchTo(operation, {
        create: { settings: settingsOf(live), promptVersion: now },
        kind: "DEPLOY",
        reason: live.promptVersion
          ? `Instructions changed (${live.promptVersion} → ${now})`
          : `Instructions recorded (${now})`,
        by: null,
        expectLive: live.id,
      });
    } catch (e) {
      // Another request recorded the same deploy first.
      if (e instanceof SettingsConflict) return store.liveVersion(operation);
      throw e;
    }
  }

  /** Every switch, newest first, with the versions it went from and to. */
  async function history(
    operation: string,
    limit = 50,
  ): Promise<HistoryEntry[]> {
    const [changes, versions] = await Promise.all([
      store.listChanges(operation, { limit }),
      store.listVersions(operation),
    ]);
    const byId = new Map(versions.map((v) => [v.id, v]));
    return changes.flatMap((c) => {
      const to = byId.get(c.toVersionId);
      if (!to) return [];
      return [
        {
          ...c,
          to,
          from: c.fromVersionId ? (byId.get(c.fromVersionId) ?? null) : null,
        },
      ];
    });
  }

  return { current, route, change, update, rollBack, syncPrompt, history };
}

export type VersionedSettings = ReturnType<typeof createSettings>;
