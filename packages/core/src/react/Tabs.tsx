"use client";

import { useState, type ReactNode } from "react";
import { Button } from "./pieces.js";

/**
 * Tabs over panels drawn on the server: every panel is on the page, and
 * the tabs show one at a time. For a section with a few views of the same
 * thing (a feature's cases, and its attack cases).
 */
export function Tabs({
  label,
  tabs,
}: {
  /** What the tabs choose between, for screen readers. */
  label: string;
  tabs: { id: string; title: string; panel: ReactNode }[];
}) {
  const [shown, setShown] = useState(tabs[0]?.id ?? "");
  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label={label}
        className="flex gap-1 border-b border-line"
      >
        {tabs.map((t) => (
          <Button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={shown === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => {
              setShown(t.id);
            }}
            className={`-mb-px border-b px-3 py-2 text-sm ${
              shown === t.id
                ? "border-accent font-medium text-ink"
                : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {t.title}
          </Button>
        ))}
      </div>
      {tabs.map((t) => (
        <div
          key={t.id}
          role="tabpanel"
          id={`panel-${t.id}`}
          aria-labelledby={`tab-${t.id}`}
          hidden={shown !== t.id}
        >
          {t.panel}
        </div>
      ))}
    </div>
  );
}
