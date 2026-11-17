import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  Marked,
  ReadableValue,
  blocksOf,
  hasMark,
  humanize,
} from "./Readable.js";
import { CaseStatusChip } from "./ConfirmAnswer.js";
import { FieldValues, Fields } from "./Fields.js";

const html = (node: React.ReactNode) => renderToStaticMarkup(node);

describe("readable values", () => {
  it("names keys as words", () => {
    expect(humanize("linkStatus")).toBe("Link status");
    expect(humanize("posting_text")).toBe("Posting text");
  });

  it("shows an object as labeled rows, not data", () => {
    const out = html(
      <ReadableValue
        value={{ title: "Welder", linkStatus: "VERIFIED", pay: null }}
      />,
    );
    expect(out).toContain("<dt");
    expect(out).toContain("Link status");
    expect(out).toContain("Verified");
    expect(out).not.toContain("{");
  });

  it("shows long text as paragraphs, folded to its start", () => {
    const text = `First paragraph. ${"word ".repeat(80)}\n\nSecond paragraph.`;
    const out = html(<ReadableValue value={text} />);
    expect(out).toContain("<p");
    expect(out).toContain("Show the whole text");
    expect(out).not.toContain("\\n");
  });

  it("reads true and false as Yes and No", () => {
    expect(html(<ReadableValue value={true} />)).toBe("Yes");
    expect(html(<ReadableValue value={{ asIs: false }} />)).toContain(">No<");
  });

  it("folds a long list", () => {
    const out = html(
      <ReadableValue value={["a", "b", "c", "d", "e", "f", "g"]} />,
    );
    expect(out).toContain("Show all 7");
  });
});

describe("highlights", () => {
  it("marks each mark, ignoring case", () => {
    const out = html(
      <Marked
        text="A hybrid role in Columbus"
        marks={["Hybrid", "columbus"]}
      />,
    );
    expect(out).toBe(
      'A <mark class="rounded-sm bg-warn/20 px-0.5 text-ink">hybrid</mark> role in <mark class="rounded-sm bg-warn/20 px-0.5 text-ink">Columbus</mark>',
    );
  });

  it("treats marks as text, not patterns", () => {
    expect(
      html(<Marked text="Pay: $55,000 (base)" marks={["$55,000 (base)"]} />),
    ).toContain("<mark");
  });

  it("finds marks inside nested values", () => {
    expect(hasMark({ job: { location: "Columbus, hybrid" } }, ["HYBRID"])).toBe(
      true,
    );
    expect(hasMark("remote", ["hybrid"])).toBe(false);
    expect(hasMark("anything", [])).toBe(false);
  });

  it("says when a highlight is past the fold", () => {
    const text = `${"word ".repeat(80)} and then a hybrid schedule.`;
    expect(html(<ReadableValue value={text} marks={["hybrid"]} />)).toContain(
      "More highlighted further on.",
    );
  });
});

describe("case status", () => {
  it("shows the stored status until confirmed here", () => {
    const out = html(
      <CaseStatusChip
        labelId="l1"
        status={{ text: "Pending", tone: "warn", term: "pending" }}
        confirmed={{ text: "Confirmed", tone: "live", term: "confirmed" }}
        id="s1"
      />,
    );
    expect(out).toContain("Pending");
  });
});

describe("text blocks", () => {
  it("reads headings, lists, and paragraphs", () => {
    expect(
      blocksOf(
        "### What you want\n- Remote\n- $70K\n\nA closing line\nand more.",
      ),
    ).toEqual([
      { kind: "heading", text: "What you want" },
      { kind: "list", items: ["Remote", "$70K"] },
      { kind: "text", text: "A closing line\nand more." },
    ]);
  });
});

describe("field values", () => {
  it("edits a labeled yes-or-no as a choice", () => {
    const out = html(
      <Fields
        fields={[
          {
            name: "asIs",
            label: "Show their words unchanged?",
            help: "",
            kind: "json",
            optionLabels: { true: "Yes", false: "No" },
          },
        ]}
        values={{ asIs: false }}
      />,
    );
    expect(out).toContain("<select");
    expect(out).toContain('<option value="false" selected="">No</option>');
  });

  it("reads a yes-or-no by its option labels", () => {
    const fields = [
      {
        name: "asIs",
        label: "Show their words unchanged?",
        help: "",
        kind: "json" as const,
        optionLabels: { true: "Yes, as they typed it", false: "No, tidy it" },
      },
    ];
    expect(
      html(<FieldValues fields={fields} values={{ asIs: true }} />),
    ).toContain("Yes, as they typed it");
    expect(
      html(<FieldValues fields={fields} values={{ asIs: false }} />),
    ).toContain("No, tidy it");
  });
});
