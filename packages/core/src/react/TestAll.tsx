"use client";

import { useState } from "react";
import { money } from "../format.js";
import { spanText } from "../reuse.js";
import type { FormAction } from "./app.js";
import { Button, Submit, Tip } from "./pieces.js";
import { QUIET_BUTTON } from "./format.js";

/**
 * Test every model, saying it costs money: what it would cost now beside
 * it, a tooltip on what it does, and, when that's more than `confirmAbove`
 * (or unknown), a second press to confirm, with the cost in words.
 */
export function TestAll({
  action,
  suite,
  cost,
  confirmAbove,
  again = false,
  id,
}: {
  /** Your testAll action. */
  action: FormAction;
  suite: string;
  /** What it costs now; 0: every answer reused; null: a price is unknown. */
  cost: number | null;
  /** USD above which it asks first (`EvalApp.confirmTestsAboveUsd`). */
  confirmAbove: number;
  again?: boolean;
  /** Unique per page, for the tooltip. */
  id: string;
}) {
  const [asking, setAsking] = useState(false);
  const label = again ? "Test every model again" : "Test every model";
  const ask = cost === null || cost > confirmAbove;
  return (
    <form
      action={action}
      className="flex shrink-0 flex-wrap items-center justify-end gap-2"
    >
      <input type="hidden" name="suite" value={suite} />
      {ask && asking ? (
        <>
          <p role="alert" className="readable text-sm">
            {cost === null
              ? "Some models have no price, so what this costs is unknown."
              : `This costs about ${money(cost)}.`}{" "}
            Test them all?
          </p>
          <Submit variant="quiet">{label}</Submit>
          <Button
            type="button"
            onClick={() => {
              setAsking(false);
            }}
            className={`rounded-md px-3 py-1.5 text-sm ${QUIET_BUTTON}`}
          >
            Cancel
          </Button>
        </>
      ) : (
        <>
          <Tip control term="testAll" id={id} side="bottom" align="end">
            {ask ? (
              <Button
                type="button"
                onClick={() => {
                  setAsking(true);
                }}
                className={`inline-flex items-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm ${QUIET_BUTTON}`}
              >
                {label}
              </Button>
            ) : (
              <Submit variant="quiet">{label}</Submit>
            )}
          </Tip>
          {cost !== null && (
            <span className="whitespace-nowrap text-xs text-muted">
              {cost === 0 ? "free, all reused" : `~${money(cost)}`}
            </span>
          )}
        </>
      )}
    </form>
  );
}

/**
 * Under Test every model, for a suite with `reuseAnswers: false`: why a
 * retest costs as much as the first test, and that a stopped test still
 * picks up where it left off.
 *
 * @param props.resumeWithinMs - How long a stopped test's answers are kept
 *   (`resumeWithin(suite)`); 0 when they aren't.
 */
export function NoReuseNote({ resumeWithinMs }: { resumeWithinMs: number }) {
  return (
    <p className="readable text-sm text-muted">
      Every test asks each model for new answers: this suite doesn&apos;t reuse
      earlier ones, since its answers depend on when they&apos;re made.
      {resumeWithinMs > 0 &&
        ` A test that stopped partway picks up where it left off if you test again within ${spanText(resumeWithinMs)}.`}
    </p>
  );
}
