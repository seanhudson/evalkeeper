import { describe, expect, it } from "vitest";
import { memoryStore } from "./memoryStore.js";
import {
  CHANGE_KINDS,
  NoSettingsError,
  SettingsConflict,
  createSettings,
  describeChange,
  promptVersionOf,
  splitPromptVersion,
  type Settings,
} from "./settings.js";

const DEFAULT: Settings = {
  model: "small",
  fallbackModel: null,
  reasoningEffort: null,
  maxOutputTokens: null,
};

function setup() {
  const store = memoryStore();
  let prompt = "p1";
  const settings = createSettings({
    store,
    defaults: () => DEFAULT,
    promptVersion: () => prompt,
  });
  return { store, settings, setPrompt: (p: string) => (prompt = p) };
}

/** Settings chosen in an admin page: no defaults in code. */
function setupWithoutDefaults() {
  const store = memoryStore();
  const settings = createSettings({
    store,
    defaults: () => null,
    promptVersion: () => "p1",
  });
  return { store, settings };
}

const IMPORTED: Settings = {
  model: "big",
  fallbackModel: "other",
  reasoningEffort: null,
  maxOutputTokens: 800,
};

describe("versioned settings", () => {
  it("runs on the default from code until first changed", async () => {
    const { settings } = setup();
    expect(await settings.current("triage")).toEqual({
      settings: DEFAULT,
      version: null,
    });
    expect(await settings.route("triage")).toEqual({
      model: "small",
      fallbackModel: null,
      reasoningEffort: null,
      temperature: null,
      maxOutputTokens: null,
    });
  });

  it("records the default as version 1 before the first change", async () => {
    const { settings } = setup();
    const v2 = await settings.change(
      "triage",
      { ...DEFAULT, model: "big" },
      { by: "sam", reason: "Clearly better" },
    );
    expect(v2?.number).toBe(2);
    const [change, initial] = await settings.history("triage");
    expect(change).toMatchObject({
      kind: "CHANGE",
      by: "sam",
      reason: "Clearly better",
    });
    expect(change?.from?.model).toBe("small");
    expect(initial).toMatchObject({
      kind: "CHANGE",
      by: null,
      fromVersionId: null,
    });
    expect(initial?.to).toMatchObject({
      number: 1,
      model: "small",
      promptVersion: "p1",
    });
    expect((await settings.route("triage")).model).toBe("big");
  });

  it("does nothing when the settings don't change", async () => {
    const { settings, store } = setup();
    expect(
      await settings.change("triage", DEFAULT, { by: "sam", reason: null }),
    ).toBeNull();
    await settings.change(
      "triage",
      { ...DEFAULT, model: "big" },
      { by: "sam", reason: null },
    );
    expect(
      await settings.change(
        "triage",
        { ...DEFAULT, model: "big" },
        { by: "sam", reason: null },
      ),
    ).toBeNull();
    expect(store.versions).toHaveLength(2);
  });

  it("is a promotion when a test is the evidence", async () => {
    const { settings } = setup();
    await settings.change(
      "triage",
      { ...DEFAULT, model: "big" },
      {
        by: "sam",
        reason: "Made live from its test",
        evidence: { runId: "r9", vsLive: "BETTER" },
      },
    );
    const [latest] = await settings.history("triage");
    expect(latest).toMatchObject({
      kind: "PROMOTE",
      evidence: { runId: "r9", vsLive: "BETTER" },
    });
  });

  it("records a new fallback as a change, even with evidence", async () => {
    const { settings } = setup();
    await settings.change("triage", DEFAULT, { by: "sam", reason: null });
    await settings.update(
      "triage",
      { fallbackModel: "big" },
      { by: "sam", reason: "Made big the fallback", evidence: { runId: "r1" } },
    );
    expect((await settings.history("triage"))[0]?.kind).toBe("CHANGE");
    await settings.update(
      "triage",
      { reasoningEffort: "low" },
      { by: "sam", reason: "A lower setting", evidence: { runId: "r2" } },
    );
    expect((await settings.history("triage"))[0]?.kind).toBe("PROMOTE");
  });

  it("changes one setting and keeps the rest", async () => {
    const { settings } = setup();
    await settings.change(
      "triage",
      { ...DEFAULT, model: "big" },
      { by: "sam", reason: null },
    );
    await settings.update(
      "triage",
      { fallbackModel: "other" },
      { by: "sam", reason: null },
    );
    expect((await settings.current("triage")).settings).toEqual({
      ...DEFAULT,
      model: "big",
      fallbackModel: "other",
      temperature: null,
    });
  });

  it("versions the temperature with the model", async () => {
    const { settings } = setup();
    // Unset and null are the same: no temperature sent.
    expect(
      await settings.change(
        "triage",
        { ...DEFAULT, temperature: null },
        { by: "sam", reason: null },
      ),
    ).toBeNull();
    const v2 = await settings.update(
      "triage",
      { temperature: 0.4 },
      { by: "sam", reason: "Steadier answers" },
    );
    expect(v2).toMatchObject({ number: 2, temperature: 0.4 });
    expect((await settings.route("triage")).temperature).toBe(0.4);
    const [change] = await settings.history("triage");
    expect(describeChange(change?.from ?? null, v2 ?? DEFAULT)).toEqual([
      "Temperature: default → 0.4",
    ]);
  });

  it("rolls back to an earlier version, and again is a no-op", async () => {
    const { settings, store } = setup();
    await settings.change(
      "triage",
      { ...DEFAULT, model: "big" },
      { by: "sam", reason: null },
    );
    const [v1] = (await store.listVersions("triage")).slice(-1);
    await settings.rollBack("triage", v1?.id ?? "", {
      by: "sam",
      reason: "Big was worse in production",
    });
    expect((await settings.route("triage")).model).toBe("small");
    const [latest] = await settings.history("triage");
    expect(latest).toMatchObject({
      kind: "ROLLBACK",
      reason: "Big was worse in production",
    });
    const before = store.changes.length;
    await settings.rollBack("triage", v1?.id ?? "", {
      by: "sam",
      reason: "again",
    });
    expect(store.changes).toHaveLength(before);
    await expect(
      settings.rollBack("triage", "nope", { by: "sam", reason: "x" }),
    ).rejects.toThrow(/No such version/);
  });

  it("records a deploy that changed the instructions, once", async () => {
    const { settings, setPrompt, store } = setup();
    expect(await settings.syncPrompt("triage")).toBeNull();
    await settings.change(
      "triage",
      { ...DEFAULT, model: "big" },
      { by: "sam", reason: null },
    );
    expect((await settings.syncPrompt("triage"))?.number).toBe(2);
    setPrompt("p2");
    const v3 = await settings.syncPrompt("triage");
    expect(v3).toMatchObject({ number: 3, model: "big", promptVersion: "p2" });
    const [latest] = await settings.history("triage");
    expect(latest).toMatchObject({
      kind: "DEPLOY",
      by: null,
      reason: "Instructions changed (p1 → p2)",
    });
    await settings.syncPrompt("triage");
    expect(store.versions).toHaveLength(3);
  });

  it("says what changed in plain words", () => {
    const label = (m: string) => m.toUpperCase();
    expect(describeChange(null, DEFAULT, label)).toEqual(["Live: SMALL"]);
    expect(
      describeChange(
        DEFAULT,
        {
          ...DEFAULT,
          model: "big",
          fallbackModel: "other",
          reasoningEffort: "high",
          maxOutputTokens: 500,
        },
        label,
      ),
    ).toEqual([
      "Live: SMALL → BIG",
      "Fallback: none → OTHER",
      "Reasoning: default → high",
      "Output limit: default → 500",
    ]);
  });
});

describe("versioned settings without defaults in code", () => {
  it("throws NoSettingsError until a version is recorded", async () => {
    const { settings } = setupWithoutDefaults();
    await expect(settings.current("triage")).rejects.toBeInstanceOf(
      NoSettingsError,
    );
    await expect(settings.route("triage")).rejects.toThrow(
      "triage has no settings yet",
    );
    await expect(
      settings.update("triage", { model: "big" }, { by: "sam", reason: null }),
    ).rejects.toBeInstanceOf(NoSettingsError);
  });

  it("seeds version 1 from an existing config, once", async () => {
    const { settings } = setupWithoutDefaults();
    const v1 = await settings.seed("triage", IMPORTED, {
      by: null,
      reason: "Imported from the admin config",
    });
    expect(v1).toMatchObject({ number: 1, model: "big", promptVersion: "p1" });
    expect(await settings.route("triage")).toMatchObject({
      model: "big",
      fallbackModel: "other",
    });
    // Again: the import is safe to rerun and changes nothing.
    expect(
      await settings.seed(
        "triage",
        { ...IMPORTED, model: "small" },
        { by: null, reason: "Imported again" },
      ),
    ).toBeNull();
    const history = await settings.history("triage");
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      kind: "CHANGE",
      by: null,
      reason: "Imported from the admin config",
      fromVersionId: null,
    });
  });

  it("seeds with the instructions' hash it's given", async () => {
    const { settings } = setupWithoutDefaults();
    const v1 = await settings.seed("triage", IMPORTED, {
      by: "sam",
      reason: null,
      promptVersion: null,
    });
    expect(v1?.promptVersion).toBeNull();
  });

  it("lets a seed that lost a race stand aside", async () => {
    const { store, settings } = setupWithoutDefaults();
    // Another request records the first version between the check and the switch.
    const live = store.liveVersion.bind(store);
    let first = true;
    store.liveVersion = async (op) => {
      if (first) {
        first = false;
        await settings.seed(op, IMPORTED, { by: null, reason: "First" });
        return null;
      }
      return live(op);
    };
    expect(
      await settings.seed("triage", IMPORTED, { by: null, reason: "Second" }),
    ).toBeNull();
    expect((await settings.history("triage")).map((h) => h.reason)).toEqual([
      "First",
    ]);
  });

  it("passes on errors other than a lost race", async () => {
    const { store, settings } = setupWithoutDefaults();
    store.switchTo = () => Promise.reject(new Error("Database down"));
    await expect(
      settings.seed("triage", IMPORTED, { by: null, reason: null }),
    ).rejects.toThrow("Database down");
  });

  it("makes the first change version 1 when there's no default", async () => {
    const { settings } = setupWithoutDefaults();
    const v1 = await settings.change("triage", IMPORTED, {
      by: "sam",
      reason: "New feature",
    });
    expect(v1).toMatchObject({ number: 1, model: "big" });
    const [first] = await settings.history("triage");
    expect(first).toMatchObject({ kind: "CHANGE", by: "sam", from: null });
    // With a test as evidence, the first version is a promotion.
    const other = await settings.change("summarize", IMPORTED, {
      by: "sam",
      reason: null,
      evidence: { runId: "r1" },
    });
    expect(other?.number).toBe(1);
    expect((await settings.history("summarize"))[0]?.kind).toBe("PROMOTE");
  });
});

/** An app whose call sites read their own settings row. */
function setupWithRow(defaults: Settings | null = DEFAULT) {
  const store = memoryStore();
  let row: Settings | null = null;
  let reads = 0;
  const settings = createSettings({
    store,
    defaults: () => defaults,
    promptVersion: () => "p1",
    readActual: () => {
      reads++;
      return row;
    },
  });
  return {
    store,
    settings,
    setRow: (r: Settings | null) => (row = r),
    reads: () => reads,
  };
}

describe("settings changed outside the store", () => {
  it("changes nothing while the row matches, or there's no row", async () => {
    const { settings, store, setRow } = setupWithRow();
    await settings.change(
      "triage",
      { ...DEFAULT, model: "big" },
      { by: "sam", reason: null },
    );
    expect((await settings.current("triage")).settings.model).toBe("big");
    setRow({ ...DEFAULT, model: "big" });
    expect((await settings.route("triage")).model).toBe("big");
    expect(store.versions).toHaveLength(2);
  });

  it("records a mismatch as found, on read, keeping the instructions hash", async () => {
    const { settings, store, setRow } = setupWithRow();
    await settings.change(
      "triage",
      { ...DEFAULT, model: "big" },
      { by: "sam", reason: null },
    );
    setRow({ ...DEFAULT, model: "huge", maxOutputTokens: 900 });
    const { settings: now, version } = await settings.current("triage");
    expect(now).toMatchObject({ model: "huge", maxOutputTokens: 900 });
    expect(version).toMatchObject({ number: 3, promptVersion: "p1" });
    const [latest] = await settings.history("triage");
    expect(latest).toMatchObject({ kind: "OUTSIDE", by: null });
    expect(latest?.reason).toMatch(/outside/);
    expect(describeChange(latest?.from ?? null, now)).toEqual([
      "Live: big → huge",
      "Output limit: default → 900",
    ]);
    // Read again: already recorded.
    await settings.route("triage");
    expect(store.versions).toHaveLength(3);
  });

  it("records the mismatch before a save, so a rollback gets back to it", async () => {
    const { settings, setRow } = setupWithRow();
    await settings.change(
      "triage",
      { ...DEFAULT, model: "big" },
      { by: "sam", reason: null },
    );
    setRow({ ...DEFAULT, model: "huge" });
    const v4 = await settings.update(
      "triage",
      { fallbackModel: "other" },
      { by: "sam", reason: "A fallback" },
    );
    // The save builds on what was really running.
    expect(v4).toMatchObject({
      number: 4,
      model: "huge",
      fallbackModel: "other",
    });
    const kinds = (await settings.history("triage")).map((h) => h.kind);
    expect(kinds).toEqual(["CHANGE", "OUTSIDE", "CHANGE", "CHANGE"]);
    const outside = (await settings.history("triage"))[1];
    setRow(v4);
    const back = await settings.rollBack("triage", outside?.to.id ?? "", {
      by: "sam",
      reason: "The fallback was worse",
    });
    expect(back).toMatchObject({ number: 3, model: "huge" });
  });

  it("records the mismatch before a rollback and a deploy", async () => {
    const { settings, store, setRow } = setupWithRow();
    await settings.change(
      "triage",
      { ...DEFAULT, model: "big" },
      { by: "sam", reason: null },
    );
    const v1 = store.versions.find((v) => v.number === 1);
    setRow({ ...DEFAULT, model: "huge" });
    await settings.rollBack("triage", v1?.id ?? "", {
      by: "sam",
      reason: "Back to the default",
    });
    expect(
      (await settings.history("triage")).map((h) => [h.kind, h.to.number]),
    ).toEqual([
      ["ROLLBACK", 1],
      ["OUTSIDE", 3],
      ["CHANGE", 2],
      ["CHANGE", 1],
    ]);
    // The row now holds the rollback; then a script changes it again.
    setRow({ ...DEFAULT, model: "tiny" });
    const synced = await settings.syncPrompt("triage");
    expect(synced).toMatchObject({ number: 4, model: "tiny" });
    expect((await settings.history("triage"))[0]?.kind).toBe("OUTSIDE");
  });

  it("runs on the row before any version, and records it as version 1 on the first change", async () => {
    const { settings, setRow } = setupWithRow();
    setRow({ ...DEFAULT, model: "huge" });
    expect(await settings.current("triage")).toEqual({
      settings: { ...DEFAULT, model: "huge", temperature: null },
      version: null,
    });
    await settings.change(
      "triage",
      { ...DEFAULT, model: "big" },
      { by: "sam", reason: null },
    );
    const [, first] = await settings.history("triage");
    expect(first).toMatchObject({ kind: "OUTSIDE", fromVersionId: null });
    expect(first?.to).toMatchObject({ number: 1, model: "huge" });
    // A row that matches the default is the default from code.
    const same = setupWithRow();
    same.setRow(DEFAULT);
    await same.settings.change(
      "triage",
      { ...DEFAULT, model: "big" },
      { by: "sam", reason: null },
    );
    expect((await same.settings.history("triage"))[1]).toMatchObject({
      kind: "CHANGE",
      reason: "The default from code, before the first change",
    });
  });

  it("uses the row when there's no default in code", async () => {
    const { settings, setRow } = setupWithRow(null);
    setRow(IMPORTED);
    expect((await settings.route("triage")).model).toBe("big");
    expect(
      await settings.change("triage", IMPORTED, { by: "sam", reason: null }),
    ).toBeNull();
    await settings.update(
      "triage",
      { model: "huge" },
      { by: "sam", reason: null },
    );
    expect(
      (await settings.history("triage")).map((h) => [h.kind, h.to.model]),
    ).toEqual([
      ["CHANGE", "huge"],
      ["OUTSIDE", "big"],
    ]);
  });

  it("lets a record that lost a race stand aside, and passes on other errors", async () => {
    const { settings, store, setRow } = setupWithRow();
    await settings.change(
      "triage",
      { ...DEFAULT, model: "big" },
      { by: "sam", reason: null },
    );
    setRow({ ...DEFAULT, model: "huge" });
    const switchTo = store.switchTo.bind(store);
    let raced = false;
    store.switchTo = async (op, sw) => {
      if (!raced) {
        raced = true;
        // Another request records the same state first.
        await switchTo(op, sw);
        throw new SettingsConflict(op);
      }
      return switchTo(op, sw);
    };
    expect((await settings.current("triage")).version?.number).toBe(3);
    expect(store.versions).toHaveLength(3);
    setRow({ ...DEFAULT, model: "tiny" });
    store.switchTo = () => Promise.reject(new Error("Database down"));
    await expect(settings.route("triage")).rejects.toThrow("Database down");
  });

  it("reads nothing without a version to compare with", async () => {
    const { settings, reads } = setupWithRow();
    expect(await settings.syncPrompt("triage")).toBeNull();
    expect(reads()).toBe(0);
  });
});

describe("instructions edited at runtime", () => {
  function setupWithGuidance() {
    const store = memoryStore();
    let code = "c1";
    let runtime: string | null = null;
    const settings = createSettings({
      store,
      defaults: () => DEFAULT,
      promptVersion: () => promptVersionOf({ code, runtime }),
    });
    return {
      store,
      settings,
      setCode: (c: string) => (code = c),
      setRuntime: (r: string | null) => (runtime = r),
    };
  }

  it("joins and splits the code and runtime parts", () => {
    expect(promptVersionOf({ code: "c1", runtime: null })).toBe("c1");
    expect(promptVersionOf({ code: "c1", runtime: "g1" })).toBe("c1+g1");
    expect(splitPromptVersion("c1")).toEqual({ code: "c1", runtime: null });
    expect(splitPromptVersion("c1+g1")).toEqual({ code: "c1", runtime: "g1" });
    expect(splitPromptVersion("c1+")).toEqual({ code: "c1", runtime: null });
  });

  it("records a runtime edit as INSTRUCTIONS, and a code change as DEPLOY", async () => {
    const { settings, setCode, setRuntime } = setupWithGuidance();
    await settings.change(
      "triage",
      { ...DEFAULT, model: "big" },
      { by: "sam", reason: null },
    );
    setRuntime("g1");
    expect(await settings.syncPrompt("triage")).toMatchObject({
      number: 3,
      model: "big",
      promptVersion: "c1+g1",
    });
    setRuntime("g2");
    await settings.syncPrompt("triage");
    setRuntime(null);
    await settings.syncPrompt("triage");
    setCode("c2");
    await settings.syncPrompt("triage");
    setRuntime("g3");
    setCode("c3");
    await settings.syncPrompt("triage");
    expect(
      (await settings.history("triage")).map((h) => [h.kind, h.reason]),
    ).toEqual([
      ["DEPLOY", "Instructions changed (c2 → c3+g3)"],
      ["DEPLOY", "Instructions changed (c1 → c2)"],
      ["INSTRUCTIONS", "Runtime instructions removed (were g2)"],
      ["INSTRUCTIONS", "Instructions edited at runtime (g1 → g2)"],
      ["INSTRUCTIONS", "Runtime instructions added (g1)"],
      ["CHANGE", null],
      ["CHANGE", "The default from code, before the first change"],
    ]);
  });

  it("records the first hash as a deploy", async () => {
    const store = memoryStore();
    const prompt = { now: "" };
    const settings = createSettings({
      store,
      defaults: () => DEFAULT,
      promptVersion: () => prompt.now,
    });
    await settings.change(
      "triage",
      { ...DEFAULT, model: "big" },
      { by: "sam", reason: null },
    );
    prompt.now = "c1+g1";
    await settings.syncPrompt("triage");
    expect((await settings.history("triage"))[0]).toMatchObject({
      kind: "DEPLOY",
      reason: "Instructions recorded (c1+g1)",
    });
  });

  it("lists every kind", () => {
    expect(CHANGE_KINDS).toEqual([
      "CHANGE",
      "PROMOTE",
      "ROLLBACK",
      "DEPLOY",
      "OUTSIDE",
      "INSTRUCTIONS",
    ]);
  });
});
