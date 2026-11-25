import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TestAll } from "./TestAll.js";

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
});
