"use client";

import {
  createContext,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { EllipsisVertical } from "lucide-react";
import { Button } from "./pieces.js";
import { useDismiss } from "./InfoPopover.js";
import type { FormAction } from "./app.js";

/**
 * The one menu on the eval pages: a vertical-dots button that opens a list
 * of items. A model row's menu, a case's menu, and the page title's menu
 * are all this, so every menu looks and behaves the same. Closes on a
 * click outside, Escape, or once an item is chosen.
 */

const Close = createContext<() => void>(() => {});

/** A menu item's look, shared by buttons and forms. */
const ITEM = "block w-full rounded px-3 py-1.5 text-left text-sm hover:bg-tint";

/**
 * A vertical-dots button and its menu.
 */
export function Menu({
  label,
  children,
  width = "w-56",
  className = "relative",
}: {
  /** The button's accessible name: "Choose GPT-6 Luna". */
  label: string;
  children: ReactNode;
  /** The menu's width class; `w-56` by default. */
  width?: string;
  /** Classes for the wrapper (to place it). */
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(open, setOpen, ref);
  return (
    <div ref={ref} className={className}>
      <Button
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
        }}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-tint hover:text-ink"
      >
        <EllipsisVertical aria-hidden className="h-4 w-4" />
      </Button>
      {open && (
        <div
          role="menu"
          aria-label={label}
          className={`absolute right-0 z-20 mt-1 ${width} rounded-md border border-line bg-card p-1 shadow-lg`}
        >
          <Close.Provider
            value={() => {
              setOpen(false);
            }}
          >
            {children}
          </Close.Provider>
        </div>
      )}
    </div>
  );
}

/**
 * A menu item that does something in the browser (opens a form or a
 * drawer), then closes the menu.
 */
export function MenuButton({
  onSelect,
  children,
  danger = false,
}: {
  onSelect: () => void;
  children: ReactNode;
  /** Shown in the bad color, for retiring and the like. */
  danger?: boolean;
}) {
  const close = useContext(Close);
  return (
    <Button
      type="button"
      role="menuitem"
      className={`${ITEM}${danger ? " text-bad" : ""}`}
      onClick={() => {
        onSelect();
        close();
      }}
    >
      {children}
    </Button>
  );
}

/**
 * A menu item that submits a server action with hidden fields, with an
 * optional note under its words ("free, all 34 reused"). The menu closes
 * once the form is read, so it doesn't cover the rows below.
 */
export function MenuForm({
  action,
  fields,
  children,
  note,
  danger = false,
}: {
  action: FormAction;
  /** Hidden fields, by name; undefined ones are left out. */
  fields: Readonly<Record<string, string | undefined>>;
  children: ReactNode;
  note?: string | null;
  danger?: boolean;
}) {
  const close = useContext(Close);
  return (
    <form
      action={action}
      onSubmit={() =>
        setTimeout(() => {
          close();
        })
      }
    >
      {Object.entries(fields).map(([name, value]) =>
        value === undefined ? null : (
          <input key={name} type="hidden" name={name} value={value} />
        ),
      )}
      <Button
        type="submit"
        role="menuitem"
        className={`${ITEM}${danger ? " text-bad" : ""}`}
      >
        {children}
        {note && <span className="block text-xs text-muted">{note}</span>}
      </Button>
    </form>
  );
}
