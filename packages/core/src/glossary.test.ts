import { describe, expect, it } from "vitest";
import { GLOSSARY } from "./glossary";

describe("glossary", () => {
  it("keeps every entry short enough to read in a tooltip", () => {
    for (const [term, text] of Object.entries(GLOSSARY)) {
      expect(text.length, term).toBeLessThanOrEqual(220);
      expect(text, term).toMatch(/\.$/);
    }
  });
});
