import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createRunner } from "./runner";
import type { EvalStore, NewCase } from "./store";
import type { Suite } from "./types";

/**
 * The contract every EvalStore must meet, as Vitest tests. Run it against
 * your store to know the runner will work on it:
 *
 *   import { describeStoreContract } from "evalkeeper/testing";
 *   describeStoreContract("my store", () => myStore(freshDatabase()));
 *
 * `make` must return an empty store each time it's called.
 */
export function describeStoreContract(
  name: string,
  make: () => EvalStore | Promise<EvalStore>,
) {
  const newCase = (suite: string, over: Partial<NewCase> = {}): NewCase => ({
    suite,
    input: { text: "hello", nested: { n: 1 } },
    tags: ["a", "b"],
    split: "DEV",
    status: "ACTIVE",
    source: "OWNER",
    sourceRef: null,
    note: null,
    labels: [
      {
        kind: "EXPECTED",
        status: "CONFIRMED",
        value: { want: "HELLO" },
        raterRole: "OWNER",
        raterId: null,
        note: null,
      },
    ],
    ...over,
  });
  const newRun = (suite: string) => ({
    suite,
    model: "model-a",
    promptVersion: "v1",
    reasoningEffort: null,
    set: "ALL" as const,
    repeats: 1,
    datasetVersion: null,
    graderVersion: "1",
    estimatedCostUsd: null,
    startedBy: null,
  });

  describe(`EvalStore contract: ${name}`, () => {
    it("keeps a case's input, tags, and answers as given", async () => {
      const store = await make();
      const c = await store.createCase(newCase("s"));
      const [listed] = await store.listCases("s");
      expect(listed?.id).toBe(c.id);
      expect(listed?.input).toEqual({ text: "hello", nested: { n: 1 } });
      expect(listed?.tags).toEqual(["a", "b"]);
      expect(listed?.labels).toHaveLength(1);
      expect(listed?.labels[0]).toMatchObject({
        kind: "EXPECTED",
        status: "CONFIRMED",
        value: { want: "HELLO" },
      });
    });

    it("lists a suite's cases oldest first, leaving out retired ones", async () => {
      const store = await make();
      const first = await store.createCase(newCase("s"));
      const second = await store.createCase(newCase("s"));
      await store.createCase(newCase("other"));
      await store.setCaseStatus(first.id, "RETIRED");
      expect((await store.listCases("s")).map((c) => c.id)).toEqual([
        second.id,
      ]);
    });

    it("adds answers without overwriting, and changes their status", async () => {
      const store = await make();
      const c = await store.createCase(newCase("s", { labels: [] }));
      const l = await store.addLabel(c.id, {
        kind: "EXPECTED",
        status: "PENDING",
        value: { want: "X" },
        raterRole: "MODEL",
        raterId: null,
        note: null,
      });
      await store.setLabelStatus(l.id, "CONFIRMED");
      const [listed] = await store.listCases("s");
      expect(listed?.labels).toHaveLength(1);
      expect(listed?.labels[0]?.status).toBe("CONFIRMED");
    });

    it("starts runs as running, lists them newest first, and filters", async () => {
      const store = await make();
      const a = await store.createRun(newRun("s"));
      await new Promise((r) => setTimeout(r, 5));
      const b = await store.createRun(newRun("s"));
      expect(a.status).toBe("RUNNING");
      expect((await store.listRuns("s")).map((r) => r.id)).toEqual([
        b.id,
        a.id,
      ]);
      expect(await store.listRuns("s", { limit: 1 })).toHaveLength(1);
      await store.updateRun(a.id, { status: "SUCCEEDED" });
      expect(
        (await store.listRuns("s", { status: "SUCCEEDED" })).map((r) => r.id),
      ).toEqual([a.id]);
      expect(await store.getRun("missing")).toBeNull();
    });

    it("updates a run only while it has the status it's guarded by", async () => {
      const store = await make();
      const r = await store.createRun(newRun("s"));
      await store.updateRun(r.id, { status: "FAILED" }, { status: "RUNNING" });
      await store.updateRun(
        r.id,
        { status: "SUCCEEDED" },
        { status: "RUNNING" },
      );
      expect((await store.getRun(r.id))?.status).toBe("FAILED");
    });

    it("stores outputs and scores, and finds only originals to reuse", async () => {
      const store = await make();
      const c = await store.createCase(newCase("s"));
      const r = await store.createRun(newRun("s"));
      const base = {
        runId: r.id,
        caseId: c.id,
        repeat: 1,
        requestHash: "h",
        output: { text: "HELLO" },
        error: null,
        scores: null,
        costUsd: 0.01,
        ms: 12,
        reused: false,
      };
      const o = await store.createOutput(base);
      await store.createOutput({ ...base, reused: true });
      await store.createOutput({ ...base, error: "boom", output: null });
      await store.setOutputScores(o.id, [{ key: "match", pass: true }]);
      const outs = await store.listOutputs(r.id);
      expect(outs).toHaveLength(3);
      expect(outs.find((x) => x.id === o.id)?.scores).toEqual([
        { key: "match", pass: true },
      ]);
      const found = await store.findReusableOutput("h", new Date(0));
      expect(found?.id).toBe(o.id);
      expect(found?.output).toEqual({ text: "HELLO" });
      expect(
        await store.findReusableOutput("h", new Date(Date.now() + 60_000)),
      ).toBeNull();
    });

    it("runs a whole test through the runner", async () => {
      const store = await make();
      const echo: Suite<{ text: string }, { text: string }, { want: string }> =
        {
          key: "contract",
          operation: "contract",
          priority: { favor: "quality" },
          label: "Contract",
          description: "Uppercases text.",
          graderVersion: "1",
          input: z.object({ text: z.string() }),
          labelValue: z.object({ want: z.string() }),
          checks: [
            {
              key: "match",
              label: "Matches",
              description: "",
              kind: "label",
              severity: "serious",
            },
          ],
          run: async (i) => ({ text: i.text.toUpperCase() }),
          grade: async (_i, out, want) => [
            { key: "match", pass: want ? out.text === want.want : null },
          ],
          inputFromForm: () => ({ text: "" }),
          title: (i) => i.text,
        };
      await store.createCase(newCase("contract"));
      const runner = createRunner({
        store,
        suites: [echo],
        models: { "model-a": { label: "Model A", provider: "acme" } },
        promptVersion: () => "v1",
      });
      const { run } = await runner.createRun({
        suite: "contract",
        model: "model-a",
      });
      await runner.runEval(run.id);
      const done = await store.getRun(run.id);
      expect(done?.status).toBe("SUCCEEDED");
      expect(done?.metrics?.allPass.passed).toBe(1);
    });
  });
}
