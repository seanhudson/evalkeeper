import {
  InfoTip,
  Select,
  TextArea,
  TextInput,
} from "@crowandraven/evalkeeper/react";
import {
  ANSWER_JSON_FIELD,
  asText,
  fieldValue,
  type AnswerEditorProps,
  type FormField,
} from "@crowandraven/evalkeeper";

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
              <Select
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
              </Select>
            ) : f.kind === "text" ? (
              <TextInput
                id={id}
                name={f.name}
                defaultValue={value}
                required={f.required}
                className={box}
              />
            ) : (
              <TextArea
                id={id}
                name={f.name}
                defaultValue={value}
                required={f.required}
                rows={f.kind === "lines" ? 4 : f.kind === "json" ? 8 : 5}
                spellCheck={f.kind !== "json"}
                className={`${box} ${f.kind === "json" ? "font-mono text-xs" : ""}`}
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
  prefix = "",
}: {
  fields: FormField[];
  values: unknown;
  /** Keeps tooltip ids unique when a page shows several. */
  prefix?: string;
}) {
  return (
    <dl className="space-y-2">
      {fields.map((f) => {
        const v = (values as Record<string, unknown> | null)?.[f.name];
        return (
          <div key={f.name}>
            <dt className="text-xs text-muted">
              {f.label}
              <InfoTip text={f.help} id={`${prefix}${f.name}-read`} />
            </dt>
            <dd className="readable break-words whitespace-pre-wrap">
              {f.kind === "json" && v !== undefined && v !== null ? (
                <pre className="text-xs whitespace-pre-wrap">
                  {JSON.stringify(v, null, 2)}
                </pre>
              ) : Array.isArray(v) ? (
                v.length ? (
                  <ul className="list-disc pl-5">
                    {v.map((x, i) => (
                      <li key={i}>{asText(x)}</li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-muted">None</span>
                )
              ) : (
                (asText(v) || "—").replace(/_/g, " ")
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

/**
 * A suite's answer, for writing or editing it: the app's own answer editor
 * when it registered one for this suite (`answerEditors` in the wiring
 * module), otherwise the suite's answer fields.
 */
export function AnswerInput({
  fields,
  editor: Editor,
  input = null,
  values,
  prefix = "",
}: {
  fields: FormField[];
  /** The app's editor for this suite, if any. */
  editor?: React.ComponentType<AnswerEditorProps> | undefined;
  /** The case's input; null on "Add a case". */
  input?: unknown;
  values?: unknown;
  prefix?: string;
}) {
  if (Editor)
    return (
      <Editor
        name={ANSWER_JSON_FIELD}
        idPrefix={prefix}
        input={input}
        value={values ?? null}
        fields={fields}
      />
    );
  return <Fields fields={fields} values={values} prefix={prefix} />;
}
