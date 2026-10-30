"use client";

import {
  createContext,
  createElement,
  useContext,
  useSyncExternalStore,
  type ComponentType,
  type ReactNode,
} from "react";
import { useFormStatus } from "react-dom";
import { ArrowLeft, Info, LoaderCircle } from "lucide-react";
import { GLOSSARY, type GlossaryTerm } from "../glossary.js";
import type { HealthFlag, HealthStatus } from "../health.js";
import { dayOf, momentOf, pct, QUIET_BUTTON } from "./format.js";

/**
 * The pieces Evalkeeper's screens are built from. Each draws Evalkeeper's
 * own by default, and your app's when you name one in
 * `EvalComponentsProvider`. Every piece is a client component, so yours
 * must be too (a file starting `"use client"`, or a component library's
 * client components).
 */

const CHIP = {
  live: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
  fallback: "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-200",
  suggested: "bg-accent/10 text-accent",
  warn: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200",
  serious: "bg-red-50 text-red-800 dark:bg-red-500/10 dark:text-red-200",
  neutral: "bg-tint text-muted",
} as const;

/** A chip's color. */
export type ChipTone = keyof typeof CHIP;

/** A box around a section of a page. */
export type CardProps = { children: ReactNode; className?: string };
/** A small label and its color. */
export type ChipProps = { tone: ChipTone; children: ReactNode };
/** A link: where it goes, its words, and Evalkeeper's classes. */
export type LinkProps = {
  href: string;
  children: ReactNode;
  className?: string;
  title?: string;
};
/** Where a back link goes, and its words. */
export type BackLinkProps = { href: string; children: ReactNode };
/** A score: parts right of parts expected. */
export type ScoreProps = { right: number; total: number };
/** A form's submit button: its words, its weight, and whether it's off. */
export type SubmitProps = {
  children: ReactNode;
  variant?: "primary" | "quiet";
  /** Off until the form is ready; wrap it in a `<Tip>` saying why. */
  disabled?: boolean;
};
/** An icon-only submit button's accessible name and icon. */
export type IconSubmitProps = { label: string; icon: ReactNode };
/** What a tooltip explains: a glossary term, or your own text. */
export type InfoTipProps = {
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
/** What a tooltip explains, and the thing it wraps. */
export type TipProps = InfoTipProps & {
  children: ReactNode;
  /**
   * The child is a control that takes focus itself (a button), so the
   * wrapper isn't a second tab stop.
   */
  control?: boolean;
};
/** Whether a test is running, so the page should keep refreshing. */
export type RefreshWhileProps = { active: boolean };
/** A plain button: a toggle, a menu item, a step in a form. */
export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement>;
/** A one-line text field. */
export type TextInputProps = React.InputHTMLAttributes<HTMLInputElement>;
/** A multi-line text field. */
export type TextAreaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;
/** A dropdown of options, given as `<option>` children. */
export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

/**
 * Every piece you can replace. Each gets the props Evalkeeper's own would,
 * its `className` included, which yours can use or ignore. Controls must
 * render the native element (or pass `name` and the value to one), so
 * forms still submit.
 */
export type EvalComponents = {
  Card: ComponentType<CardProps>;
  Chip: ComponentType<ChipProps>;
  Link: ComponentType<LinkProps>;
  BackLink: ComponentType<BackLinkProps>;
  Score: ComponentType<ScoreProps>;
  Submit: ComponentType<SubmitProps>;
  IconSubmit: ComponentType<IconSubmitProps>;
  Spinner: ComponentType;
  Tip: ComponentType<TipProps>;
  InfoTip: ComponentType<InfoTipProps>;
  Button: ComponentType<ButtonProps>;
  TextInput: ComponentType<TextInputProps>;
  TextArea: ComponentType<TextAreaProps>;
  Select: ComponentType<SelectProps>;
  RefreshWhile: ComponentType<RefreshWhileProps>;
};

const Swapped = createContext<Partial<EvalComponents>>({});

/**
 * Draws Evalkeeper's screens inside it with your app's components. Render
 * it once around the eval pages (a layout), from a client component of
 * your own that imports your components:
 *
 * @example
 * ```tsx
 * "use client";
 * import Link from "next/link";
 * import { EvalComponentsProvider } from "@crowandraven/evalkeeper/react";
 * import { Button } from "@/components/ui/button";
 *
 * export function AppComponents({ children }: { children: React.ReactNode }) {
 *   return (
 *     <EvalComponentsProvider components={{ Link, Button }}>
 *       {children}
 *     </EvalComponentsProvider>
 *   );
 * }
 * ```
 *
 * @param props - Your components (any of `EvalComponents`; the rest stay
 *   Evalkeeper's) and the screens to draw with them.
 */
export function EvalComponentsProvider({
  components,
  children,
}: {
  components: Partial<EvalComponents>;
  children: ReactNode;
}) {
  return <Swapped.Provider value={components}>{children}</Swapped.Provider>;
}

/** The app's piece by name, or undefined to draw Evalkeeper's. */
const useSwapped = <K extends keyof EvalComponents>(
  name: K,
): EvalComponents[K] | undefined => useContext(Swapped)[name];

/** A box around a section of a page. */
export function Card(props: CardProps) {
  const C = useSwapped("Card");
  if (C) return createElement(C, props);
  const { children, className = "" } = props;
  return (
    <section
      className={`rounded-lg border border-line bg-card p-5 ${className}`}
    >
      {children}
    </section>
  );
}

/** A small rounded label: Live, Fallback, Retires …, serious, minor. */
export function Chip(props: ChipProps) {
  const C = useSwapped("Chip");
  if (C) return createElement(C, props);
  return (
    <span
      className={`inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-xs font-medium leading-none ${CHIP[props.tone]}`}
    >
      {props.children}
    </span>
  );
}

const STATUS: Record<HealthStatus, { label: string; tone: ChipTone }> = {
  good: { label: "Good", tone: "live" },
  fair: { label: "Fair", tone: "warn" },
  improve: { label: "Needs work", tone: "serious" },
  change: { label: "Change suggested", tone: "fallback" },
  few: { label: "Few cases", tone: "warn" },
  stale: { label: "Retest", tone: "warn" },
  untested: { label: "Untested", tone: "neutral" },
};

/** A suite's health as a chip; the card's details say why. */
export function StatusBadge({ status }: { status: HealthStatus }) {
  const s = STATUS[status];
  return <Chip tone={s.tone}>{s.label}</Chip>;
}

const many = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** One chip per reason a suite stands where it does. */
function flagChips(f: HealthFlag): { text: string; tone: ChipTone }[] {
  switch (f.kind) {
    case "untested":
      return [{ text: "Untested", tone: "neutral" }];
    case "stale":
      return [{ text: "Retest", tone: "warn" }];
    case "below":
      return [
        ...(f.serious
          ? [
              {
                text: `${f.serious} serious under bar`,
                tone: "serious" as const,
              },
            ]
          : []),
        ...(f.minor
          ? [{ text: `${f.minor} minor under bar`, tone: "warn" as const }]
          : []),
      ];
    case "suggestLive":
      return [{ text: "New live model suggested", tone: "suggested" }];
    case "suggestFallback":
      return [{ text: "New fallback suggested", tone: "suggested" }];
    case "retestLive":
      return [{ text: "Retest live", tone: "warn" }];
    case "provisional":
      return [{ text: many(f.answers, "provisional answer"), tone: "warn" }];
    case "fewCases":
      return [{ text: "Too few cases", tone: "warn" }];
    case "addCases":
      return [
        { text: `Add cases (${f.cases} of ${f.target})`, tone: "neutral" },
      ];
    case "good":
      return [{ text: "Good", tone: "live" }];
  }
}

/**
 * A suite's health as chips naming each reason ("2 serious under bar",
 * "New fallback suggested", "Add cases (33 of 50)"), so a card says why at
 * a glance; its details say more.
 */
export function HealthChips({ flags }: { flags: readonly HealthFlag[] }) {
  return (
    <span className="inline-flex flex-wrap gap-1.5">
      {flags.flatMap(flagChips).map((c) => (
        <Chip key={c.text} tone={c.tone}>
          {c.text}
        </Chip>
      ))}
    </span>
  );
}

/**
 * A link to another page. A plain `<a>` by default; pass your router's
 * link (Next.js's `Link`, say) to move between pages without a reload.
 */
export function Link(props: LinkProps) {
  const C = useSwapped("Link");
  if (C) return createElement(C, props);
  const { href, children, className, title } = props;
  return (
    <a href={href} className={className} title={title}>
      {children}
    </a>
  );
}

/** A link back to the page above, with an arrow. */
export function BackLink(props: BackLinkProps) {
  const C = useSwapped("BackLink");
  if (C) return createElement(C, props);
  return (
    <Link
      href={props.href}
      className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink"
    >
      <ArrowLeft aria-hidden className="h-4 w-4" />
      {props.children}
    </Link>
  );
}

/** A score with a thin bar, for tables. */
export function Score(props: ScoreProps) {
  const C = useSwapped("Score");
  if (C) return createElement(C, props);
  const { right, total } = props;
  const rate = total ? right / total : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="w-10 tabular-nums">{pct(rate)}</span>
      <span className="h-1.5 w-20 rounded-full bg-tint">
        <span
          className="block h-1.5 rounded-full bg-accent"
          style={{ width: `${rate * 100}%` }}
        />
      </span>
      <span className="text-xs text-muted tabular-nums">
        {/* Whole numbers: a failed answer counts a graded answer's average
            parts, which can be a fraction. */}
        {Math.round(right)}/{Math.round(total)}
      </span>
    </div>
  );
}

/** The rotating loader, while something runs. */
export function Spinner() {
  const C = useSwapped("Spinner");
  if (C) return createElement(C);
  return <LoaderCircle aria-hidden className="h-3.5 w-3.5 animate-spin" />;
}

/** A submit button that spins while its form's action runs. */
export function Submit(props: SubmitProps) {
  const C = useSwapped("Submit");
  const { pending } = useFormStatus();
  if (C) return createElement(C, props);
  const { children, variant = "primary", disabled = false } = props;
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className={`inline-flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-1.5 text-sm disabled:opacity-60 ${
        variant === "primary" ? "bg-accent text-white" : QUIET_BUTTON
      }`}
    >
      {pending && <Spinner />}
      {children}
    </button>
  );
}

/**
 * An icon-only submit button. `label` is its accessible name; wrap it in a
 * `<Tip control>` for the tooltip. The icon turns into the loader while the
 * action runs.
 */
export function IconSubmit(props: IconSubmitProps) {
  const C = useSwapped("IconSubmit");
  const { pending } = useFormStatus();
  if (C) return createElement(C, props);
  return (
    <button
      type="submit"
      aria-label={props.label}
      disabled={pending}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-line bg-card text-ink hover:bg-tint disabled:opacity-60"
    >
      {pending ? <Spinner /> : props.icon}
    </button>
  );
}

const tipText = (p: InfoTipProps) => p.text ?? (p.term ? GLOSSARY[p.term] : "");
const tipId = (p: InfoTipProps) => `tip-${p.id ?? p.term ?? "info"}`;

/**
 * Tooltips explain how things work. They open on hover and on keyboard
 * focus, and screen readers read the text as the element's description.
 * CSS shows them; the named group (group/tip) keeps one from opening when
 * an outer "group" (an open case) is hovered.
 */
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
export function InfoTip(props: InfoTipProps) {
  const C = useSwapped("InfoTip");
  if (C) return createElement(C, props);
  const id = tipId(props);
  return (
    <span className="group/tip relative ml-1 inline-flex align-middle">
      <button
        type="button"
        aria-describedby={id}
        aria-label="What's this?"
        className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted hover:text-ink"
      >
        <Info aria-hidden className="h-3.5 w-3.5" />
      </button>
      <Bubble
        id={id}
        text={tipText(props)}
        side={props.side}
        align={props.align}
      />
    </span>
  );
}

/** Explains whatever it wraps (a chip, a number) on hover and focus. */
export function Tip(props: TipProps) {
  const C = useSwapped("Tip");
  if (C) return createElement(C, props);
  const id = tipId(props);
  return (
    <span
      className="group/tip relative inline-flex"
      {...(props.control ? {} : { tabIndex: 0, "aria-describedby": id })}
    >
      {props.children}
      <Bubble
        id={id}
        text={tipText(props)}
        side={props.side}
        align={props.align}
      />
    </span>
  );
}

/** A plain button: the native `<button>` unless your app names its own. */
export function Button(props: ButtonProps) {
  const C = useSwapped("Button");
  return C ? createElement(C, props) : <button {...props} />;
}

/** A one-line text field: the native `<input>` unless your app names its own. */
export function TextInput(props: TextInputProps) {
  const C = useSwapped("TextInput");
  return C ? createElement(C, props) : <input {...props} />;
}

/** A multi-line text field: the native `<textarea>` unless your app names its own. */
export function TextArea(props: TextAreaProps) {
  const C = useSwapped("TextArea");
  return C ? createElement(C, props) : <textarea {...props} />;
}

/** A dropdown: the native `<select>` unless your app names its own. */
export function Select(props: SelectProps) {
  const C = useSwapped("Select");
  return C ? createElement(C, props) : <select {...props} />;
}

/**
 * Keeps a page up to date while a test runs. Refreshing is your router's
 * job (Next.js's `router.refresh()`), so this draws nothing unless your
 * app names its own `RefreshWhile`; without one, reload to see results.
 */
export function RefreshWhile(props: RefreshWhileProps) {
  const C = useSwapped("RefreshWhile");
  return C ? createElement(C, props) : null;
}

/** A store that never changes, for useSyncExternalStore. */
const noChange = () => () => {};

/**
 * A date in the viewer's own time zone: "Oct 29, 2026", or with the time.
 * A server formats in its own zone (UTC on most hosts), which can show
 * tomorrow's date in someone's evening, so this renders UTC first and the
 * viewer's zone once the page loads, inside a <time> with the instant.
 */
export function LocalDate({
  date,
  time = false,
}: {
  date: Date | string;
  /** Include the time of day. */
  time?: boolean;
}) {
  const d = new Date(date);
  // False on the server and while hydrating, true once in the browser.
  const here = useSyncExternalStore(
    noChange,
    () => true,
    () => false,
  );
  const zone = here ? undefined : "UTC";
  return (
    <time dateTime={d.toISOString()}>
      {time ? momentOf(d, zone) : dayOf(d, zone)}
    </time>
  );
}
