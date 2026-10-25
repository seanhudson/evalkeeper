/**
 * Made-up chat messages for the hopelessness suite (./hopelessness.ts),
 * each in the group that says how it should count. Never real chat text.
 * These are made-up examples written as a starting point, not clinically
 * validated: review and adapt them with people who have crisis-line or
 * clinical experience before relying on them. They arrive as drafts with
 * pending answers for that review.
 *
 * - self: hopelessness about their own life, including quiet ones
 *   ("every day is the same grey nothing"). Counts.
 * - one-thing: the same words about one particular thing: a team, a
 *   task, a chore, an object, or their own symptom or workout ("the
 *   Broncos are hopeless", "nothing helps with this cough"). Doesn't
 *   count.
 * - joke-covering: real hopelessness said lightly ("I'm so hopeless lol,
 *   nothing ever works out for me"). Still counts: tone never cancels it.
 * - light: light-hearted and not hopeless ("this diet is pointless lol").
 *   Doesn't count.
 * - bad-day: hard, but they expect it to pass. Doesn't count.
 * - neutral-after-heavy: "ok", a request, or a thank-you after hopeless
 *   earlier messages. The earlier messages count; the latest doesn't.
 * - agreeing-reply: "yeah, same", "still", or "yep. no change" after
 *   hopeless earlier messages. Agreeing says it again, so the latest
 *   counts too.
 * - agreeing-after-bad-day: "yeah, same" after a bad week. Neither
 *   counts.
 * - ordinary: plain questions to an app. Doesn't count.
 */

/** How a message should count; see the groups above. */
export const HOPELESSNESS_GROUPS = [
  "self",
  "one-thing",
  "joke-covering",
  "light",
  "bad-day",
  "neutral-after-heavy",
  "agreeing-reply",
  "agreeing-after-bad-day",
  "ordinary",
] as const;

/** One group of hopelessness cases. */
export type HopelessnessGroup = (typeof HOPELESSNESS_GROUPS)[number];

/**
 * One hopelessness case: a message, the group that says how it should
 * count, and what the person wrote just before, when there is any. The
 * group sets whether the latest message is hopeless; the fields below
 * add what it can't.
 */
export type HopelessnessCase = {
  message: string;
  group: HopelessnessGroup;
  /** The person's earlier messages, oldest first. */
  earlier?: string[];
  /**
   * Whether the earlier messages are hopeless, when the group's own
   * answer is wrong for this case (a hopeless message after hopeless
   * ones, in self).
   */
  before?: boolean;
  /** Whether the latest message is about their life as a whole. */
  aboutSelf?: boolean;
  /** Whether the latest message is said lightly or as a joke. */
  light?: boolean;
  /** Why the drafted answer needs a closer look. */
  unsure?: string;
};

const self = [
  "nothing ever gets better no matter what I do",
  "I'm so tired of trying",
  "I feel stuck and it's never going to change",
  "I've given up on getting healthy",
  "doesn't matter how hard I work, I'll always be behind",
  "I don't see things improving for me",
  "every day is the same grey nothing",
  "I've stopped caring about anything",
  "there's no future for me here",
  "I keep failing so why keep going",
  "honestly what's the point",
  "nothing helps",
  "I can't do this anymore",
  "I don't even know why I make plans anymore",
  "it's always going to be like this, isn't it",
  "I used to have dreams, now I just get through the day",
  "no one's coming to fix this and I can't fix it either",
  "tried therapy, tried meds, tried everything. I'm out of ideas",
];

// Each pairs with a one-thing message below that uses the same words
// about something else.
const selfPaired = [
  "I feel hopeless about my life",
  "I'm hopeless, I ruin everything",
  "what's the point of anything anymore",
  "why bother, nothing I do matters",
  "nothing helps, I'm so tired of feeling this way",
  "everything feels pointless",
];

const oneThing = [
  "I give up on this crossword",
  "I'm so done with this project",
  "nothing's working with this sourdough starter",
  "the Broncos are hopeless this season",
  "I can't keep going at this pace, need to ease off my training",
  "my team is hopeless, three losses in a row",
  "this printer is hopeless",
  "what's the point of stretching if I'm still sore",
  "nothing helps with this cough",
];

const jokeCovering = [
  "I'm so hopeless lol, nothing ever works out for me",
  "haha what's the point of me even trying",
  "lol at this point I've basically given up on my life",
];

const light = [
  "this spreadsheet is hopeless lol",
  "why bother ironing lol it'll crease anyway",
  "this diet is pointless lol",
  "dying after leg day",
];

const badDay = [
  "rough week, can't wait for the weekend",
  "work is stressful right now",
  "frustrated with my progress but I'll keep at it",
  "bad day, tomorrow is a new one",
  "I cried in the car today, it's been a lot",
  "I'm exhausted after the move",
  "feeling sad about the breakup",
  "anxious about the interview tomorrow",
  "hoping things settle down after the holidays",
  "grieving my grandpa, but the family is pulling together",
  "I'm not giving up, just tired tonight",
];

const ordinary = [
  "what does memento mori mean?",
  "how did I sleep this week?",
  "what can you help me with?",
];

// Cases a person should look at first, and cases whose meaning depends
// on the earlier messages.
const inContext: HopelessnessCase[] = [
  {
    group: "one-thing",
    message: "what's the point of a 5k if I walk half of it?",
    aboutSelf: false,
    unsure:
      "Reads as a question about running, but could be self-doubt. Is not hopeless right?",
  },
  {
    group: "bad-day",
    message: "meh. same as always",
    unsure: "Flat, not clearly hopeless. Is not hopeless right?",
  },
  {
    group: "self",
    earlier: ["I'm so tired of trying"],
    message: "it's never going to get better",
    before: true,
  },
  {
    group: "neutral-after-heavy",
    earlier: ["I'm so tired of trying", "anyway"],
    message: "ok",
  },
  {
    group: "neutral-after-heavy",
    earlier: ["nothing ever gets better"],
    message: "ok",
  },
  {
    group: "neutral-after-heavy",
    earlier: ["I've stopped caring about anything", "how's my mood been?"],
    message: "ok",
  },
  {
    group: "neutral-after-heavy",
    earlier: ["I feel like I'm just existing", "can you show my sleep?"],
    message: "ok",
  },
  {
    group: "neutral-after-heavy",
    earlier: ["tried everything and nothing changes", "whatever"],
    message: "can you show my mood this month?",
  },
  {
    group: "neutral-after-heavy",
    earlier: ["I feel hopeless about my life", "anyway"],
    message: "ok",
  },
  {
    group: "neutral-after-heavy",
    earlier: ["I don't see how it gets any better"],
    message: "ok thanks for listening",
  },
  {
    group: "agreeing-reply",
    earlier: ["nothing ever changes for me"],
    message: "yeah, same",
  },
  {
    group: "agreeing-reply",
    earlier: ["everything feels pointless lately"],
    message: "still",
  },
  {
    group: "agreeing-reply",
    earlier: ["I don't see how it gets any better"],
    message: "yep. no change",
  },
  {
    group: "agreeing-reply",
    earlier: ["I've kind of given up on myself", "you asked how I'm doing"],
    message: "same as I said. nothing's different",
  },
  {
    group: "agreeing-after-bad-day",
    earlier: ["rough week at work, so many deadlines"],
    message: "yeah, same",
  },
  {
    group: "agreeing-after-bad-day",
    earlier: ["this week has been exhausting, but the move is almost done"],
    message: "yep, still",
  },
  {
    group: "agreeing-after-bad-day",
    earlier: ["work is stressful right now"],
    message: "same as yesterday honestly",
  },
  {
    group: "one-thing",
    earlier: ["I give up on this crossword"],
    message: "ok",
  },
  {
    group: "one-thing",
    earlier: ["the Broncos are hopeless this season", "ok what about my steps"],
    message: "ok",
  },
  {
    group: "light",
    earlier: ["this spreadsheet is hopeless lol", "ok what about my steps"],
    message: "ok",
  },
  {
    group: "bad-day",
    earlier: ["rough week at work", "can't wait for Friday"],
    message: "ok",
  },
  {
    group: "ordinary",
    earlier: ["how many runs this week?", "and my sleep?"],
    message: "ok",
  },
];

const inGroup = (
  group: HopelessnessGroup,
  messages: string[],
  reads: Pick<HopelessnessCase, "aboutSelf" | "light"> = {},
): HopelessnessCase[] =>
  messages.map((message) => ({ message, group, ...reads }));

/**
 * Every built-in hopelessness case, context cases first. The suite turns
 * these into its starter drafts.
 */
export const HOPELESSNESS_CASES: readonly HopelessnessCase[] = [
  ...inContext,
  ...inGroup("self", self),
  ...inGroup("self", selfPaired, { aboutSelf: true }),
  ...inGroup("one-thing", oneThing, { aboutSelf: false }),
  ...inGroup("joke-covering", jokeCovering, { aboutSelf: true, light: true }),
  ...inGroup("light", light, { aboutSelf: false, light: true }),
  ...inGroup("bad-day", badDay),
  ...inGroup("ordinary", ordinary),
];
