import type { ReasoningEffort } from "./models.js";
import type { Route } from "./runner.js";

/**
 * Versioned model settings. Each AI feature's settings (its model,
 * fallback, reasoning setting, and output limit, with the instructions they
 * ran with) are numbered versions that never change. Changing a setting
 * makes a new version live; rolling back makes an earlier one live again;
 * every switch is logged with who, when, why, and its evidence. A feature
 * never changed runs on its default from code. Optional: use it, or keep
 * your own routing and pass `route` to the runner yourself.
 */

/**
 * A feature's model settings: live model, fallback, reasoning setting,
 * output limit, and temperature.
 */
export type Settings = {
  model: string;
  fallbackModel: string | null;
  /** Null: the model's own default. */
  reasoningEffort: ReasoningEffort | null;
  /** Null: the call's own default. */
  maxOutputTokens: number | null;
  /**
   * The sampling temperature the feature sends. Null or unset: none sent,
   * so the model's own default. Tests record it, and a test at another
   * temperature than the live one is out of date.
   */
  temperature?: number | null;
};

/**
 * One numbered version of a feature's settings, with the instructions it ran with. Never changed.
 */
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

/**
 * One switch in a feature's history: its kind, the versions it went from and to, who, why,
 * and the evidence.
 */
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

/** Where versions live. `@crowandraven/evalkeeper-prisma` and `memoryStore` implement it. */
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

/**
 * A feature has no settings: no version yet, and no default in code. Apps
 * whose models are chosen in an admin page, not in code, see this until
 * the feature's first version is recorded (`seed` or `change`).
 */
export class NoSettingsError extends Error {
  /** The feature with no settings. */
  readonly operation: string;
  constructor(operation: string) {
    super(
      `${operation} has no settings yet: no version, and no default in code.`,
    );
    this.name = "NoSettingsError";
    this.operation = operation;
  }
}

/** Whether two settings are the same in every field. */
export function sameSettings(a: Settings, b: Settings): boolean {
  return (
    a.model === b.model &&
    a.fallbackModel === b.fallbackModel &&
    a.reasoningEffort === b.reasoningEffort &&
    a.maxOutputTokens === b.maxOutputTokens &&
    (a.temperature ?? null) === (b.temperature ?? null)
  );
}

/** Just the settings of a version. */
export function settingsOf(v: Settings): Settings {
  return {
    model: v.model,
    fallbackModel: v.fallbackModel,
    reasoningEffort: v.reasoningEffort,
    maxOutputTokens: v.maxOutputTokens,
    temperature: v.temperature ?? null,
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
  if ((from.temperature ?? null) !== (to.temperature ?? null))
    out.push(
      `Temperature: ${from.temperature ?? "default"} → ${to.temperature ?? "default"}`,
    );
  return out;
}

/** A switch with the versions it went from and to, for a history page. */
export type HistoryEntry = SettingsChange & {
  to: SettingsVersion;
  from: SettingsVersion | null;
};

/**
 * Versioned settings: each feature's settings as numbered versions, with every change,
 * promotion, rollback, and deploy logged. Its `route` is the runner's route.
 *
 * @example
 * ```ts
 * const settings = createSettings({
 *   store: prismaSettingsStore(prisma),
 *   defaults: (op) => DEFAULTS[op],
 *   promptVersion: (op) => PROMPT_VERSIONS[op],
 * });
 * await settings.update("ticket_triage", { model: "claude-haiku-5-5" }, {
 *   by: admin.name,
 *   reason: "About as accurate at half the cost",
 *   evidence: { runId },
 * });
 * await settings.rollBack("ticket_triage", versionId, { by: admin.name, reason: "Worse in production" });
 * ```
 *
 * When models are chosen in an admin page rather than in code, return null
 * from `defaults` and record each feature's existing config as version 1
 * with `seed`:
 *
 * ```ts
 * const settings = createSettings({ store, defaults: () => null });
 * for (const row of await db.aiConfig.findMany())
 *   await settings.seed(row.operation, settingsFromRow(row), {
 *     by: null,
 *     reason: "Imported from the admin config",
 *   });
 * ```
 */
export function createSettings(opts: {
  store: SettingsStore;
  /**
   * Each feature's settings in code, used until it's first changed. Null:
   * the feature has no default, and reading its settings throws
   * `NoSettingsError` until a version is recorded.
   */
  defaults: (operation: string) => Settings | null;
  /** The instructions' current hash, so a version records what it ran. */
  promptVersion?: (operation: string) => string | Promise<string>;
}) {
  const { store } = opts;
  const prompt = async (op: string) =>
    opts.promptVersion ? await opts.promptVersion(op) : null;

  /**
   * The live settings: the live version's, else the default from code.
   * Throws `NoSettingsError` when the feature has neither.
   */
  async function current(
    operation: string,
  ): Promise<{ settings: Settings; version: SettingsVersion | null }> {
    const version = await store.liveVersion(operation);
    if (version) return { settings: settingsOf(version), version };
    const fallback = opts.defaults(operation);
    if (!fallback) throw new NoSettingsError(operation);
    return { settings: fallback, version };
  }

  /** The runner's route for a feature, from its live settings; throws `NoSettingsError` when it has none. */
  async function route(operation: string): Promise<Route> {
    const { settings } = await current(operation);
    return {
      model: settings.model,
      fallbackModel: settings.fallbackModel,
      reasoningEffort: settings.reasoningEffort,
      temperature: settings.temperature ?? null,
      maxOutputTokens: settings.maxOutputTokens,
    };
  }

  /**
   * Makes new settings live as a new version. The first change to a
   * feature first records its default as version 1, so there's always
   * something to roll back to; a feature with no default gets `next` as
   * version 1. With `evidence`, it's a promotion. Returns null when
   * nothing changed.
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
      if (!initial)
        return store.switchTo(operation, {
          create: { settings: settingsOf(next), promptVersion },
          kind: by.evidence === undefined ? "CHANGE" : "PROMOTE",
          reason: by.reason,
          by: by.by,
          evidence: by.evidence,
          expectLive: null,
        });
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

  /**
   * Changes only some settings (e.g. the fallback), keeping the rest.
   * Throws `NoSettingsError` for a feature with no settings to keep: use
   * `change` or `seed` with full settings first.
   */
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

  /**
   * Records existing settings as a feature's version 1, for an app moving
   * its model choices into versioned settings (an import from its own
   * config table). Only when the feature has no version yet: otherwise it
   * changes nothing and returns null, so an import can run again safely.
   * `promptVersion` defaults to the instructions' current hash.
   */
  async function seed(
    operation: string,
    initial: Settings,
    by: {
      by: string | null;
      reason: string | null;
      promptVersion?: string | null;
    },
  ): Promise<SettingsVersion | null> {
    if (await store.liveVersion(operation)) return null;
    const promptVersion =
      by.promptVersion !== undefined
        ? by.promptVersion
        : await prompt(operation);
    try {
      return await store.switchTo(operation, {
        create: { settings: settingsOf(initial), promptVersion },
        kind: "CHANGE",
        reason: by.reason,
        by: by.by,
        expectLive: null,
      });
    } catch (e) {
      // Another request seeded it first: that version stands.
      if (e instanceof SettingsConflict) return null;
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

  return {
    current,
    route,
    change,
    update,
    rollBack,
    syncPrompt,
    seed,
    history,
  };
}

/** What createSettings returns. */
export type VersionedSettings = ReturnType<typeof createSettings>;
