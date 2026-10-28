import { describe, expect, it } from "vitest";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  BackLink,
  Button,
  Card,
  Chip,
  EvalComponentsProvider,
  InfoTip,
  Select,
  StatusBadge,
  Submit,
  TextArea,
  TextInput,
  type EvalComponents,
} from "./index.js";

/** Draws `node` the way a page does: inside the app's provider, if any. */
const html = (node: ReactNode, components?: Partial<EvalComponents>) =>
  renderToStaticMarkup(
    components ? (
      <EvalComponentsProvider components={components}>
        {node}
      </EvalComponentsProvider>
    ) : (
      node
    ),
  );

describe("the screens' pieces", () => {
  it("draw Evalkeeper's own when the app names none", () => {
    expect(html(<Card>x</Card>)).toMatch(/^<section class="rounded-lg/);
    expect(html(<Chip tone="live">Live</Chip>)).toMatch(/^<span class=/);
    expect(html(<Button type="button">Go</Button>)).toBe(
      '<button type="button">Go</button>',
    );
    expect(html(<TextInput name="reason" />)).toBe('<input name="reason"/>');
    expect(html(<InfoTip text="Why" />)).toMatch(/role="tooltip"/);
    // Links are plain anchors until the app passes its router's.
    expect(html(<BackLink href="/evals">Evals</BackLink>)).toMatch(
      /^<a href="\/evals"/,
    );
  });

  it("draw the app's own when it names them, with the same props", () => {
    const app: Partial<EvalComponents> = {
      Card: ({ children }) => <div data-app="card">{children}</div>,
      Button: (p) => <button data-app="button" type={p.type} name={p.name} />,
      TextInput: (p) => <input data-app="input" name={p.name} />,
      TextArea: (p) => <textarea data-app="textarea" name={p.name} />,
      Select: (p) => (
        <select data-app="select" name={p.name}>
          {p.children}
        </select>
      ),
      Submit: ({ children }) => (
        <button data-app="submit" type="submit">
          {children}
        </button>
      ),
    };
    expect(html(<Card>x</Card>, app)).toBe('<div data-app="card">x</div>');
    expect(html(<Button type="button" name="go" />, app)).toBe(
      '<button data-app="button" type="button" name="go"></button>',
    );
    // Form controls keep their names, so forms still submit.
    expect(html(<TextInput name="reason" />, app)).toMatch(/name="reason"/);
    expect(html(<TextArea name="note" />, app)).toMatch(/name="note"/);
    expect(
      html(
        <Select name="pick">
          <option value="a">A</option>
        </Select>,
        app,
      ),
    ).toMatch(/data-app="select" name="pick"><option value="a">A/);
    expect(html(<Submit>Save</Submit>, app)).toBe(
      '<button data-app="submit" type="submit">Save</button>',
    );
  });

  it("use the app's piece inside other pieces too", () => {
    // A suite's status is a chip, and a back link is a link.
    const app: Partial<EvalComponents> = {
      Chip: ({ children }) => <mark>{children}</mark>,
      Link: ({ href, children }) => (
        <a data-app="link" href={href}>
          {children}
        </a>
      ),
    };
    expect(html(<StatusBadge status="good" />, app)).toBe("<mark>Good</mark>");
    expect(html(<BackLink href="/evals">Evals</BackLink>, app)).toMatch(
      /^<a data-app="link" href="\/evals">/,
    );
  });

  it("keep Evalkeeper's for the pieces the app leaves out", () => {
    const app: Partial<EvalComponents> = {
      Card: ({ children }) => <div>{children}</div>,
    };
    expect(html(<Chip tone="live">Live</Chip>, app)).toMatch(/^<span class=/);
  });
});
