import { describe, expect, it } from "vitest";
import { casesInInstructions } from "./inInstructions.js";

const one = (input: unknown, id = "c1") => [{ id, title: `Case ${id}`, input }];
const INSTRUCTIONS = [
  "Decide whether the message is hopeless about the person's own life.",
  "Not hopeless: “The Broncos are hopeless!” is about a team.",
];

describe("casesInInstructions", () => {
  it("finds a whole case text, whatever its case and punctuation", () => {
    expect(
      casesInInstructions(
        one({ message: "the Broncos are hopeless" }),
        INSTRUCTIONS,
      ),
    ).toEqual([
      { caseId: "c1", title: "Case c1", found: "the broncos are hopeless" },
    ]);
  });

  it("finds a long enough stretch inside a longer case", () => {
    const [hit] = casesInInstructions(
      one({ message: "ugh, the broncos are hopeless this season" }),
      INSTRUCTIONS,
    );
    expect(hit?.found).toBe("the broncos are hopeless");
  });

  it("reads strings anywhere in the input, and keeps the longest match", () => {
    const [hit] = casesInInstructions(
      one({
        message: "about the person",
        earlier: [{ text: "is it hopeless about the persons own life" }],
        count: 3,
      }),
      INSTRUCTIONS,
    );
    expect(hit?.found).toBe("hopeless about the persons own life");
  });

  it("leaves out short or partial matches", () => {
    expect(
      casesInInstructions(
        [
          ...one({ message: "hopeless" }, "short"),
          ...one({ message: "the broncos are great this season" }, "partial"),
          ...one({ message: "ok" }, "tiny"),
          ...one({ message: "  !! " }, "blank"),
          ...one(null, "none"),
        ],
        INSTRUCTIONS,
      ),
    ).toEqual([]);
  });

  it("counts a whole short text from the shorter length, and takes other lengths", () => {
    const cases = one({ message: "about a team" });
    expect(casesInInstructions(cases, INSTRUCTIONS)).toHaveLength(1);
    expect(
      casesInInstructions(cases, INSTRUCTIONS, { minWhole: 13 }),
    ).toHaveLength(0);
    expect(
      casesInInstructions(
        one({ message: "whether the message is fine" }),
        INSTRUCTIONS,
        { minChars: 10 },
      )[0]?.found,
    ).toBe("whether the message is");
  });

  it("never matches across two texts, or with no instructions", () => {
    expect(
      casesInInstructions(
        one({ message: "own life not hopeless the broncos" }),
        INSTRUCTIONS,
        { minChars: 30 },
      ),
    ).toEqual([]);
    expect(
      casesInInstructions(one({ message: "the broncos are hopeless" }), []),
    ).toEqual([]);
  });
});
