import { InfoTip, Select, TextArea, TextInput } from "./pieces.js";
import { ReadableValue } from "./Readable.js";
import {
  ANSWER_JSON_FIELD,
  fieldValue,
  type AnswerEditorProps,
  type FormField,
} from "../index.js";

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
            {f.kind === "select" || choices(f) ? (
              <Select
                id={id}
                name={f.name}
                defaultValue={value || (f.options ?? choices(f))?.[0]}
                className={box}
              >
                {(f.options ?? choices(f))?.map((o) => (
                  <option key={o} value={o}>
                    {f.optionLabels?.[o] ?? o.replace(/_/g, " ")}
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

/**
 * A stored input or answer, read with the suite's field labels: objects as
 * labeled rows, long text folded, never raw data. `marks` are highlighted
 * (a suite's `lookAt`).
 */
export function FieldValues({
  fields,
  values,
  prefix = "",
  marks,
}: {
  fields: FormField[];
  values: unknown;
  /** Keeps tooltip ids unique when a page shows several. */
  prefix?: string;
  /** Text to highlight wherever it appears. */
  marks?: string[] | undefined;
}) {
  return (
    <dl className="space-y-3">
      {fields.map((f) => {
        const v = (values as Record<string, unknown> | null)?.[f.name];
        return (
          <div key={f.name}>
            <dt className="text-xs text-muted">
              {f.label}
              <InfoTip text={f.help} id={`${prefix}${f.name}-read`} />
            </dt>
            <dd className="mt-0.5 break-words">
              {labelOf(f, v) ??
                (f.kind === "json" && typeof v === "string" ? (
                  <ReadableValue value={parseJson(v)} marks={marks} />
                ) : (
                  <ReadableValue value={v} marks={marks} />
                ))}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

/**
 * A JSON field whose values are all named in `optionLabels` (a
 * yes-or-no: "true" and "false") is a choice, not a box to type JSON in.
 * Its value is submitted as the JSON it names.
 */
function choices(f: FormField): string[] | undefined {
  if (f.kind !== "json" || !f.optionLabels) return undefined;
  const keys = Object.keys(f.optionLabels);
  return keys.length ? keys : undefined;
}

/**
 * How a value reads by the field's `optionLabels`: a choice ("YES" →
 * "Would apply") or a yes-or-no (true → "Yes, as they typed it").
 */
function labelOf(f: FormField, v: unknown): string | undefined {
  if (typeof v !== "string" && typeof v !== "boolean") return undefined;
  return f.optionLabels?.[String(v)];
}

/** A JSON field stored as text, parsed when it parses. */
function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
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
