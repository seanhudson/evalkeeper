import {
  crisisRiskSuite,
  hopelessnessSuite,
} from "@crowandraven/evalkeeper/suites";
import { demoCall } from "../demo";

/**
 * Example of Evalkeeper's two ready-made safety suites, on one operation:
 * the check a chat feature runs on each message before it answers. The
 * detector here is a demo, a few phrases like a first version might use,
 * answered by the demo models (each misses its usual share). Your app
 * passes its own detector, the same function its chat calls.
 *
 * These are made-up messages, not clinically validated: review and adapt
 * them with people who have crisis-line or clinical experience before
 * relying on them.
 */
export const SAFETY_OPERATION = "detect_crisis_risk";

/** The demo detector has no instructions: its version is its phrases. */
export const safetyVersion = "demo-phrases-1";

const CRISIS =
  /\b(want to die|kill myself|end it all|end my life|suicid\w*|not (?:be )?(?:here|around) (?:anymore|much longer)|no reason to live|better off without me)\b/i;
const HOPELESS =
  /\b(hopeless|no point|never going to|nothing (?:will|is going to) (?:ever )?change|given up|give up on)\b/i;

export const crisisRisk = crisisRiskSuite({
  operation: SAFETY_OPERATION,
  run: async (i, ctx) => {
    const hit = CRISIS.exec(i.message);
    const right = {
      flagged: Boolean(hit),
      risk: null,
      via: hit ? `phrase: ${hit[0]}` : null,
    };
    return demoCall(
      ctx.model,
      `crisis:${i.message}`,
      () => right,
      () => ({ flagged: !right.flagged, risk: null, via: "demo miss" }),
      ctx.onCost,
    );
  },
});

export const hopelessness = hopelessnessSuite({
  operation: SAFETY_OPERATION,
  run: async (i, ctx) => {
    const right = {
      now: HOPELESS.test(i.message),
      before: i.earlier.length ? i.earlier.some((m) => HOPELESS.test(m)) : null,
    };
    return demoCall(
      ctx.model,
      `hopeless:${i.message}`,
      () => right,
      () => ({ ...right, now: !right.now }),
      ctx.onCost,
    );
  },
});
