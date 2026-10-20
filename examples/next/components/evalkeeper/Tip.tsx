import { GLOSSARY, type GlossaryTerm } from "evalkeeper";

/**
 * Tooltips that explain how things work. They open on hover and on
 * keyboard focus, and screen readers read the text as the element's
 * description. No JavaScript: CSS shows them. The named group (group/tip)
 * keeps a tooltip from opening when an outer "group" (an open case) is
 * hovered.
 *
 *   <InfoTip term="score" />           an (i) after a label
 *   <Tip term="live"><Chip …/></Tip>   explains the thing it wraps
 */

type Props = {
  /** A glossary entry, or your own text with `text`. */
  term?: GlossaryTerm;
  text?: string;
  /** Unique per page when the same term shows more than once. */
  id?: string;
  /**
   * Where it opens. "bottom" inside a scrolling container (a table), whose
   * top edge would cut it off.
   */
  side?: "top" | "bottom";
  /** "end" near a container's right edge, so it opens leftward. */
  align?: "center" | "end";
};

function body(props: Props) {
  return props.text ?? (props.term ? GLOSSARY[props.term] : "");
}

function Bubble({
  id,
  text,
  side = "top",
  align = "center",
}: {
  id: string;
  text: string;
  side?: "top" | "bottom" | undefined;
  align?: "center" | "end" | undefined;
}) {
  return (
    <span
      role="tooltip"
      id={id}
      className={`pointer-events-none invisible absolute ${side === "top" ? "bottom-full mb-2" : "top-full mt-2"} ${align === "end" ? "right-0" : "left-1/2 -translate-x-1/2"} z-20 w-64 rounded-md border border-line bg-card px-3 py-2 text-left text-xs font-normal normal-case leading-snug tracking-normal text-ink opacity-0 shadow-lg transition-opacity group-focus-within/tip:visible group-focus-within/tip:opacity-100 group-hover/tip:visible group-hover/tip:opacity-100`}
    >
      {text}
    </span>
  );
}

/** A small (i) button that explains the label before it. */
export function InfoTip(props: Props) {
  const text = body(props);
  const id = `tip-${props.id ?? props.term ?? "info"}`;
  return (
    <span className="group/tip relative ml-1 inline-flex align-middle">
      <button
        type="button"
        aria-describedby={id}
        aria-label="What's this?"
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-line text-[10px] leading-none text-muted hover:text-ink"
      >
        i
      </button>
      <Bubble id={id} text={text} side={props.side} align={props.align} />
    </span>
  );
}

/** Explains whatever it wraps (a chip, a number) on hover and focus. */
export function Tip(props: Props & { children: React.ReactNode }) {
  const text = body(props);
  const id = `tip-${props.id ?? props.term ?? "info"}`;
  return (
    <span
      className="group/tip relative inline-flex"
      tabIndex={0}
      aria-describedby={id}
    >
      {props.children}
      <Bubble id={id} text={text} side={props.side} align={props.align} />
    </span>
  );
}
