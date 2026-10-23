"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import type { AnswerEditorProps } from "@crowandraven/evalkeeper";

/**
 * This app's own editor for action items' answer: one box per item, with
 * buttons to add and remove items, instead of one item per line. It's an
 * example of an answer editor (`answerEditors` in lib/evalkeeper): it
 * keeps the whole answer, as JSON, in the hidden field it's given.
 */
export function ActionItemsEditor({
  name,
  idPrefix,
  value,
  fields,
}: AnswerEditorProps) {
  const start = (value as { items?: unknown } | null)?.items;
  const [items, setItems] = useState<string[]>(
    Array.isArray(start) && start.length ? start.map((x) => String(x)) : [""],
  );
  const field = fields.find((f) => f.name === "items");
  const box =
    "w-full rounded-md border border-line bg-card px-3 py-2 text-sm focus:border-accent focus:outline-none";
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">
        {field?.label ?? "Action items"}
      </legend>
      <input
        type="hidden"
        name={name}
        value={JSON.stringify({
          items: items.map((i) => i.trim()).filter(Boolean),
        })}
      />
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <label htmlFor={`${idPrefix}item-${i}`} className="sr-only">
            Item {i + 1}
          </label>
          <input
            id={`${idPrefix}item-${i}`}
            value={item}
            onChange={(e) => {
              setItems(items.map((x, j) => (j === i ? e.target.value : x)));
            }}
            className={box}
          />
          <button
            type="button"
            aria-label={`Remove item ${i + 1}`}
            onClick={() => {
              setItems(items.filter((_, j) => j !== i));
            }}
            className="rounded-md p-1.5 text-muted hover:bg-tint hover:text-ink"
          >
            <X aria-hidden className="h-4 w-4" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => {
          setItems([...items, ""]);
        }}
        className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline"
      >
        <Plus aria-hidden className="h-4 w-4" />
        Add an item
      </button>
      {field && <p className="readable text-xs text-muted">{field.help}</p>}
    </fieldset>
  );
}
