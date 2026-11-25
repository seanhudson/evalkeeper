"use client";

import { Menu, MenuForm } from "./Menu.js";
import type { FormAction } from "./app.js";

/**
 * A model row's menu: test it (with what that costs now), make it live,
 * or make it the fallback, where the row allows either. Keeps the model
 * table narrow. The eval pages' one `Menu`.
 */
export function ModelMenu({
  suite,
  model,
  label,
  test,
  makeLive,
  makeFallback,
  effort,
}: {
  suite: string;
  model: string;
  /** The model's name, for the button's accessible name. */
  label: string;
  /**
   * Your testModel action, its words ("Test", "Test again"), and what
   * testing costs now ("free, all 34 reused"), when known.
   */
  test?: { action: FormAction; text: string; note: string | null };
  /** Your makeLive action, when the model can be made live. */
  makeLive: FormAction | null;
  /** Your makeFallback action, when it can be the fallback. */
  makeFallback: FormAction | null;
  /**
   * The row's reasoning setting, for a row at a setting other than the
   * feature's (null: the model's own default); unset for the others.
   */
  effort?: string | null | undefined;
}) {
  if (!test && !makeLive && !makeFallback) return null;
  const fields = {
    suite,
    model,
    effort: effort === undefined ? undefined : (effort ?? "default"),
  };
  return (
    <Menu label={`Choose ${label}`}>
      {test && (
        <MenuForm action={test.action} fields={fields} note={test.note}>
          {test.text}
        </MenuForm>
      )}
      {makeLive && (
        <MenuForm action={makeLive} fields={fields}>
          Make live
        </MenuForm>
      )}
      {makeFallback && (
        <MenuForm action={makeFallback} fields={fields}>
          Make fallback
        </MenuForm>
      )}
    </Menu>
  );
}
