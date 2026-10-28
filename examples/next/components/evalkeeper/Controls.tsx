import { components } from "@/lib/evalkeeper/appComponents";

/**
 * The plain controls Evalkeeper's screens draw: buttons, text fields,
 * text areas, and selects. Each is the native element by default, and your
 * app's own when `lib/evalkeeper/appComponents.ts` names one. A replacement
 * gets the same props, Evalkeeper's `className` included, and must render
 * the native control (or forward `name` and the value to one) so forms
 * still submit.
 */

/** A plain button: a toggle, a menu item, a step in a form. */
export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement>;
/** A one-line text field. */
export type TextInputProps = React.InputHTMLAttributes<HTMLInputElement>;
/** A multi-line text field. */
export type TextAreaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;
/** A dropdown of options, given as `<option>` children. */
export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

export function Button(props: ButtonProps) {
  const C = components.Button;
  return C ? <C {...props} /> : <button {...props} />;
}

export function TextInput(props: TextInputProps) {
  const C = components.TextInput;
  return C ? <C {...props} /> : <input {...props} />;
}

export function TextArea(props: TextAreaProps) {
  const C = components.TextArea;
  return C ? <C {...props} /> : <textarea {...props} />;
}

export function Select(props: SelectProps) {
  const C = components.Select;
  return C ? <C {...props} /> : <select {...props} />;
}
