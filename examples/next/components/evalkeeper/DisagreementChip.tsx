import type { DisagreementKind } from "@crowandraven/evalkeeper";
import { Chip, Tip } from "@crowandraven/evalkeeper/react";

/** How each kind of disagreement shows: its chip and its glossary entry. */
const KIND = {
  broke: { text: "Broke", tone: "serious", term: "broke" },
  fixed: { text: "Fixed", tone: "live", term: "fixed" },
  differ: {
    text: "Missed differently",
    tone: "warn",
    term: "missedDifferently",
  },
} as const satisfies Record<DisagreementKind, unknown>;

/**
 * How two tests disagree on a case (broke, fixed, or missed differently),
 * as a chip with its tooltip. `id` keeps tooltip ids unique on a list.
 */
export function DisagreementChip({
  kind,
  id,
  align,
}: {
  kind: DisagreementKind;
  id: string;
  align?: "center" | "end";
}) {
  const k = KIND[kind];
  return (
    <Tip term={k.term} id={id} {...(align ? { align } : {})}>
      <Chip tone={k.tone}>{k.text}</Chip>
    </Tip>
  );
}
