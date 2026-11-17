import type { ReactNode } from "react";
import { asText } from "../index.js";
import { Folded } from "./Folded.js";

/** Longer than this, text is folded to its start. */
const LONG_TEXT = 320;
/** More items than this, a list is folded to its first ones. */
const LONG_LIST = 6;
/** Deeper than this, a value shows as data. */
const MAX_DEPTH = 3;

/** "linkStatus" or "link_status" → "Link status". */
export function humanize(key: string): string {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** `text` with each of `marks` highlighted, ignoring case. */
export function Marked({
  text,
  marks = [],
}: {
  text: string;
  marks?: string[] | undefined;
}): ReactNode {
  const terms = marks.map((m) => m.trim()).filter(Boolean);
  if (!terms.length) return text;
  const escaped = terms
    .sort((a, b) => b.length - a.length)
    .map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const parts = text.split(new RegExp(`(${escaped.join("|")})`, "gi"));
  if (parts.length === 1) return text;
  const lower = new Set(terms.map((t) => t.toLowerCase()));
  return parts.map((p, i) =>
    lower.has(p.toLowerCase()) ? (
      <mark key={i} className="rounded-sm bg-warn/20 px-0.5 text-ink">
        {p}
      </mark>
    ) : (
      p
    ),
  );
}

/** "VERIFIED" → "Verified", "NOT_SURE" → "Not sure"; other text as is. */
export function enumText(text: string): string {
  if (!/^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/.test(text)) return text;
  const words = text.replace(/_/g, " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Whether `value` contains any of `marks` anywhere, ignoring case. */
export function hasMark(value: unknown, marks: string[] = []): boolean {
  if (!marks.length) return false;
  const text = (typeof value === "string" ? value : asText(value))
    .toLowerCase()
    .replace(/\\n/g, "\n");
  return marks.some((m) => m.trim() && text.includes(m.trim().toLowerCase()));
}

type Block =
  | { kind: "heading"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "text"; text: string };

/**
 * Text as blocks a person reads: Markdown-style headings ("### Wants")
 * and lists ("- item") as such, paragraphs at blank lines, other line
 * breaks kept.
 */
export function blocksOf(text: string): Block[] {
  const out: Block[] = [];
  let para: string[] = [];
  const endPara = () => {
    const t = para.join("\n").trim();
    if (t) out.push({ kind: "text", text: t });
    para = [];
  };
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    const heading = /^#{1,6}\s+(.+)$/.exec(line);
    const item = /^\s*[-*•]\s+(.+)$/.exec(line);
    if (heading?.[1]) {
      endPara();
      out.push({ kind: "heading", text: heading[1] });
    } else if (item?.[1]) {
      endPara();
      const last = out.at(-1);
      if (last?.kind === "list") last.items.push(item[1]);
      else out.push({ kind: "list", items: [item[1]] });
    } else if (!line.trim()) endPara();
    else para.push(line);
  }
  endPara();
  return out;
}

/** Text in blocks: headings, lists, and paragraphs, with marks. */
function Paragraphs({
  text,
  marks,
}: {
  text: string;
  marks?: string[] | undefined;
}) {
  return (
    <div className="readable space-y-2">
      {blocksOf(text).map((b, i) =>
        b.kind === "heading" ? (
          <p key={i} className="text-xs font-semibold text-muted">
            <Marked text={b.text} marks={marks} />
          </p>
        ) : b.kind === "list" ? (
          <ul key={i} className="list-disc space-y-1 pl-5">
            {b.items.map((t, j) => (
              <li key={j}>
                <Marked text={t} marks={marks} />
              </li>
            ))}
          </ul>
        ) : (
          <p key={i} className="whitespace-pre-wrap">
            <Marked text={b.text} marks={marks} />
          </p>
        ),
      )}
    </div>
  );
}

/**
 * Text as a person reads it: short text inline, long text as paragraphs
 * folded to its start, unless a highlight sits in the rest.
 */
function ReadableText({
  text,
  marks,
}: {
  text: string;
  marks?: string[] | undefined;
}) {
  if (/^https?:\/\/\S+$/.test(text))
    return (
      <a
        href={text}
        target="_blank"
        rel="noreferrer"
        className="break-all text-accent hover:underline"
      >
        <Marked text={text} marks={marks} />
      </a>
    );
  if (text.length <= LONG_TEXT && !text.includes("\n"))
    return <Marked text={enumText(text)} marks={marks} />;
  const whole = (
    <div className="rounded-md bg-tint px-3 py-2">
      <Paragraphs text={text} marks={marks} />
    </div>
  );
  if (text.length <= LONG_TEXT) return whole;
  const cut = text.slice(0, LONG_TEXT).replace(/\s+\S*$/, "");
  const markedLater = hasMark(text, marks) && !hasMark(cut, marks);
  return (
    <div>
      <Folded
        more="Show the whole text"
        short={
          <div className="rounded-md bg-tint px-3 py-2">
            <Paragraphs text={`${cut}…`} marks={marks} />
            {markedLater && (
              <p className="mt-1 text-xs text-muted">
                More highlighted further on.
              </p>
            )}
          </div>
        }
      >
        {whole}
      </Folded>
    </div>
  );
}

/**
 * A stored value, read like a page rather than data: an object as
 * labeled rows, a list as a list (folded when long), text as text, with
 * `marks` highlighted.
 */
export function ReadableValue({
  value,
  marks,
  depth = 0,
}: {
  value: unknown;
  marks?: string[] | undefined;
  depth?: number;
}): ReactNode {
  if (value === undefined || value === null || value === "")
    return <span className="text-muted">—</span>;
  if (typeof value === "string")
    return <ReadableText text={value} marks={marks} />;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return String(value);
  if (depth >= MAX_DEPTH)
    return (
      <pre className="whitespace-pre-wrap text-xs">
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  if (Array.isArray(value)) {
    if (!value.length) return <span className="text-muted">None</span>;
    // Records (résumés, facts with fields): each its own tinted block.
    const records = value.every(
      (x) => x !== null && typeof x === "object" && !Array.isArray(x),
    );
    const items = (xs: unknown[]) =>
      records ? (
        <ul className="space-y-2">
          {xs.map((x, i) => (
            <li key={i} className="rounded-md bg-tint px-3 py-2">
              <ReadableValue value={x} marks={marks} depth={depth + 1} />
            </li>
          ))}
        </ul>
      ) : (
        <ul className="list-disc space-y-1 pl-5">
          {xs.map((x, i) => (
            <li key={i}>
              <ReadableValue value={x} marks={marks} depth={depth + 1} />
            </li>
          ))}
        </ul>
      );
    if (value.length <= LONG_LIST) return items(value);
    return (
      <div>
        <Folded
          more={`Show all ${value.length}`}
          short={items(value.slice(0, LONG_LIST - 1))}
        >
          {items(value)}
        </Folded>
      </div>
    );
  }
  const entries = Object.entries(value as Record<string, unknown>).filter(
    ([, v]) => v !== undefined,
  );
  if (!entries.length) return <span className="text-muted">—</span>;
  return (
    <dl className="grid grid-cols-[minmax(6rem,auto)_minmax(0,1fr)] gap-x-3 gap-y-1.5">
      {entries.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-xs text-muted">{humanize(k)}</dt>
          <dd className="min-w-0 break-words">
            <ReadableValue value={v} marks={marks} depth={depth + 1} />
          </dd>
        </div>
      ))}
    </dl>
  );
}
