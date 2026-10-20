import { describe, expect, it } from "vitest";
import { MockLanguageModelV3 } from "ai/test";
import { z } from "zod";
import { cleanPairs, createMeaningJudge, type JudgmentCache } from "./judge";
import { instructionsHash, promptHash, slot } from "./hash";
import { costOf } from "./usage";

const MODELS = {
  judge: { label: "Judge", provider: "acme", inputPer1M: 1, outputPer1M: 2 },
};

/** A model that answers with these pairs, and counts its calls. */
function judgeModel(pairs: unknown, fail = false) {
  let calls = 0;
  const model = new MockLanguageModelV3({
    doGenerate: async () => {
      calls++;
      if (fail) throw new Error("provider down");
      return {
        content: [{ type: "text", text: JSON.stringify({ pairs }) }],
        finishReason: { unified: "stop", raw: "stop" },
        usage: {
          inputTokens: {
            total: 1000,
            noCache: 1000,
            cacheRead: 0,
            cacheWrite: 0,
          },
          outputTokens: { total: 500, text: 500, reasoning: 0 },
        },
        warnings: [],
      };
    },
  });
  return { model, calls: () => calls };
}

function memoryCache(): JudgmentCache & { size: () => number } {
  const kept = new Map<string, unknown>();
  return {
    get: async (k) => kept.get(k) ?? null,
    set: async (k, v) => void kept.set(k, v),
    size: () => kept.size,
  };
}

const words = () => [{ expected: 0, actual: 0, why: "words" }];

describe("cleanPairs", () => {
  it("keeps valid one-to-one pairs only", () => {
    expect(
      cleanPairs(
        [
          { expected: 0, actual: 1, why: "same" },
          { expected: 0, actual: 0, why: "dup expected" },
          { expected: 1, actual: 1, why: "dup actual" },
          { expected: 5, actual: 0, why: "out of range" },
          { expected: 1, actual: 0, why: "ok" },
        ],
        2,
        2,
      ).map((p) => p.why),
    ).toEqual(["same", "ok"]);
  });
});

describe("meaning judge", () => {
  it("pairs by meaning, reports its cost, and remembers the answer", async () => {
    const { model, calls } = judgeModel([
      { expected: 0, actual: 1, why: "same idea" },
    ]);
    const cache = memoryCache();
    const judge = createMeaningJudge({
      model,
      modelId: "judge",
      models: MODELS,
      cache,
    });
    let spent = 0;
    const first = await judge.match(
      ["Send the deck"],
      ["Book a room", "Share the slides"],
      words,
      (u) => (spent += u),
    );
    expect(first).toEqual({
      pairs: [{ expected: 0, actual: 1, why: "same idea" }],
      by: "meaning",
    });
    expect(spent).toBeCloseTo(0.002);
    // The same question again: from the cache, no call, no cost.
    const again = await judge.match(
      ["Send the deck"],
      ["Book a room", "Share the slides"],
      words,
      (u) => (spent += u),
    );
    expect(again.pairs).toEqual(first.pairs);
    expect(calls()).toBe(1);
    expect(cache.size()).toBe(1);
  });

  it("drops invalid pairs the judge returns", async () => {
    const { model } = judgeModel([
      { expected: 0, actual: 0, why: "ok" },
      { expected: 0, actual: 0, why: "repeat" },
      { expected: 3, actual: 0, why: "no such item" },
    ]);
    const judge = createMeaningJudge({ model, modelId: "judge" });
    expect((await judge.match(["a"], ["b"], words)).pairs).toHaveLength(1);
  });

  it("falls back to word matching when the judge fails, and says so", async () => {
    const { model } = judgeModel([], true);
    const judge = createMeaningJudge({ model, modelId: "judge" });
    expect(await judge.match(["a"], ["b"], words)).toEqual({
      pairs: words(),
      by: "words",
    });
  });

  it("asks nothing when either side is empty", async () => {
    const { model, calls } = judgeModel([]);
    const judge = createMeaningJudge({ model, modelId: "judge" });
    expect(await judge.match([], ["b"], words)).toEqual({
      pairs: [],
      by: "meaning",
    });
    expect(calls()).toBe(0);
  });

  it("changes its version when its instructions change", () => {
    const { model } = judgeModel([]);
    const a = createMeaningJudge({ model, modelId: "judge" });
    const b = createMeaningJudge({
      model,
      modelId: "judge",
      system: "Match tickets.",
    });
    expect(a.version).not.toBe(b.version);
  });
});

describe("instructionsHash", () => {
  it("changes when a schema description does, and only then", () => {
    const hash = (d: string) =>
      instructionsHash({
        texts: ["Summarize", slot("ticket")],
        schemas: [z.object({ summary: z.string().describe(d) })],
      });
    expect(hash("One line")).toBe(hash("One line"));
    expect(hash("One line")).not.toBe(hash("Two lines"));
    expect(promptHash("x")).toHaveLength(8);
  });

  it("covers tool descriptions", () => {
    const tool = (description: string) =>
      instructionsHash({
        texts: ["Help"],
        tools: {
          search: { description, inputSchema: z.object({ q: z.string() }) },
        },
      });
    expect(tool("Search the docs")).not.toBe(tool("Search the web"));
  });
});

describe("costOf", () => {
  it("prices a call from its usage, or null without a price", () => {
    const usage = {
      inputTokens: 1_000_000,
      outputTokens: 500_000,
      totalTokens: 1_500_000,
      inputTokenDetails: {
        noCacheTokens: undefined,
        cacheReadTokens: undefined,
        cacheWriteTokens: undefined,
      },
      outputTokenDetails: { textTokens: undefined, reasoningTokens: undefined },
    };
    expect(costOf(MODELS, "judge", usage)).toBe(2);
    expect(costOf(MODELS, "unknown", usage)).toBeNull();
  });
});
