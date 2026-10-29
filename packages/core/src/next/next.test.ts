import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

// Next.js's server functions, recorded: `after` callbacks wait for the
// test to run them, as Next.js runs them after the response.
const pending: (() => unknown)[] = [];
const revalidated: string[] = [];
vi.mock("next/server.js", () => ({
  after: (fn: () => unknown) => {
    pending.push(fn);
  },
}));
vi.mock("next/cache.js", () => ({
  revalidatePath: (path: string) => {
    revalidated.push(path);
  },
}));
vi.mock("next/navigation.js", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const { memoryStore } = await import("../memoryStore.js");
const { formText } = await import("../types.js");
const { createRunner } = await import("../runner.js");
const { createSettings } = await import("../settings.js");
const { defineEvals } = await import("../react/app.js");
const { evalActions, evalPages, isAuthorizedCron, weeklyCronRoute } =
  await import("./index.js");
import type { Suite } from "../types.js";
import type { EvalWiring } from "./wiring.js";

type In = { n: number };
type Out = { n: number };

// Doubles a number; "bad" gets odd numbers wrong.
const double: Suite<In, Out, Out> = {
  key: "double",
  operation: "double_op",
  priority: { favor: "cost" },
  label: "Double",
  description: "Doubles numbers.",
  graderVersion: "1",
  input: z.object({ n: z.number() }),
  labelValue: z.object({ n: z.number() }),
  checks: [
    {
      key: "right",
      label: "Right",
      description: "",
      kind: "label",
      severity: "serious",
    },
  ],
  async run(i, ctx) {
    return { n: ctx.model === "bad" && i.n % 2 ? i.n * 2 + 1 : i.n * 2 };
  },
  async grade(_i, out, want) {
    return [{ key: "right", pass: want ? out.n === want.n : null }];
  },
  starter: [
    {
      input: { n: 10 },
      label: { n: 20 },
      tags: [],
      split: "DEV",
      note: "Ten.",
    },
  ],
  // One draft that fits, and one whose input doesn't.
  async draftMore({ focus }) {
    return [
      {
        input: { n: 100 },
        label: { n: 200 },
        tags: ["drafted"],
        note: focus ?? "",
      },
      {
        input: { n: "many" } as unknown as In,
        label: { n: 0 },
        tags: [],
        note: "",
      },
    ];
  },
  inputFromForm: (form) => ({ n: Number(form.get("n")) }),
  labelFromForm: (form) => JSON.parse(formText(form, "value")) as Out,
  title: (i) => String(i.n),
};

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

/** Runs what the actions left for after the response, until none is left. */
async function flush() {
  while (pending.length) await pending.shift()?.();
}

function setup(
  admin = async () => ({ id: "ada", name: "Ada" }),
  models: EvalWiring["models"] = {},
) {
  const store = memoryStore();
  const settings = createSettings({
    store,
    defaults: () => ({
      model: "good",
      fallbackModel: null,
      reasoningEffort: null,
      maxOutputTokens: null,
    }),
  });
  const runner = createRunner({
    store,
    suites: [double],
    models,
    promptVersion: () => "p1",
    route: (op) => settings.route(op),
    candidates: () => ({ models: ["good", "bad", "spare"] }),
  });
  const wiring: EvalWiring = {
    runner,
    settings,
    store,
    feedbackStore: store,
    models,
    suites: [double],
    routeFor: (op) => settings.route(op),
    answerEditors: {},
    basePath: "/evals",
    requireAdmin: admin,
  };
  return { store, settings, runner, wiring, actions: evalActions(wiring) };
}

async function addCases(actions: ReturnType<typeof setup>["actions"]) {
  for (const n of [1, 2, 3])
    await actions.addCase(
      form({
        suite: "double",
        n: String(n),
        value: JSON.stringify({ n: n * 2 }),
      }),
    );
}

beforeEach(() => {
  pending.length = 0;
  revalidated.length = 0;
});

describe("the eval actions", () => {
  it("check who's acting before anything else", async () => {
    const { actions, store } = setup(async () => {
      throw new Error("Admins only");
    });
    await expect(
      actions.addCase(form({ suite: "double", n: "1" })),
    ).rejects.toThrow("Admins only");
    await expect(actions.runWeeklyNow()).rejects.toThrow("Admins only");
    expect(store.cases).toHaveLength(0);
  });

  it("add a case with a confirmed answer, and refresh its page", async () => {
    const { actions, store } = setup();
    await actions.addCase(
      form({
        suite: "double",
        n: "4",
        tags: "a, b,",
        split: "TEST",
        value: '{"n":8}',
      }),
    );
    const [c] = store.cases;
    expect(c?.input).toEqual({ n: 4 });
    expect(c?.tags).toEqual(["a", "b"]);
    expect(c?.split).toBe("TEST");
    expect(c?.labels[0]?.status).toBe("CONFIRMED");
    expect(revalidated).toEqual(["/evals/double"]);
  });

  it("test a model on the cases, answering after the response", async () => {
    const { actions, store, runner } = setup();
    await addCases(actions);
    await expect(
      actions.testModel(form({ suite: "double", model: "nobody" })),
    ).rejects.toThrow("Unknown model");
    await actions.testModel(form({ suite: "double", model: "bad" }));
    expect(store.runs).toHaveLength(1);
    expect(store.outputs).toHaveLength(0);
    await flush();
    const row = (await runner.board("double")).rows.find(
      (r) => r.model === "bad",
    );
    expect(row?.test?.right).toBe(1);
  });

  it("test a model at a reasoning setting the catalog lists", async () => {
    const models = {
      bad: { label: "Bad", provider: "x", efforts: ["low", "high"] },
    };
    const { actions, store } = setup(undefined, models);
    await addCases(actions);
    // One dropdown sends the model and setting together.
    await actions.testModel(
      form({ suite: "double", setting: JSON.stringify(["bad", "high"]) }),
    );
    // A row's own Test button sends them apart; "default" is the model's.
    await actions.testModel(
      form({ suite: "double", model: "bad", effort: "default" }),
    );
    await actions.testModel(form({ suite: "double", model: "bad" }));
    expect(store.runs.map((r) => r.reasoningEffort)).toEqual([
      "high",
      null,
      null,
    ]);
    await expect(
      actions.testModel(
        form({ suite: "double", setting: JSON.stringify(["bad", "max"]) }),
      ),
    ).rejects.toThrow("bad doesn't take max reasoning");
    await expect(
      actions.testModel(
        form({ suite: "double", model: "good", effort: "low" }),
      ),
    ).rejects.toThrow("good doesn't take low reasoning");
    await expect(
      actions.testModel(form({ suite: "double", setting: "bad,high" })),
    ).rejects.toThrow("Unknown setting");
    await expect(
      actions.testModel(
        form({ suite: "double", setting: JSON.stringify(["nobody", "low"]) }),
      ),
    ).rejects.toThrow("Unknown model");
  });

  it("add starters, draft more, and test with drafts as provisional", async () => {
    const { actions, store } = setup();
    await addCases(actions);
    await actions.addStarters(form({ suite: "double" }));
    const ten = store.cases.find((c) => (c.input as In).n === 10);
    expect(ten?.labels[0]?.status).toBe("PENDING");

    await actions.draftMore(form({ suite: "double", focus: "  big ones " }));
    const drafted = store.cases.filter((c) => c.source === "MODEL_DRAFT");
    // The draft whose input doesn't fit the suite is left out.
    expect(drafted.map((c) => c.input)).toEqual([{ n: 100 }]);
    expect(drafted[0]?.status).toBe("DRAFT");
    expect(drafted[0]?.note).toBe("big ones");
    expect(drafted[0]?.labels[0]?.status).toBe("PENDING");

    await actions.useDraftsProvisionally(form({ suite: "double" }));
    for (const c of [ten, drafted[0]]) {
      const now = store.cases.find((x) => x.id === c?.id);
      expect(now?.labels[0]?.status).toBe("PROVISIONAL");
      expect(now?.status).toBe("ACTIVE");
    }
    await expect(
      actions.makeAttackCases(form({ suite: "double" })),
    ).rejects.toThrow("This suite has no attacks");
  });

  it("record who changed settings by name, or by id when asked", async () => {
    const { actions, settings } = setup();
    await addCases(actions);
    await actions.testAll(form({ suite: "double" }));
    await flush();
    await actions.makeLive(form({ suite: "double", model: "bad" }));
    expect((await settings.history("double_op"))[0]?.by).toBe("Ada");
    const byId = setup();
    byId.wiring.changedBy = "id";
    const idActions = evalActions(byId.wiring);
    await addCases(idActions);
    await idActions.testAll(form({ suite: "double" }));
    await flush();
    await idActions.makeLive(form({ suite: "double", model: "bad" }));
    expect((await byId.settings.history("double_op"))[0]?.by).toBe("ada");
  });

  it("change what a feature favors, as a settings version", async () => {
    const { actions, settings } = setup();
    await actions.setPriority(
      form({ suite: "double", favor: "speed", reason: "People wait" }),
    );
    expect((await settings.current("double_op")).settings.favor).toBe("speed");
    const [latest] = await settings.history("double_op");
    expect(latest).toMatchObject({
      kind: "CHANGE",
      by: "Ada",
      reason: "People wait",
    });
    // Back to the suite's own priority: no override is kept.
    await actions.setPriority(form({ suite: "double", favor: "cost" }));
    expect(
      (await settings.current("double_op")).settings.favor ?? null,
    ).toBeNull();
    await expect(
      actions.setPriority(form({ suite: "double", favor: "fun" })),
    ).rejects.toThrow("Pick accuracy, speed, or cost");
  });

  it("make a setting's row live at its own setting", async () => {
    const models = {
      bad: { label: "Bad", provider: "x", efforts: ["low", "high"] },
    };
    const { actions, settings } = setup(undefined, models);
    await addCases(actions);
    await actions.testModel(
      form({ suite: "double", setting: JSON.stringify(["bad", "high"]) }),
    );
    await flush();
    // Its row's menu sends the setting; the model alone has no test.
    await expect(
      actions.makeLive(form({ suite: "double", model: "bad" })),
    ).rejects.toThrow("Test this model");
    await actions.makeLive(
      form({ suite: "double", model: "bad", effort: "high" }),
    );
    const route = await settings.route("double_op");
    expect(route.model).toBe("bad");
    expect(route.reasoningEffort).toBe("high");
  });

  it("make a tested model live, and refuse an untested one", async () => {
    const { actions, settings } = setup();
    await addCases(actions);
    await expect(
      actions.makeLive(form({ suite: "double", model: "bad" })),
    ).rejects.toThrow("Test this model");
    await actions.testAll(form({ suite: "double" }));
    await flush();
    await actions.makeLive(form({ suite: "double", model: "bad" }));
    expect((await settings.route("double_op")).model).toBe("bad");
    const [last] = await settings.history("double_op");
    expect(last?.by).toBe("Ada");
    expect(last?.reason).toMatch(/^Made bad live: 1\/3, /);
    expect(revalidated.at(-1)).toBe("/evals");
  });

  it("make a fallback, and roll back with a reason", async () => {
    const { actions, settings } = setup();
    await addCases(actions);
    await expect(
      actions.makeFallback(form({ suite: "double", model: "good" })),
    ).rejects.toThrow("can't be the fallback");
    await actions.makeFallback(form({ suite: "double", model: "spare" }));
    const route = await settings.route("double_op");
    expect(route.fallbackModel).toBe("spare");
    const [made, first] = await settings.history("double_op");
    expect(made?.reason).toBe("Made spare the fallback: not tested");
    await expect(
      actions.rollBackSettings(
        form({ suite: "double", version: first?.toVersionId ?? "" }),
      ),
    ).rejects.toThrow("Say why");
    await actions.rollBackSettings(
      form({
        suite: "double",
        version: first?.toVersionId ?? "",
        reason: "Too soon",
      }),
    );
    expect((await settings.route("double_op")).fallbackModel).toBeNull();
  });

  it("use the suggestion once there's evidence", async () => {
    const { actions, settings } = setup();
    await addCases(actions);
    await actions.useSuggestion(form({ suite: "double" }));
    await actions.testAll(form({ suite: "double" }));
    await flush();
    await actions.useSuggestion(form({ suite: "double" }));
    expect((await settings.route("double_op")).model).not.toBe("bad");
  });

  it("edit, confirm, rescore, and retire cases", async () => {
    const { actions, store } = setup();
    await addCases(actions);
    const c = store.cases[0];
    await actions.editAnswer(
      form({ suite: "double", case: c?.id ?? "", value: '{"n":3}' }),
    );
    expect(store.cases[0]?.labels).toHaveLength(2);
    await flush();
    const label = store.cases[0]?.labels.at(-1)?.id ?? "";
    await actions.confirmAnswer(form({ suite: "double", label }));
    await actions.rescore(form({ suite: "double" }));
    await flush();
    await expect(
      actions.retireCase(form({ suite: "double", case: "nope" })),
    ).rejects.toThrow("Unknown case");
    await actions.retireCase(form({ suite: "double", case: c?.id ?? "" }));
    expect(store.cases[0]?.status).toBe("RETIRED");
  });

  it("retire easy cases and old drafts from the health panel", async () => {
    const { actions, runner } = setup();
    const easy = vi.spyOn(runner, "retireEasy").mockResolvedValue(3);
    const stale = vi.spyOn(runner, "retireStaleDrafts").mockResolvedValue(1);
    try {
      await actions.retireEasy(form({ suite: "double" }));
      await actions.retireStaleDrafts(form({ suite: "double" }));
      expect(easy).toHaveBeenCalledWith("double");
      expect(stale).toHaveBeenCalledWith("double");
      expect(revalidated.at(-1)).toBe("/evals/double");
    } finally {
      easy.mockRestore();
      stale.mockRestore();
    }
  });

  it("rate blind only in an imported suite", async () => {
    const { actions, store } = setup();
    await addCases(actions);
    const id = store.cases[0]?.id ?? "";
    await expect(
      actions.rateBlind(form({ suite: "double", case: id })),
    ).rejects.toThrow("isn't rated blind");
    await expect(
      actions.skipCase(form({ suite: "double", case: id })),
    ).rejects.toThrow("isn't rated blind");
  });

  it("turn a rating into a draft case, or set it aside", async () => {
    const { actions, store } = setup();
    const rate = (targetId: string, input: unknown) =>
      store.rate({
        operation: "double_op",
        targetId,
        raterId: "u",
        rating: "DOWN",
        reason: "Wrong",
        excerpt: null,
        input,
        output: { n: 0 },
      });
    const good = await rate("t1", { n: 5 });
    const bad = await rate("t2", null);
    await expect(actions.makeCase(form({ feedback: "nope" }))).rejects.toThrow(
      "Unknown rating",
    );
    await expect(actions.makeCase(form({ feedback: bad.id }))).rejects.toThrow(
      "can't become a case",
    );
    await actions.makeCase(form({ feedback: good.id }));
    expect(store.cases[0]?.status).toBe("DRAFT");
    await actions.dismissFeedback(form({ feedback: bad.id }));
    const statuses = (await store.listFeedback()).map((f) => f.status);
    expect(statuses.sort()).toEqual(["CASED", "DISMISSED"]);
  });

  it("run the weekly check now, drafting what each suite can", async () => {
    const { actions, store, runner } = setup();
    await addCases(actions);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const draft = vi
      .spyOn(runner, "draftFromActivity")
      .mockRejectedValue(new Error("No activity source"));
    const stale = vi
      .spyOn(runner, "retireStaleDrafts")
      .mockRejectedValue(new Error("Database is down"));
    double.draftFromActivity = async () => [];
    try {
      await actions.runWeeklyNow();
      await flush();
      expect(error).toHaveBeenCalled();
    } finally {
      delete double.draftFromActivity;
      error.mockRestore();
    }
    expect(draft).toHaveBeenCalledWith("double");
    // Old drafts go before this week's are added; a failure is logged.
    expect(stale).toHaveBeenCalledWith("double");
    stale.mockRestore();
    expect(store.runs.length).toBe(1);
    expect(revalidated.at(-1)).toBe("/evals");
  });
});

describe("the weekly cron route", () => {
  it("answers only the exact bearer secret", async () => {
    const { wiring } = setup();
    const GET = weeklyCronRoute(wiring, () => "s3cret");
    const call = (auth?: string) =>
      GET(
        new Request("https://x.test/api/cron/evals-weekly", {
          headers: auth ? { authorization: auth } : {},
        }),
      );
    expect((await call()).status).toBe(401);
    expect((await call("Bearer wrong!")).status).toBe(401);
    const ok = await call("Bearer s3cret");
    expect(ok.status).toBe(202);
    expect(await ok.json()).toEqual({ started: 0 });
  });

  it("fails closed without a secret", () => {
    expect(isAuthorizedCron("Bearer s3cret", "s3cret")).toBe(true);
    expect(isAuthorizedCron("Bearer s3cre", "s3cret")).toBe(false);
    expect(isAuthorizedCron(null, "s3cret")).toBe(false);
    expect(isAuthorizedCron("Bearer ", undefined)).toBe(false);
    expect(isAuthorizedCron("Bearer ", "")).toBe(false);
  });
});

describe("the pages", () => {
  const props = <P extends object>(params: P) => ({
    params: Promise.resolve(params),
    searchParams: Promise.resolve({}),
  });

  it("check who's looking, then draw or 404", async () => {
    const { wiring } = setup();
    const admin = vi.fn(wiring.requireAdmin);
    const pages = evalPages(
      defineEvals({ ...wiring, actions: evalActions(wiring) }),
      admin,
    );
    expect(await pages.hub.Page()).toBeTruthy();
    expect(await pages.feedback.Page()).toBeTruthy();
    expect(await pages.suite.Page(props({ suite: "double" }))).toBeTruthy();
    await expect(pages.suite.Page(props({ suite: "nope" }))).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    await expect(
      pages.run.Page(props({ suite: "double", runId: "nope" })),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(
      pages.compare.Page(props({ suite: "double" })),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(
      pages.sideBySide.Page(props({ suite: "double" })),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(pages.rate.Page(props({ suite: "double" }))).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(admin).toHaveBeenCalledTimes(8);
  });

  it("title each page by the suite", async () => {
    const { wiring } = setup();
    const pages = evalPages(
      defineEvals({ ...wiring, actions: evalActions(wiring) }),
      wiring.requireAdmin,
    );
    const title = async (
      p: { generateMetadata: (x: never) => Promise<{ title?: unknown }> },
      params: object,
    ) => (await p.generateMetadata(props(params) as never)).title;
    expect(await title(pages.hub, {})).toBe("Evals");
    expect(await title(pages.feedback, {})).toBe("Feedback: Evals");
    expect(await title(pages.suite, { suite: "double" })).toBe("Evals: Double");
    expect(await title(pages.run, { suite: "double" })).toBe("Test: Double");
    expect(await title(pages.compare, { suite: "nope" })).toBe(
      "Compare: Evals",
    );
  });
});
