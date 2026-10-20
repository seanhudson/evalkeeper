import { describe, expect, it } from "vitest";
import {
  wordPairs,
  numbersIn,
  inRange,
  inventedNumbers,
  numbersCheck,
  sentenceCount,
  thirdPerson,
  voiceCheck,
  wordCount,
  withNumberWords,
  hasPhrase,
  withoutStockPhrases,
  withCountedWords,
} from "./common";

describe("shared eval checks", () => {
  it("finds he, she, and a sentence opening with they", () => {
    expect(thirdPerson("She led a team of 40.")).toBe("She");
    expect(thirdPerson("Strong fit. They want remote work.")).toBe("They");
    expect(thirdPerson("You lead teams; keep them small.")).toBeNull();
    expect(thirdPerson("Your reports and their managers")).toBeNull();
  });

  it("counts a number as known when any source has it, in any form", () => {
    expect(inventedNumbers("A base of $150k", ["at least 150,000"])).toEqual(
      [],
    );
    expect(
      inventedNumbers("Led 12 people for 10 years", [
        "Ten years; led 10 people",
      ]),
    ).toEqual(["12"]);
  });

  it("counts words and sentences", () => {
    expect(wordCount("  one two\nthree ")).toBe(3);
    expect(sentenceCount("One. Two! Three?")).toBe(3);
    expect(sentenceCount("One. Two without an end")).toBe(2);
    expect(sentenceCount("")).toBe(0);
  });

  it("explains a count out of range", () => {
    expect(inRange("n", 3, 2, 4, "facts").pass).toBe(true);
    expect(inRange("n", 6, 2, 4, "facts")).toMatchObject({
      pass: false,
      note: "6 facts; should be 2 to 4",
    });
  });

  it("wraps voice and numbers as checks", () => {
    expect(voiceCheck("voice", ["You fit.", "He fits."]).pass).toBe(false);
    expect(
      numbersCheck("numbers", ["Grew 6 to 40"], ["6 to 40 people"]).pass,
    ).toBe(true);
  });
});

describe("number words and stems", () => {
  it("reads number words in the evidence", () => {
    expect(withNumberWords("sixteen weeks, twenty-one days, forty")).toBe(
      "16 weeks, 21 days, 40",
    );
    expect(
      inventedNumbers("16 weeks of leave", ["Sixteen weeks of leave"]),
    ).toEqual([]);
  });

  it("matches words by stem, but short words and codes as written", () => {
    expect(hasPhrase("Trained new staff", "training")).toBe(true);
    expect(hasPhrase("Nurses ratified a contract", "contracts")).toBe(true);
    expect(hasPhrase("We are hiring", "AR")).toBe(false);
    expect(hasPhrase("Inspection drones for turbines", "drone")).toBe(true);
    expect(hasPhrase("frequent reorganizations", "reorganization")).toBe(true);
    expect(hasPhrase("Works in AR and billing", "AR")).toBe(true);
    expect(
      hasPhrase(
        "a public two-year college",
        "community college|two-year college",
      ),
    ).toBe(true);
  });
});

describe("standard phrasing and counted number words", () => {
  it("doesn't count a 30-60-90 plan or a time limit as a claim", () => {
    expect(
      inventedNumbers(
        "In your first 90 days, what would you do? First 30 days: listen. Keep it to 2 to 3 minutes. Name your top 3 wins from Q3.",
        ["A product role."],
      ),
    ).toEqual([]);
    expect(withoutStockPhrases("a 30-60-90 day plan")).not.toMatch(/90/);
  });

  it("doesn't count fact ids or list markers", () => {
    expect(
      inventedNumbers(
        "Open items: (1) you want to leave firm work ([f2]) but f9 says otherwise. (3) Travel.\n2. Pay floor.",
        ["A lawyer."],
      ),
    ).toEqual([]);
  });

  it("still catches an invented result", () => {
    expect(
      inventedNumbers(
        "Decreased adverse events by 20% in your first 90 days.",
        ["Nurse on a med-surg unit."],
      ),
    ).toEqual(["20"]);
  });

  it("reads counted number words as numbers, and leaves the rest", () => {
    expect(
      withCountedWords(
        "over a decade, twenty years, five direct reports, one idea",
      ),
    ).toBe("over 10 years, 20 years, 5 direct reports, one idea");
    expect(
      inventedNumbers("You bring twenty years of teaching.", [
        "Teacher since 2015.",
      ]),
    ).toEqual(["20"]);
    expect(
      inventedNumbers("You have one idea worth testing.", ["A teacher."]),
    ).toEqual([]);
  });
});

describe("wordPairs", () => {
  it("pairs by shared words, one to one", () => {
    const pairs = wordPairs(
      ["Send the invoice to Dana", "Book the venue for March"],
      ["Book a venue in March", "Dana gets the invoice", "Unrelated"],
    );
    expect(pairs.map((p) => [p.expected, p.actual])).toEqual([
      [0, 1],
      [1, 0],
    ]);
  });
});

describe("grader helpers on hostile input", () => {
  // Model output is untrusted: these must stay fast on long, odd strings.
  const fast = (fn: () => unknown) => {
    const start = performance.now();
    fn();
    return performance.now() - start;
  };

  it("counts sentences in linear time, and the same way", () => {
    expect(sentenceCount("Hi!! There?! Done")).toBe(3);
    expect(sentenceCount("One. Two.")).toBe(2);
    expect(fast(() => sentenceCount("!".repeat(50_000) + "x"))).toBeLessThan(
      200,
    );
  });

  it("finds numbers in linear time, and the same ones", () => {
    expect([
      ...numbersIn("Saved $1,200 in 3rd place at 10am, 1.5m users"),
    ]).toEqual(expect.arrayContaining(["1200", "1.5", "1500000"]));
    expect(numbersIn("3rd 10am").size).toBe(0);
    expect(fast(() => numbersIn("9" + "0".repeat(50_000) + "x"))).toBeLessThan(
      200,
    );
  });
});
