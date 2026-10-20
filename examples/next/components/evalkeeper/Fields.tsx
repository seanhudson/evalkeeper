import { fieldValue, type FormField } from "evalkeeper";

/**
 * A suite's form fields, rendered from its field specs: label, input, and
 * help in one wrapper. `values` fills them from a stored input or answer.
 */
export function Fields({
  fields,
  values,
  prefix = "",
}: {
  fields: FormField[];
  values?: unknown;
  /** Keeps ids unique when a page has several forms. */
  prefix?: string;
}) {
  return (
    <>
      {fields.map((f) => {
        const id = `${prefix}${f.name}`;
        const value = values === undefined ? "" : fieldValue(f, values);
        const box =
          "w-full rounded-md border border-line bg-card px-3 py-2 text-sm focus:border-accent focus:outline-none";
        return (
          <div key={f.name} className="space-y-1">
            <label htmlFor={id} className="block text-sm font-medium">
              {f.label}
            </label>
            {f.kind === "select" ? (
              <select
                id={id}
                name={f.name}
                defaultValue={value || f.options?.[0]}
                className={box}
              >
                {f.options?.map((o) => (
                  <option key={o} value={o}>
                    {o.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            ) : f.kind === "text" ? (
              <input
                id={id}
                name={f.name}
                defaultValue={value}
                required={f.required}
                className={box}
              />
            ) : (
              <textarea
                id={id}
                name={f.name}
                defaultValue={value}
                required={f.required}
                rows={f.kind === "lines" ? 4 : 5}
                className={box}
              />
            )}
            <p className="readable text-xs text-muted">{f.help}</p>
          </div>
        );
      })}
    </>
  );
}

/** A stored input or answer, read with the suite's field labels. */
export function FieldValues({
  fields,
  values,
}: {
  fields: FormField[];
  values: unknown;
}) {
  return (
    <dl className="space-y-2">
      {fields.map((f) => {
        const v = (values as Record<string, unknown> | null)?.[f.name];
        return (
          <div key={f.name}>
            <dt className="text-xs text-muted">{f.label}</dt>
            <dd className="readable whitespace-pre-wrap">
              {Array.isArray(v) ? (
                v.length ? (
                  <ul className="list-disc pl-5">
                    {v.map((x, i) => (
                      <li key={i}>{String(x)}</li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-muted">None</span>
                )
              ) : (
                String(v ?? "—").replace(/_/g, " ")
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
