import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NoReuseNote, TestAll } from "./TestAll.js";

const action = async () => {};
const html = (cost: number | null, confirmAbove = 5) =>
  renderToStaticMarkup(
    <TestAll
      action={action}
      suite="triage"
      cost={cost}
      confirmAbove={confirmAbove}
      id="t"
    />,
  );

describe("Test every model", () => {
  it("submits at once when it costs little, and says what", () => {
    const page = html(0.42);
    expect(page).toMatch(/<button type="submit"[^>]*>Test every model/);
    expect(page).toContain("~$0.42");
    expect(html(0)).toContain("free, all reused");
  });

  it("asks first when it costs more than the limit, or a price is unknown", () => {
    for (const page of [html(12.4), html(null)]) {
      expect(page).not.toMatch(/type="submit"/);
      expect(page).toMatch(/<button type="button"[^>]*>Test every model/);
    }
    expect(html(12.4)).toContain("~$12");
  });

  it("says why a suite that never reuses answers pays in full each time", () => {
    const day = renderToStaticMarkup(
      <NoReuseNote resumeWithinMs={86_400_000} />,
    );
    expect(day).toContain("this suite doesn&#x27;t reuse earlier ones");
    expect(day).toContain(
      "A test that stopped partway picks up where it left off if you test again within a day.",
    );
    // Turned off: no promise about stopped tests.
    expect(
      renderToStaticMarkup(<NoReuseNote resumeWithinMs={0} />),
    ).not.toContain("picks up");
  });
});
