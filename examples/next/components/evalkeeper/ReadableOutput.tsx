import { asText } from "@crowandraven/evalkeeper";

/**
 * Any answer, readable, for suites without their own way to show it (no
 * `labelFromOutput`): text as paragraphs, lists as bullets, small objects
 * as one line each, and fields with their names, never raw JSON.
 */

const label = (key: string) =>
  key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/^./, (c) => c.toUpperCase());

function isPlain(v: unknown): v is string | number | boolean | null {
  return v === null || ["string", "number", "boolean"].includes(typeof v);
}

function Inline({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === "")
    return <span className="text-muted">–</span>;
  if (typeof value === "boolean") return <>{value ? "Yes" : "No"}</>;
  return <>{asText(value)}</>;
}

/** One line for a small object: its longest text first, then the rest. */
function Row({ value }: { value: Record<string, unknown> }) {
  const entries = Object.entries(value);
  const main = entries.find(([, v]) => typeof v === "string" && v.length > 20);
  const rest = entries.filter(([k, v]) => k !== main?.[0] && isPlain(v));
  return (
    <>
      {main ? asText(main[1]) : null}
      {rest.length > 0 && (
        <span className="text-xs text-muted">
          {main ? " · " : ""}
          {rest
            .map(([k, v]) => `${label(k)}: ${v === null ? "–" : asText(v)}`)
            .join(" · ")}
        </span>
      )}
    </>
  );
}

export function ReadableOutput({ value }: { value: unknown }) {
  if (isPlain(value))
    return typeof value === "string" && value.length > 80 ? (
      <p className="readable break-words whitespace-pre-wrap">{value}</p>
    ) : (
      <span className="break-words">
        <Inline value={value} />
      </span>
    );
  if (Array.isArray(value)) {
    if (!value.length) return <span className="text-muted">None</span>;
    return (
      <ul className="readable list-disc space-y-1 pl-5 break-words">
        {value.map((v: unknown, i) => (
          <li key={i}>
            {isPlain(v) ? (
              <Inline value={v} />
            ) : v &&
              typeof v === "object" &&
              !Array.isArray(v) &&
              Object.values(v).every(isPlain) ? (
              <Row value={v as Record<string, unknown>} />
            ) : (
              <ReadableOutput value={v} />
            )}
          </li>
        ))}
      </ul>
    );
  }
  if (value && typeof value === "object") {
    // Long text (a letter, a summary) reads best first and in full.
    const entries = Object.entries(value as Record<string, unknown>).sort(
      (a, b) =>
        Number(typeof b[1] === "string" && b[1].length > 80) -
        Number(typeof a[1] === "string" && a[1].length > 80),
    );
    return (
      <dl className="space-y-2">
        {entries.map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs text-muted">{label(k)}</dt>
            <dd>
              <ReadableOutput value={v} />
            </dd>
          </div>
        ))}
      </dl>
    );
  }
  return <span className="text-muted">–</span>;
}
