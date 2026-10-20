import type { CheckDef, CheckResult } from "./types";

/**
 * Checks shared by suites: rules many operations' instructions state the
 * same way (lib/ai/voice.ts, "don't invent numbers"). Pure, so they're
 * unit-tested and rerun on stored outputs for free.
 */

// He, she, and the like never belong in text addressed to the person.
// They, them, and their often mean things, so they count only when they
// open a sentence the way writing about the person would ("They want").
const PRONOUNS = /\b(he|she|him|her|his|hers|himself|herself)\b/i;
const THIRD_PERSON_START = /(^|[.!?]\s+)(they|their|them)\b/i;

/** Text that refers to the person as he, she, or they; null when none. */
export function thirdPerson(text: string): string | null {
  const m = text.match(PRONOUNS) ?? text.match(THIRD_PERSON_START);
  return m ? m[0].trim().replace(/^[.!?]\s*/, "") : null;
}

/**
 * Standard phrasing whose numbers aren't claims about the person: a "first
 * 90 days" plan, "30-60-90", "2 to 3 minutes", a "top 5", a quarter (Q3),
 * fact ids ("[f9]"), and list markers ("(1)", "2.").
 */
export function withoutStockPhrases(text: string): string {
  return (
    text
      .replace(/\b30\s*[-–/]\s*60\s*[-–/]\s*90\b/g, " ")
      .replace(/\b(?:first|next|initial)\s+(?:30|60|90|100)\s+days\b/gi, " ")
      .replace(/\b(?:30|60|90)\s+days?\s*[:\-–]/gi, " ")
      .replace(
        /\b\d+\s*(?:to|-|–|or)\s*\d+\s*(?:minutes?|mins?|sentences?|seconds?)\b/gi,
        " ",
      )
      .replace(
        /\b(?:under|about|in|within)\s+\d+\s+(?:minutes?|seconds?)\b/gi,
        " ",
      )
      .replace(/\btop\s+(?:3|5|10)\b/gi, " ")
      .replace(/\bQ[1-4]\b/g, " ")
      // References, not figures: fact ids ("[f9]", "f10") and list markers.
      .replace(/\bf\d+\b/g, " ")
      .replace(/\(\d{1,2}\)/g, " ")
      .replace(/(^|\n)\s*\d{1,2}[.)]\s/g, "$1 ")
  );
}

/** Nouns a number counts in a claim ("twenty years", "five reports"). */
const COUNTED =
  "years?|months?|weeks?|hours?|people|employees|staff|clients|customers|direct reports|reports|students|patients|accounts|projects|sites|schools|percent";

const NUMBER_WORDS =
  "(?:(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[\\s-](?:one|two|three|four|five|six|seven|eight|nine))?|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|two|three|four|five|six|seven|eight|nine|ten)";

/**
 * Number words that count something in an answer ("twenty years", "a
 * decade", "five direct reports") as digits, so an invented figure written
 * out is caught too. Number words that count nothing ("one idea", "two
 * things to try") stay words.
 */
export function withCountedWords(text: string): string {
  return text
    .replace(/\b(?:a|one)\s+decade\b/gi, "10 years")
    .replace(
      new RegExp(`\\b${NUMBER_WORDS}(?=\\s+(?:${COUNTED})\\b)`, "gi"),
      (w) => withNumberWords(w),
    );
}

/**
 * Numbers in `text` that appear in none of the sources (150k and 150,000
 * count as the same). Years and small counts are numbers too: a letter
 * that says "12 years" when the profile says 10 has invented one.
 */
export function inventedNumbers(text: string, sources: string[]): string[] {
  const known = new Set(
    sources.flatMap((s) => [...numbersIn(withNumberWords(s))]),
  );
  const out: string[] = [];
  const claims = withCountedWords(withoutStockPhrases(text));
  for (const m of claims.matchAll(/\d[\d,]*(?:\.\d+)?\s*[km]?\b/gi)) {
    const found = numbersIn(m[0]);
    if (![...found].some((n) => known.has(n))) out.push(m[0].trim());
  }
  return [...new Set(out)];
}

export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/** Sentences, counted by their ending punctuation (a last one without it counts). */
export function sentenceCount(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  const ends = t.match(/[.!?]+(\s|$)/g)?.length ?? 0;
  return /[.!?]["')\]]?$/.test(t) ? ends : ends + 1;
}

/** Pass when n is within [min, max]; the note says what it was. */
export function inRange(
  key: string,
  n: number,
  min: number,
  max: number,
  noun: string,
): CheckResult {
  const pass = n >= min && n <= max;
  return {
    key,
    pass,
    note: pass
      ? undefined
      : `${n} ${noun}; should be ${min === max ? min : `${min} to ${max}`}`,
  };
}

/** The "addressed as you" check over several pieces of text. */
export function voiceCheck(key: string, texts: string[]): CheckResult {
  for (const t of texts) {
    const hit = thirdPerson(t);
    if (hit) return { key, pass: false, note: `"${hit}" in: ${t}` };
  }
  return { key, pass: true };
}

/** The "no invented numbers" check over several pieces of text. */
export function numbersCheck(
  key: string,
  texts: string[],
  sources: string[],
): CheckResult {
  const invented = [
    ...new Set(texts.flatMap((t) => inventedNumbers(t, sources))),
  ];
  return invented.length
    ? {
        key,
        pass: false,
        note: `Not in what it was given: ${invented.join(", ")}`,
      }
    : { key, pass: true };
}

export const VOICE_CHECK: CheckDef = {
  key: "voice",
  label: 'Addressed as "you"',
  description:
    'Never "he", "she", or "they" for the person (lib/ai/voice.ts): they read it about themselves.',
  kind: "code",
  severity: "serious",
};

export const NUMBERS_CHECK: CheckDef = {
  key: "numbers",
  label: "No invented numbers",
  description:
    "Every number appears in what the model was given (150k and 150,000 count as the same).",
  kind: "code",
  severity: "serious",
};

/** Numbers in text, with "150k" and "1.5m" also read as 150000 and 1500000. */
export function numbersIn(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*([km])?\b/gi)) {
    const n = Number(m[1].replace(/,/g, ""));
    if (!Number.isFinite(n)) continue;
    out.add(String(n));
    const suffix = m[2]?.toLowerCase();
    if (suffix === "k") out.add(String(Math.round(n * 1_000)));
    if (suffix === "m") out.add(String(Math.round(n * 1_000_000)));
  }
  return out;
}

const ONES = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
];
const TENS = [
  "",
  "",
  "twenty",
  "thirty",
  "forty",
  "fifty",
  "sixty",
  "seventy",
  "eighty",
  "ninety",
];

/**
 * Number words up to ninety-nine as digits ("sixteen weeks" → "16 weeks",
 * "twenty-one" → "21"), for the evidence side of a number check: sources
 * often spell numbers out where answers use digits.
 */
export function withNumberWords(text: string): string {
  const tens = TENS.filter(Boolean).join("|");
  return text
    .replace(
      new RegExp(`\\b(${tens})[\\s-](${ONES.slice(1, 10).join("|")})\\b`, "gi"),
      (_, t: string, o: string) =>
        String(
          TENS.indexOf(t.toLowerCase()) * 10 + ONES.indexOf(o.toLowerCase()),
        ),
    )
    .replace(new RegExp(`\\b(${tens})\\b`, "gi"), (t: string) =>
      String(TENS.indexOf(t.toLowerCase()) * 10),
    )
    .replace(new RegExp(`\\b(${ONES.join("|")})\\b`, "gi"), (o: string) =>
      String(ONES.indexOf(o.toLowerCase())),
    );
}

/**
 * A word's stem for matching: words of 5 letters or more lose one common
 * ending ("training", "trained" → "train"); shorter words and codes ("AR",
 * "CPT") match as written, so "AR" never matches "are".
 */
export function stem(word: string): string {
  const w = word.toLowerCase();
  if (w.length < 5) return w;
  const cut = w
    .replace(/(ings|ing|ers|er|ed|es|ions|ion|ly|s)$/, "")
    // "drone" and "drones" both become "dron".
    .replace(/(.{4,})e$/, "$1");
  return cut.length >= 4 ? cut : w;
}

const wordsOf = (text: string) => text.toLowerCase().match(/[a-z0-9]+/g) ?? [];

/**
 * Whether every word of `phrase` appears in `text`, by stem ("trained new
 * staff" has "training"). "a|b" accepts either phrase.
 */
export function hasPhrase(text: string, phrase: string): boolean {
  const have = new Set(wordsOf(text).map(stem));
  return phrase
    .split("|")
    .some((p) => wordsOf(p).every((w) => have.has(stem(w))));
}

/** Words that carry meaning, stemmed: for matching by shared words. */
export function contentWords(text: string): Set<string> {
  return new Set(
    (text.toLowerCase().match(/[a-z0-9]+/g) ?? [])
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
      .map(stem),
  );
}

const STOP_WORDS = new Set(
  "the and for with that this from into onto over under about after before their there them they you your our its are was were will would should could has have had not but all any can each per out off than then when what who how why".split(
    " ",
  ),
);

/**
 * Pairs expected items with actual ones by shared content words, best
 * overlap first, one to one. The fallback when no judge model is set: it
 * misses paraphrases, so a meaning judge is better.
 */
export function wordPairs(
  expected: string[],
  actual: string[],
  /** Share of an expected item's words the actual one must have. */
  minShare = 0.5,
): { expected: number; actual: number; why: string }[] {
  const scored: { e: number; a: number; share: number }[] = [];
  expected.forEach((et, e) => {
    const ew = contentWords(et);
    if (!ew.size) return;
    actual.forEach((at, a) => {
      const aw = contentWords(at);
      const shared = [...ew].filter((w) => aw.has(w)).length;
      if (shared / ew.size >= minShare)
        scored.push({ e, a, share: shared / ew.size });
    });
  });
  const usedE = new Set<number>();
  const usedA = new Set<number>();
  const out: { expected: number; actual: number; why: string }[] = [];
  for (const s of scored.sort((x, y) => y.share - x.share)) {
    if (usedE.has(s.e) || usedA.has(s.a)) continue;
    usedE.add(s.e);
    usedA.add(s.a);
    out.push({
      expected: s.e,
      actual: s.a,
      why: `${Math.round(s.share * 100)}% of the words match`,
    });
  }
  return out.sort((x, y) => x.expected - y.expected);
}
