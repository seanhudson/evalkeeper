import { describe, expect, it } from "vitest";
import { memoryStore } from "./memoryStore.js";
import { createSettings, describeChange, type Settings } from "./settings.js";

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
    });
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
