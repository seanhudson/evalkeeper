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
 * under the live settings. OUTSIDE: the app's own settings no longer
 * matched the live version (changed by a script, SQL, or another page),
 * recorded as found before the next save (`readActual`). INSTRUCTIONS:
 * instructions edited at runtime (an admin override or guidance injected
 * at call time) changed under the live settings, dated when noticed.
 */
export type ChangeKind =
  "CHANGE" | "PROMOTE" | "ROLLBACK" | "DEPLOY" | "OUTSIDE" | "INSTRUCTIONS";

/** Every kind of change, in the order they were added. */
export const CHANGE_KINDS: readonly ChangeKind[] = [
  "CHANGE",
  "PROMOTE",
  "ROLLBACK",
  "DEPLOY",
  "OUTSIDE",
  "INSTRUCTIONS",
];

/**
 * One instructions hash from its two parts: the instructions in code, and
 * what's edited at runtime (an admin override, guidance injected at call
 * time). Use it for `promptVersion` (the runner's and `createSettings`'s)
 * when part of what the model receives isn't in code, so a test is out of
 * date when either part changes, and `syncPrompt` can tell a deploy
 * (DEPLOY) from a runtime edit (INSTRUCTIONS). With no runtime part, it's
 * the code hash unchanged, so existing hashes stay the same.
 *
 * @param parts - `code`: the hash of the instructions in code. `runtime`:
 *   a hash of everything added or replaced at runtime, or null for none.
 *   Neither may contain `+`, which joins them.
 *
 * @example
 * ```ts
 * const settings = createSettings({
 *   store,
 *   defaults,
 *   promptVersion: async (op) =>
 *     promptVersionOf({
 *       code: PROMPT_VERSIONS[op],
 *       runtime: await guidanceHash(op), // null when there's none
 *     }),
 * });
 * ```
 */
export function promptVersionOf(parts: {
  code: string;
  runtime: string | null;
}): string {
  return parts.runtime ? `${parts.code}+${parts.runtime}` : parts.code;
}

/**
 * An instructions hash split back into the parts `promptVersionOf` joined.
 * A hash made without it is all code.
 *
 * @param version - A version's or a test's instructions hash.
 */
export function splitPromptVersion(version: string): {
  code: string;
  runtime: string | null;
} {
  const at = version.indexOf("+");
  return at < 0
    ? { code: version, runtime: null }
    : { code: version.slice(0, at), runtime: version.slice(at + 1) || null };
}

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

/** Where versions live. `@crowandraven/evalkeeper/prisma` and `memoryStore` implement it. */
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
 *
 * When call sites read the app's own settings row (which a script, SQL,
 * or an older admin page can change without a version), pass
 * `readActual`, so a change made there is recorded (OUTSIDE) before the
 * next save, and a rollback can always get back to it:
 *
 * ```ts
 * const settings = createSettings({
 *   store,
 *   defaults: () => null,
 *   readActual: async (op) => {
 *     const row = await db.aiConfig.findUnique({ where: { operation: op } });
 *     return row ? settingsFromRow(row) : null;
 *   },
 * });
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
  /**
   * The instructions' current hash, so a version records what it ran. It
   * must cover everything the model receives: the instructions in code,
   * and any admin override or guidance added at call time. Join the two
   * with `promptVersionOf`, so `syncPrompt` can tell a runtime edit from a
   * deploy.
   */
  promptVersion?: (operation: string) => string | Promise<string>;
  /**
   * The settings the app's call sites actually use, read from wherever
   * they read them (the app's own settings row), or null when it has none.
   * When given, reading or saving settings first compares them with the
   * live version, and records a mismatch as an OUTSIDE version, so the
   * history holds every state that ran. Your save must update or roll back
   * here first and write the row after, or the new settings read as
   * changed outside. Without it, nothing is compared.
   */
  readActual?: (
    operation: string,
  ) => Settings | null | Promise<Settings | null>;
}) {
  const { store } = opts;
  const prompt = async (op: string) =>
    opts.promptVersion ? await opts.promptVersion(op) : null;
  const actual = async (op: string) =>
    opts.readActual ? await opts.readActual(op) : null;

  /**
   * The live version, after recording the app's actual settings as an
   * OUTSIDE version when they no longer match it (with `readActual`). The
   * new version keeps the live version's instructions hash: only the
   * settings were changed outside.
   */
  async function reconcile(operation: string): Promise<SettingsVersion | null> {
    const live = await store.liveVersion(operation);
    if (!live || !opts.readActual) return live;
    const found = await actual(operation);
    if (!found || sameSettings(settingsOf(live), found)) return live;
    try {
      return await store.switchTo(operation, {
        create: {
          settings: settingsOf(found),
          promptVersion: live.promptVersion,
        },
        kind: "OUTSIDE",
        reason:
          "Changed outside these settings (a script, SQL, or another page); recorded as found",
        by: null,
        expectLive: live.id,
      });
    } catch (e) {
      // Another request recorded it first.
      if (e instanceof SettingsConflict) return store.liveVersion(operation);
      throw e;
    }
  }

  /**
   * The live settings: the live version's, else the app's actual settings
   * (with `readActual`), else the default from code. With `readActual`, a
   * mismatch with the live version is recorded first (OUTSIDE). Throws
   * `NoSettingsError` when the feature has none of them.
   */
  async function current(
    operation: string,
  ): Promise<{ settings: Settings; version: SettingsVersion | null }> {
    const version = await reconcile(operation);
    if (version) return { settings: settingsOf(version), version };
    const found = await actual(operation);
    if (found) return { settings: settingsOf(found), version };
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
   * feature first records what it ran on as version 1 (its default, or
   * the app's actual settings with `readActual`), so there's always
   * something to roll back to; a feature with neither gets `next` as
   * version 1. With `evidence`, it's a promotion. With `readActual`, a
   * mismatch with the live version is recorded first (OUTSIDE). Returns
   * null when nothing changed.
   */
  async function change(
    operation: string,
    next: Settings,
    by: { by: string | null; reason: string | null; evidence?: unknown },
  ): Promise<SettingsVersion | null> {
    const promptVersion = await prompt(operation);
    let live = await reconcile(operation);
    if (!live) {
      const found = await actual(operation);
      const fallback = opts.defaults(operation);
      const initial = found ?? fallback;
      // Found settings that differ from code were set outside.
      const outside = !!found && !(fallback && sameSettings(fallback, found));
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
        create: { settings: settingsOf(initial), promptVersion },
        kind: outside ? "OUTSIDE" : "CHANGE",
        reason: outside
          ? "The settings in use before the first change, set outside these settings"
          : "The default from code, before the first change",
        by: null,
        expectLive: null,
      });
    } else if (sameSettings(settingsOf(live), next)) return null;
    // A promotion changes what answers: the live model or its reasoning.
    // A new fallback, even with evidence, is a change.
    const was = settingsOf(live);
    const promoted =
      by.evidence !== undefined &&
      (was.model !== next.model ||
        (was.reasoningEffort ?? null) !== (next.reasoningEffort ?? null));
    return store.switchTo(operation, {
      create: { settings: settingsOf(next), promptVersion },
      kind: promoted ? "PROMOTE" : "CHANGE",
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

  /**
   * Makes an earlier version live again. Only the settings go back: the
   * instructions stay as they are now. With `readActual`, a mismatch with
   * the live version is recorded first (OUTSIDE), so it can be rolled back
   * to later.
   */
  async function rollBack(
    operation: string,
    versionId: string,
    by: { by: string | null; reason: string },
  ): Promise<SettingsVersion> {
    const live = await reconcile(operation);
    const versions = await store.listVersions(operation);
    const to = versions.find((v) => v.id === versionId);
    if (!to) throw new Error("No such version for this feature");
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
   * Instructions can change under live settings: in code by a deploy, or
   * at runtime by an admin override or edited guidance. When they have,
   * records a version with the same settings and the new instructions, so
   * the history says what changed and when: DEPLOY when the code part
   * changed, INSTRUCTIONS when only the runtime part did (see
   * `promptVersionOf`), dated when noticed. Call it where the feature's
   * settings are read (or after each deploy and each runtime edit). With
   * `readActual`, a mismatch with the live settings is recorded first
   * (OUTSIDE).
   */
  async function syncPrompt(
    operation: string,
  ): Promise<SettingsVersion | null> {
    const live = await reconcile(operation);
    const now = await prompt(operation);
    if (!live || !now || now === live.promptVersion) return live;
    const was = live.promptVersion
      ? splitPromptVersion(live.promptVersion)
      : null;
    const is = splitPromptVersion(now);
    const runtime = was !== null && was.code === is.code;
    try {
      return await store.switchTo(operation, {
        create: { settings: settingsOf(live), promptVersion: now },
        kind: runtime ? "INSTRUCTIONS" : "DEPLOY",
        reason: !was
          ? `Instructions recorded (${now})`
          : runtime
            ? runtimeReason(was.runtime, is.runtime)
            : `Instructions changed (${String(live.promptVersion)} → ${now})`,
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

/** Says how the runtime part of the instructions changed. */
function runtimeReason(was: string | null, is: string | null): string {
  if (!is) return `Runtime instructions removed (were ${String(was)})`;
  if (!was) return `Runtime instructions added (${is})`;
  return `Instructions edited at runtime (${was} → ${is})`;
}

/** What createSettings returns. */
export type VersionedSettings = ReturnType<typeof createSettings>;
