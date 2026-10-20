import { describe, expect, it } from "vitest";
import { memoryStore } from "./memoryStore.js";
import {
  NoSettingsError,
  createSettings,
  describeChange,
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
