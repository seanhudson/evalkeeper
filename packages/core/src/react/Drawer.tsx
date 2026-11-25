"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { CloseButton } from "./InfoPopover.js";
import { Menu, MenuButton } from "./Menu.js";

/**
 * A panel that slides in from the right over the page, for a form that
 * belongs to the whole page (Suite settings, Spending and daily limits):
 * one form, one primary Save. Closes with its X, Escape, or a click on
 * the page behind it, and returns focus to what opened it.
 *
 * @param props.title - The drawer's heading, and its accessible name.
 */
export function Drawer({
  title,
  open,
  onClose,
  children,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  // The latest onClose, so a parent's new function each render doesn't
  // move focus back to the panel.
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    if (!open) return;
    const back =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      back?.focus();
    };
  }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40">
      <div
        aria-hidden
        className="absolute inset-0 bg-ink/30"
        onClick={onClose}
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        // Saved: the page shows the new values, so the drawer goes.
        onSubmit={() =>
          setTimeout(() => {
            close.current();
          })
        }
        className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col overflow-y-auto border-l border-line bg-card shadow-xl focus:outline-none"
      >
        <div className="flex items-start justify-between gap-3 border-b border-line p-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <CloseButton onClick={onClose} />
        </div>
        <div className="space-y-4 p-4 text-sm">{children}</div>
      </div>
    </div>
  );
}

/** One entry in a page's menu: its words, and the drawer it opens. */
export type PageMenuEntry = {
  /** A stable name, for the drawer's state. */
  key: string;
  /** The menu item's words, and the drawer's title. */
  label: string;
  /** What the drawer holds: a form, usually. */
  body: ReactNode;
};

/**
 * The menu beside a page's title: each entry opens its own drawer.
 * Renders nothing without entries.
 *
 * @param props.label - The menu button's accessible name.
 */
export function PageMenu({
  label,
  entries,
}: {
  label: string;
  entries: readonly PageMenuEntry[];
}) {
  const [open, setOpen] = useState<string | null>(null);
  if (!entries.length) return null;
  const shown = entries.find((e) => e.key === open);
  return (
    <>
      <Menu label={label}>
        {entries.map((e) => (
          <MenuButton
            key={e.key}
            onSelect={() => {
              setOpen(e.key);
            }}
          >
            {e.label}
          </MenuButton>
        ))}
      </Menu>
      <Drawer
        title={shown?.label ?? ""}
        open={shown !== undefined}
        onClose={() => {
          setOpen(null);
        }}
      >
        {shown?.body}
      </Drawer>
    </>
  );
}
