import { generateText, Output } from "ai";
import { z } from "zod";
import {
  costOf,
  instructionsHash,
  slot,
  type Pairing,
} from "@evalkeeper/ai-sdk";
import {
  formText,
  linesOf,
  wordPairs,
  type CheckDef,
  type Suite,
} from "evalkeeper";
import { demoCall } from "../demo";
import { MODELS, isDemo } from "../models";

/**
 * Example suite: pulling the action items out of meeting notes. Graded by
 * meaning: each expected item is matched to the model's items by a judge
 * model when a key is set, and by shared words otherwise. Partial credit:
 * the headline counts items found of items expected.
 */

const input = z.object({ notes: z.string() });
const label = z.object({ items: z.array(z.string()) });
type Input = z.infer<typeof input>;
type Label = z.infer<typeof label>;
type Output = { items: string[] };

const SYSTEM = `You read meeting notes and list the action items: things someone agreed to do. One short line each, with the owner when the notes name one. Leave out decisions, updates, and ideas nobody took on.`;
const schema = z.object({
  items: z.array(
    z.string().describe("One action item, owner first when named"),
  ),
});
export const actionItemsVersion = instructionsHash({
  texts: [SYSTEM, slot("notes")],
  schemas: [schema],
});

const CHECKS: CheckDef[] = [
  {
    key: "found",
    label: "Finds the action items",
    description:
      "Each item in the answer key matches one of the model's items by meaning. Partial credit: the headline counts items found.",
    kind: "label",
    severity: "serious",
    bar: 0.85,
  },
  {
    key: "no_extras",
    label: "Nothing extra",
    description:
      "At most one item that isn't in the answer key. Minor: an extra line is cheap to ignore, but a list of them buries the real ones.",
    kind: "label",
    severity: "minor",
  },
];

type Starter = NonNullable<Suite<Input, Output, Label>["starter"]>[number];
const s = (
  notes: string,
  items: string[],
  tags: string[],
  note: string,
  split: "DEV" | "TEST" = "DEV",
): Starter => ({ input: { notes }, label: { items }, tags, split, note });

export const ACTION_STARTERS: Starter[] = [
  s(
    "Launch sync. Priya will send the release notes to support by Thursday. We decided to skip the webinar. Tom to fix the pricing page typo.",
    [
      "Priya sends release notes to support by Thursday",
      "Tom fixes the pricing page typo",
    ],
    ["owners", "decision mixed in"],
    "A decision that isn't an action.",
  ),
  s(
    "Design review. Everyone liked option B. Lee will build a clickable prototype of option B. Someone should ask legal about the cookie banner — Ana said she would.",
    [
      "Lee builds a clickable prototype of option B",
      "Ana asks legal about the cookie banner",
    ],
    ["owners", "indirect owner"],
    "An owner named after the fact.",
  ),
  s(
    "Budget call. Q3 spend is on track. No action items this week.",
    [],
    ["none"],
    "Nothing to do: the answer key must allow none.",
  ),
  s(
    "Hiring. Sam will post the designer role Monday. Interview loop stays the same. Jo to book rooms for the onsite on the 14th. Sam and Jo will both review portfolios.",
    [
      "Sam posts the designer role Monday",
      "Jo books rooms for the onsite on the 14th",
      "Sam and Jo review portfolios",
    ],
    ["owners", "shared owner"],
    "Two people on one item.",
  ),
  s(
    "Retro. Deploys were slow. Idea: nightly builds (no owner). Kim will write up the incident from Tuesday.",
    ["Kim writes up Tuesday's incident"],
    ["idea not taken"],
    "An idea nobody took on stays out.",
  ),
  s(
    "Customer call with Brightway. They want SSO by June. Alex will send them our security overview today and set up a follow-up call next week.",
    [
      "Alex sends Brightway the security overview today",
      "Alex sets up a follow-up call next week",
    ],
    ["one owner, two items"],
    "Two items from one sentence.",
  ),
  s(
    "Planning. Mobile team owns offline mode. Web team will look into the slow search; Riya leads that.",
    ["Riya leads the web team's look into slow search"],
    ["team owner"],
    "Ownership of an area isn't an action; the search work is.",
  ),
  s(
    "Office move. Movers come Friday. Everyone pack your desk by Thursday. Dev will update the address on the website.",
    [
      "Everyone packs their desk by Thursday",
      "Dev updates the address on the website",
    ],
    ["everyone"],
    "An item for everyone.",
  ),
  s(
    "Quarterly review. Revenue up 8%. Churn flat. Mei to share the deck with the board, and Omar will dig into why trial conversions dipped.",
    [
      "Mei shares the deck with the board",
      "Omar looks into why trial conversions dipped",
    ],
    ["numbers nearby"],
    "Numbers that aren't actions.",
    "TEST",
  ),
  s(
    "Vendor check-in. Contract renews in May. Luis will ask for a discount before renewal. We'll revisit analytics vendors next quarter.",
    ["Luis asks for a discount before the May renewal"],
    ["later, no owner"],
    "A someday item with no owner stays out.",
    "TEST",
  ),
];

const KNOWN = new Map(
  ACTION_STARTERS.map((x) => [x.input.notes, x.label.items]),
);

/**
 * The matcher: a judge model when the app has one (set by the runner
 * setup), else shared words. Swappable so tests run without a key.
 */
let matcher: (
  expected: string[],
  actual: string[],
  onCost?: (usd: number) => void,
) => Promise<Pairing> = async (e, a) => ({
  pairs: wordPairs(e, a),
  by: "words",
});
export function useMatcher(m: typeof matcher) {
  matcher = m;
}

export const actionItems: Suite<Input, Output, Label> = {
  key: "action_items",
  operation: "action_items",
  priority: { favor: "quality" },
  label: "Action items",
  description:
    "Listing the action items in meeting notes, which become tasks people are assigned.",
  graderVersion: "1",
  unitNoun: "items",
  caseKind: "typed",
  input,
  labelValue: label,
  checks: CHECKS,
  async run(i, ctx) {
    if (isDemo(ctx.model)) {
      const right = KNOWN.get(i.notes) ?? [];
      return demoCall(
        ctx.model,
        i.notes,
        () => ({ items: right }),
        () => ({
          items: [...right.slice(1), "Follow up on everything discussed"],
        }),
        ctx.onCost,
      );
    }
    const { languageModel } = await import("../ai");
    const r = await generateText({
      model: languageModel(ctx.model),
      system: SYSTEM,
      prompt: i.notes,
      output: Output.object({ schema }),
    });
    const usd = costOf(MODELS, ctx.model, r.usage);
    if (usd !== null) ctx.onCost(usd);
    return r.output;
  },
  async grade(_i, out, want, ctx) {
    if (!want) return CHECKS.map((c) => ({ key: c.key, pass: null }));
    const { pairs, by } = await matcher(want.items, out.items, ctx?.onCost);
    const missed = want.items.filter(
      (_, e) => !pairs.some((p) => p.expected === e),
    );
    const extras = out.items.filter(
      (_, a) => !pairs.some((p) => p.actual === a),
    );
    return [
      {
        key: "found",
        pass: want.items.length ? missed.length === 0 : out.items.length === 0,
        ...(want.items.length
          ? {
              units: {
                right: want.items.length - missed.length,
                total: want.items.length,
              },
            }
          : {}),
        ...(missed.length ? { note: `Missed: ${missed.join("; ")}` } : {}),
        matchedBy: by,
        matches: pairs.map((p) => ({
          expected: want.items[p.expected] ?? "",
          actual: out.items[p.actual] ?? "",
          why: p.why,
        })),
      },
      {
        key: "no_extras",
        pass: extras.length <= 1,
        note: extras.length
          ? `Not in the answer key: ${extras.join("; ")}`
          : undefined,
      },
    ];
  },
  inputFromForm(form) {
    return input.parse({ notes: formText(form, "notes") });
  },
  labelFromOutput: (out) => ({ items: out.items }),
  labelFromForm(form) {
    return label.parse({ items: linesOf(form, "items") });
  },
  fields: {
    input: [
      {
        name: "notes",
        label: "Meeting notes",
        help: "The notes as someone wrote them. Use first names only.",
        kind: "textarea",
        required: true,
      },
    ],
    label: [
      {
        name: "items",
        label: "Action items",
        help: "One per line, in your own words: things someone agreed to do, with the owner when the notes name one. Leave it empty when there are none.",
        kind: "lines",
      },
    ],
  },
  starter: ACTION_STARTERS,
  title: (i) => (i.notes.split(".")[0] ?? i.notes).slice(0, 60),
  describe: (i) => i.notes,
  labelHelp: "items: the action items, one line each, in your own words.",
};
