import type { Experimental_DecisionModel } from "ai";
import { demoCost } from "./demo";
import { MODELS } from "./models";

/**
 * Demo decision models: stand-ins that answer through the AI SDK's real
 * `experimental_decide`, with no key, so the example shows how decision
 * models differ. They pick right about as often as each other but differ
 * in their probabilities: careful is sure when it's right and unsure when
 * it isn't, quick is sure of everything (overconfident), steady is unsure
 * of everything (underconfident), and legacy answers like a prompted model
 * (no distribution for choices). Like the other demo models, they peek at the
 * starter answers, so their differences show.
 */

type Profile = {
  /** Share of questions answered wrong. */
  miss: number;
  /**
   * Probability given the pick when right, and when wrong. At least 0.5 for
   * a true-or-false pick, or the answer lands on the other side.
   */
  sureRight: number;
  sureWrong: number;
  /** Answers choices with no distribution, like a prompted model. */
  prompted: boolean;
  ms: number;
};

const PROFILES: Record<string, Profile> = {
  "demo-careful": {
    miss: 0.12,
    sureRight: 0.97,
    sureWrong: 0.55,
    prompted: false,
    ms: 300,
  },
  "demo-quick": {
    miss: 0.12,
    sureRight: 0.98,
    sureWrong: 0.98,
    prompted: false,
    ms: 80,
  },
  "demo-steady": {
    miss: 0.12,
    sureRight: 0.6,
    sureWrong: 0.6,
    prompted: false,
    ms: 150,
  },
  "demo-legacy": {
    miss: 0.12,
    sureRight: 0.7,
    sureWrong: 0.7,
    prompted: true,
    ms: 200,
  },
};

/** A stable number in [0, 1) for a model and a key. */
function chance(model: string, key: string): number {
  let h = 2166136261;
  for (const ch of `${model}:${key}`) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10_000) / 10_000;
}

/** The right answers for a state the demo knows, by question id. */
export type DemoTruth = (
  state: string,
) => Record<string, string | boolean> | null;

/** Whether a model id is one of the demo decision models. */
export const isDemoDecider = (model: string) => model in PROFILES;

/** A demo decision model for `model`, answering from `truth`. */
export function demoDecisionModel(
  model: string,
  truth: DemoTruth,
): Experimental_DecisionModel {
  const p = PROFILES[model] ?? PROFILES["demo-careful"];
  if (!p) throw new Error(`No demo profile for ${model}`);
  return {
    specificationVersion: "v4",
    provider: "demo",
    modelId: model,
    supportedQuestionTypes: ["choice", "boolean"],
    async doDecide({ state, questions }) {
      await new Promise((r) => setTimeout(r, p.ms));
      const text = state
        .map((part) => (part.type === "text" ? part.text : ""))
        .join("\n");
      const right = truth(text) ?? {};
      const answers: Record<string, unknown> = {};
      for (const [id, q] of Object.entries(questions)) {
        const wrong = chance(model, `${text}#${id}`) < p.miss;
        if (q.type === "boolean") {
          const truthy = right[id] === true;
          const pickTrue = wrong ? !truthy : truthy;
          const sure = wrong ? p.sureWrong : p.sureRight;
          answers[id] = {
            type: "boolean",
            probability: pickTrue ? sure : 1 - sure,
          };
        } else if (q.type === "choice") {
          const options = Object.keys(q.criteria);
          const correct = String(right[id] ?? options[0]);
          const others = options.filter((o) => o !== correct);
          const pick = wrong
            ? (others[
                Math.floor(chance(model, `${text}#${id}#o`) * others.length)
              ] ?? correct)
            : correct;
          if (p.prompted) {
            answers[id] = { type: "choice", choice: pick };
          } else {
            const sure = wrong ? p.sureWrong : p.sureRight;
            const rest = (1 - sure) / Math.max(1, options.length - 1);
            answers[id] = {
              type: "choice",
              choice: pick,
              probabilities: Object.fromEntries(
                options.map((o) => [o, o === pick ? sure : rest]),
              ),
            };
          }
        }
      }
      // Usage that prices to the demo cost in the catalog.
      const usd = demoCost(model) ?? 0;
      const per1M = MODELS[model]?.inputPer1M ?? 1;
      return {
        answers,
        usage: {
          inputTokens: Math.round((usd / per1M) * 1e6),
          outputTokens: 0,
        },
        warnings: [],
      } as never;
    },
  };
}
