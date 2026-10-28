import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement as h, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// The app's components file, swapped per test: what an app names in
// lib/evalkeeper/appComponents.ts.
const swapped = vi.hoisted(() => {
  const components: Record<string, unknown> = {};
  return { components };
});
vi.mock("@/lib/evalkeeper/appComponents", () => swapped);

const { Card, Chip, StatusBadge } = await import("../components/evalkeeper/ui");
const { Button, Select, TextArea, TextInput } =
  await import("../components/evalkeeper/Controls");
const { Submit } = await import("../components/evalkeeper/Submit");
const { InfoTip } = await import("../components/evalkeeper/Tip");

const html = (node: ReactNode) => renderToStaticMarkup(node);

afterEach(() => {
  swapped.components = {};
});

describe("the screens' pieces", () => {
  it("draw Evalkeeper's own when the app names none", () => {
    expect(html(h(Card, null, "x"))).toMatch(/^<section class="rounded-lg/);
    expect(html(h(Chip, { tone: "live", children: "Live" }))).toMatch(
      /^<span class=/,
    );
    expect(html(h(Button, { type: "button" }, "Go"))).toBe(
      '<button type="button">Go</button>',
    );
    expect(html(h(TextInput, { name: "reason" }))).toBe(
      '<input name="reason"/>',
    );
    expect(html(h(InfoTip, { text: "Why" }))).toMatch(/role="tooltip"/);
  });

  it("draw the app's own when it names them, with the same props", () => {
    swapped.components = {
      Card: ({ children }: { children: ReactNode }) =>
        h("div", { "data-app": "card" }, children),
      Button: (p: Record<string, unknown>) =>
        h("button", { "data-app": "button", type: p.type, name: p.name }),
      TextInput: (p: Record<string, unknown>) =>
        h("input", { "data-app": "input", name: p.name }),
      TextArea: (p: Record<string, unknown>) =>
        h("textarea", { "data-app": "textarea", name: p.name }),
      Select: (p: { name?: string; children?: ReactNode }) =>
        h("select", { "data-app": "select", name: p.name }, p.children),
      Submit: ({ children }: { children: ReactNode }) =>
        h("button", { "data-app": "submit", type: "submit" }, children),
    };
    expect(html(h(Card, null, "x"))).toBe('<div data-app="card">x</div>');
    expect(html(h(Button, { type: "button", name: "go" }))).toBe(
      '<button data-app="button" type="button" name="go"></button>',
    );
    // Form controls keep their names, so forms still submit.
    expect(html(h(TextInput, { name: "reason" }))).toMatch(/name="reason"/);
    expect(html(h(TextArea, { name: "note" }))).toMatch(/name="note"/);
    expect(
      html(h(Select, { name: "pick" }, h("option", { value: "a" }, "A"))),
    ).toMatch(/data-app="select" name="pick"><option value="a">A/);
    expect(html(h(Submit, null, "Save"))).toBe(
      '<button data-app="submit" type="submit">Save</button>',
    );
  });

  it("use the app's piece inside other pieces too", () => {
    swapped.components = {
      Chip: ({ children }: { children: ReactNode }) =>
        h("mark", null, children),
    };
    // A suite's status is a chip.
    expect(html(h(StatusBadge, { status: "good" }))).toBe("<mark>Good</mark>");
  });

  it("keep Evalkeeper's for the pieces the app leaves out", () => {
    swapped.components = {
      Card: ({ children }: { children: ReactNode }) => h("div", null, children),
    };
    expect(html(h(Chip, { tone: "live", children: "Live" }))).toMatch(
      /^<span class=/,
    );
  });
});
