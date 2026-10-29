import { after } from "next/server.js";
import { revalidatePath } from "next/cache.js";
import {
  answerFromForm,
  attackMistakes,
  attacksFrom,
  blindRating,
  caseFromFeedback,
  formText,
  isInjectionSuite,
  leakNote,
  raterStatus,
  skipMark,
  suggest,
  withoutLeaks,
  type ReasoningEffort,
} from "../index.js";
import { evalsPath, type EvalActions } from "../react/app.js";
import { weeklyCheck } from "./weekly.js";
import type { EvalWiring } from "./wiring.js";

const VS: Record<string, string> = {
  BETTER: "more accurate than live",
  SAME: "about as accurate as live",
  WORSE: "less accurate than live",
  TOO_FEW: "too few cases to compare",
};

/**
 * Every action on the eval pages, for Next.js. Each checks `requireAdmin`
 * first and records the admin as who made a change; answers to tests come
 * back after the response (`after`), while the page refreshes.
 *
 * Next.js only accepts server actions from a `"use server"` module of your
 * app, so `add pages` writes `lib/evalkeeper/actions.ts`: one line per
 * action, each calling these.
 *
 * @param w - Your wiring.
 */
export function evalActions(w: EvalWiring): Required<EvalActions> {
  const { runner, settings, store, feedbackStore } = w;
  const page = (...parts: string[]) => evalsPath(w, ...parts);
  /** Every eval page, after a change that shows on more than one. */
  const everyPage = () => {
    revalidatePath(w.basePath, "layout");
  };
  const weekly = weeklyCheck(w);

  const suiteFrom = (form: FormData) =>
    runner.suiteOrThrow(formText(form, "suite"));

  /**
   * The suite whose page chooses models: never an injection suite, whose
   * results show on its base suite's page and count in its suggestion.
   */
  function choosingSuite(form: FormData) {
    const suite = suiteFrom(form);
    if (isInjectionSuite(suite))
      throw new Error(`Choose models on ${suite.base.label}`);
    return suite;
  }

  /** A suite's injection suites, as its suggestion reads them. */
  const attacksOn = async (suiteKey: string) =>
    attacksFrom(await runner.attackBoards(suiteKey));

  /** Answers a test's runs one after another: the feature's, then its attacks'. */
  async function runAll(runs: { id: string }[]) {
    for (const r of runs) await runner.runEval(r.id);
  }

  /** A case of the suite, by the form's "case"; throws on any other. */
  async function knownCase(suiteKey: string, form: FormData) {
    const id = formText(form, "case");
    const c = (await store.listCases(suiteKey)).find((x) => x.id === id);
    if (!c) throw new Error("Unknown case");
    return c;
  }

  /**
   * The case a blind rating or skip is for: in this imported suite, not
   * retired, and not yet rated or skipped by this person, so nobody answers
   * twice and nothing lands over another person's answer.
   */
  async function caseToRate(form: FormData, raterId: string) {
    const suite = suiteFrom(form);
    if (suite.caseKind !== "imported")
      throw new Error("This suite isn't rated blind");
    const c = await knownCase(suite.key, form);
    if (raterStatus(c, raterId))
      throw new Error("You've already rated or skipped this case");
    return { suite, c };
  }

  /** The current test of a model's row, for choosing it live or fallback. */
  /**
   * A model's row: at the feature's own setting, or with `effort` at
   * another ("default": the model's own default).
   */
  async function rowOf(suiteKey: string, model: string, effort?: string) {
    const board = await runner.board(suiteKey);
    const wanted = effort === "default" ? null : effort;
    return {
      board,
      row: board.rows.find((r) =>
        effort === undefined
          ? r.model === model && !r.variant
          : r.model === model && r.variant && r.effort === wanted,
      ),
    };
  }

  /**
   * The model and reasoning setting a Test form asks for: `setting` (a
   * model and setting together, from one dropdown) or `model` with an
   * optional `effort`. No setting: the feature's own. "default": the
   * model's own default, sending none. Any other must be one the catalog
   * lists for the model.
   */
  function testRequest(
    form: FormData,
    operation: string,
  ): { model: string; reasoningEffort?: ReasoningEffort | null } {
    let model: string;
    let effort: string | undefined;
    const setting = form.get("setting");
    if (typeof setting === "string" && setting) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(setting);
      } catch {
        throw new Error("Unknown setting");
      }
      if (
        !Array.isArray(parsed) ||
        parsed.length !== 2 ||
        !parsed.every((x) => typeof x === "string")
      )
        throw new Error("Unknown setting");
      [model, effort] = parsed as [string, string];
    } else {
      model = formText(form, "model");
      const e = form.get("effort");
      effort = typeof e === "string" && e ? e : undefined;
    }
    if (!runner.modelsFor(operation).includes(model))
      throw new Error("Unknown model");
    if (effort === undefined) return { model };
    if (effort === "default") return { model, reasoningEffort: null };
    if (!w.models[model]?.efforts?.includes(effort))
      throw new Error(`${model} doesn't take ${effort} reasoning`);
    return { model, reasoningEffort: effort };
  }

  async function feedbackById(id: string) {
    const f = (await feedbackStore.listFeedback()).find((x) => x.id === id);
    if (!f) throw new Error("Unknown rating");
    return f;
  }

  return {
    async testModel(form) {
      await w.requireAdmin();
      const suite = suiteFrom(form);
      const request = testRequest(form, suite.operation);
      // The feature's cases and its attack cases, in one test.
      const { runs } = await runner.createTest({
        suite: suite.key,
        ...request,
      });
      after(() => runAll(runs));
      revalidatePath(page(suite.key));
    },

    async testAll(form) {
      await w.requireAdmin();
      const suite = suiteFrom(form);
      for (const model of runner.modelsFor(suite.operation)) {
        const { runs } = await runner.createTest({ suite: suite.key, model });
        after(() => runAll(runs));
      }
      revalidatePath(page(suite.key));
    },

    async makeLive(form) {
      const admin = await w.requireAdmin();
      const suite = choosingSuite(form);
      const effort = form.get("effort");
      const { board, row } = await rowOf(
        suite.key,
        formText(form, "model"),
        typeof effort === "string" && effort ? effort : undefined,
      );
      if (!row?.test || row.test.stale)
        throw new Error("Test this model on the current cases first");
      const score = { right: row.test.right, total: row.test.total };
      const attacked = attackMistakes(row.key, await attacksOn(suite.key));
      await settings.update(
        suite.operation,
        // A row at another setting goes live at that setting.
        row.variant
          ? { model: row.model, reasoningEffort: row.effort }
          : { model: row.model },
        {
          by: admin.name,
          reason: `Made ${row.label} live: ${score.right}/${score.total}, ${VS[row.vsLive ?? ""] ?? "no comparison"}${attacked === null ? "" : `; ${attacked} serious ${attacked === 1 ? "mistake" : "mistakes"} under attack`}`,
          // The evidence, so the history can show why.
          evidence: {
            runId: row.test.runId,
            liveRunId: board.liveRunId,
            vsLive: row.vsLive,
            score,
          },
        },
      );
      everyPage();
    },

    async makeFallback(form) {
      const admin = await w.requireAdmin();
      const suite = choosingSuite(form);
      const { board, row } = await rowOf(suite.key, formText(form, "model"));
      if (!row?.canMakeFallback)
        throw new Error("This model can't be the fallback");
      const test = row.test && !row.test.stale ? row.test : null;
      const failed = test?.failedAnswers
        ? `, ${test.failedAnswers} failed`
        : "";
      await settings.update(
        suite.operation,
        { fallbackModel: row.model },
        {
          by: admin.name,
          reason: `Made ${row.label} the fallback: ${test ? `${Math.round(test.right)}/${Math.round(test.total)}${failed}` : "not tested"}`,
          evidence: {
            runId: test?.runId ?? null,
            liveRunId: board.liveRunId,
            score: test ? { right: test.right, total: test.total } : null,
          },
        },
      );
      everyPage();
    },

    /** Applies the suggestion: its live and fallback models, in one change. */
    async useSuggestion(form) {
      const admin = await w.requireAdmin();
      const suite = choosingSuite(form);
      const [board, attacks] = await Promise.all([
        runner.board(suite.key),
        attacksOn(suite.key),
      ]);
      const s = suggest(board.rows, suite.checks, suite.priority, w.models, {
        attacks,
      });
      if (!s || s.same) return;
      await settings.update(
        suite.operation,
        { model: s.live.model, fallbackModel: s.fallback?.model ?? null },
        {
          by: admin.name,
          reason: s.reasons.join(" "),
          evidence: {
            suggestion: s.reasons,
            live: s.live.test?.runId ?? null,
            fallback: s.fallback?.test?.runId ?? null,
          },
        },
      );
      everyPage();
    },

    /** Makes an earlier version live again; a reason is required. */
    async rollBackSettings(form) {
      const admin = await w.requireAdmin();
      const suite = choosingSuite(form);
      const reason = formText(form, "reason");
      if (!reason) throw new Error("Say why you're rolling back");
      await settings.rollBack(suite.operation, formText(form, "version"), {
        by: admin.name,
        reason,
      });
      everyPage();
    },

    /** A person confirms an answer: the only way a draft gets used. */
    async confirmAnswer(form) {
      await w.requireAdmin();
      const suite = suiteFrom(form);
      await store.setLabelStatus(formText(form, "label"), "CONFIRMED");
      after(() => runner.rescoreRecent(suite.key));
      revalidatePath(page(suite.key));
    },

    async rescore(form) {
      await w.requireAdmin();
      const suite = suiteFrom(form);
      await runner.rescoreRecent(suite.key);
      revalidatePath(page(suite.key));
    },

    /**
     * A person adds a case. They wrote its answer, so it's confirmed. The
     * suite's leak check runs first, and the case's note says what it
     * removed.
     */
    async addCase(form) {
      await w.requireAdmin();
      const suite = suiteFrom(form);
      const { input, removed } = withoutLeaks(
        suite,
        suite.inputFromForm(form),
        null,
      );
      await store.createCase({
        suite: suite.key,
        input,
        tags: formText(form, "tags")
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        split: formText(form, "split") === "TEST" ? "TEST" : "DEV",
        status: "ACTIVE",
        source: "OWNER",
        sourceRef: null,
        note: leakNote(removed),
        labels: [
          {
            kind: "EXPECTED",
            status: "CONFIRMED",
            value: answerFromForm(suite, form),
            raterRole: "OWNER",
            raterId: null,
            note: null,
          },
        ],
      });
      revalidatePath(page(suite.key));
    },

    /**
     * A person changes a case's answer: a new confirmed answer, with the
     * old ones kept as history. Stored answers are rescored for free.
     */
    async editAnswer(form) {
      await w.requireAdmin();
      const suite = suiteFrom(form);
      const c = await knownCase(suite.key, form);
      await store.addLabel(c.id, {
        kind: "EXPECTED",
        status: "CONFIRMED",
        value: answerFromForm(suite, form),
        raterRole: "OWNER",
        raterId: null,
        note: null,
      });
      // A draft (from feedback) is in use once it has an answer.
      await store.setCaseStatus(c.id, "ACTIVE");
      after(() => runner.rescoreRecent(suite.key));
      revalidatePath(page(suite.key));
    },

    /** Takes a case out of use; its stored answers stay. */
    async retireCase(form) {
      await w.requireAdmin();
      const suite = suiteFrom(form);
      const c = await knownCase(suite.key, form);
      await store.setCaseStatus(c.id, "RETIRED");
      revalidatePath(page(suite.key));
    },

    /**
     * Retires the easy cases beyond the floor, then rescores recent tests
     * (free), so their scores leave the retired cases out.
     */
    async retireEasy(form) {
      await w.requireAdmin();
      const suite = suiteFrom(form);
      await runner.retireEasy(suite.key);
      revalidatePath(page(suite.key));
    },

    /** Retires drafts nobody reviewed in STALE_DRAFT_DAYS. */
    async retireStaleDrafts(form) {
      await w.requireAdmin();
      const suite = suiteFrom(form);
      await runner.retireStaleDrafts(suite.key);
      revalidatePath(page(suite.key));
    },

    /**
     * A person rates an imported case blind: their own confirmed answer,
     * with their reason, added beside anyone else's. Tests are rescored
     * for free.
     */
    async rateBlind(form) {
      const admin = await w.requireAdmin();
      const { suite, c } = await caseToRate(form, admin.id);
      await store.addLabel(
        c.id,
        blindRating({
          raterId: admin.id,
          value: answerFromForm(suite, form),
          reason: formText(form, "reason"),
        }),
      );
      // A draft is in use once it has an answer.
      if (c.status === "DRAFT") await store.setCaseStatus(c.id, "ACTIVE");
      after(() => runner.rescoreRecent(suite.key));
      revalidatePath(page(suite.key), "layout");
    },

    /** A person passes on an imported case: it leaves their queue only. */
    async skipCase(form) {
      const admin = await w.requireAdmin();
      const { suite, c } = await caseToRate(form, admin.id);
      await store.addLabel(c.id, skipMark(admin.id));
      revalidatePath(page(suite.key, "rate"));
    },

    /** Makes a draft case from a rating; a person finishes its answer. */
    async makeCase(form) {
      await w.requireAdmin();
      const f = await feedbackById(formText(form, "feedback"));
      const suite = w.suites.find(
        (s) => s.operation === f.operation && !isInjectionSuite(s),
      );
      const draft = suite ? caseFromFeedback(f, suite) : null;
      if (!draft) throw new Error("This rating can't become a case");
      const c = await store.createCase(draft);
      await feedbackStore.setFeedbackStatus(f.id, "CASED", c.id);
      everyPage();
    },

    async dismissFeedback(form) {
      await w.requireAdmin();
      const f = await feedbackById(formText(form, "feedback"));
      await feedbackStore.setFeedbackStatus(f.id, "DISMISSED");
      revalidatePath(page("feedback"));
    },

    async runWeeklyNow() {
      await w.requireAdmin();
      // Recorded before the page re-renders, so it shows them running.
      const ids = await weekly.start();
      after(() => weekly.run(ids));
      revalidatePath(w.basePath);
    },
  };
}
