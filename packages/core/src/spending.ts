/**
 * What eval tests have spent against daily limits, and the stop, as the
 * eval pages show them. Your app keeps the numbers and enforces the limits
 * where its AI calls are made; Evalkeeper draws the panel and the form, so
 * no app adds its own UI to the eval pages. Pure, apart from
 * `memorySpending`, which keeps everything in memory for demos and tests.
 */

/** Spending over the last 24 hours against the daily limits. */
export type SpendingReading = {
  /** USD every eval test spent in the last 24 hours, all features. */
  spentUsd: number;
  /** The daily limit for all tests together, in USD. */
  limitUsd: number;
  /** Tests are stopped until then; null: not stopped. */
  stoppedUntil: Date | null;
  /** Tests running now. */
  running: number;
  /** The feature a suite's page tests, when the reading is for one. */
  feature?: {
    operation: string;
    spentUsd: number;
    /** Its own daily limit, in USD; null: none of its own. */
    limitUsd: number | null;
    /** What an empty limit falls back to (null: none of its own), for the form. */
    defaultUsd: number | null;
  };
};

/** The limits a person saves, from the Spending and daily limits form. */
export type SpendingLimits = {
  /** The daily limit for all tests, in USD. */
  allUsd: number;
  /** The feature's own limit; null: its default. Only on a suite's page. */
  feature?: { operation: string; usd: number | null };
};

/**
 * Your app's spending, for the eval pages: read it, save limits, and stop
 * or allow tests. Pass it as `spending` in your wiring. Without it, the
 * pages show no spending at all.
 */
export type EvalSpending = {
  /** Spending and limits; with an operation, that feature's too. */
  read(operation?: string): Promise<SpendingReading>;
  /** Saves both limits at once (one form, one Save). */
  saveLimits(limits: SpendingLimits, by: string): Promise<void>;
  /**
   * Stops every test now: no eval call is allowed for a while, and tests
   * marked running are closed. Returns how many it closed. Leave it out
   * and the pages offer no Stop.
   */
  stopAll?(by: string): Promise<number>;
  /** Lifts a stop early; the limits still apply. */
  allow?(): Promise<void>;
};

/**
 * Above this, in USD, Test every model asks for a second press first
 * (`EvalApp.confirmTestsAboveUsd` changes it).
 */
export const CONFIRM_TESTS_USD = 5;

/** The most a limit can be set to, so a typo can't remove it. */
export const MAX_LIMIT_USD = 500;

/** USD as the pages show money: "$15.00". */
export const usd = (n: number): string => `$${n.toFixed(2)}`;

/**
 * A limit as typed, in dollars: a number from a cent to MAX_LIMIT_USD
 * (a leading $ and commas allowed), rounded to the cent; null when empty.
 * Throws a sentence a person can act on when it doesn't fit.
 *
 * @param typed - The field's text.
 */
export function parseLimit(typed: string): number | null {
  const t = typed.trim().replace(/^\$/, "").replaceAll(",", "");
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0.01 || n > MAX_LIMIT_USD)
    throw new Error(
      `Enter a limit in dollars, from $0.01 to ${usd(MAX_LIMIT_USD)}.`,
    );
  return Math.round(n * 100) / 100;
}

/**
 * Reads the Spending and daily limits form: `allUsd` (required) and, on a
 * suite's page, `operation` and `featureUsd` (empty: its default).
 *
 * @param form - The submitted form.
 */
export function limitsFromForm(form: FormData): SpendingLimits {
  const text = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" ? v : "";
  };
  const allUsd = parseLimit(text("allUsd"));
  if (allUsd === null) throw new Error("Enter a daily limit for all tests.");
  const operation = text("operation").trim();
  return operation
    ? { allUsd, feature: { operation, usd: parseLimit(text("featureUsd")) } }
    : { allUsd };
}

/**
 * The runner's `budget` from your spending: a test's next answer waits
 * while tests are stopped or over a daily limit (`spendingHalt`), and the
 * test says why in those words. `read` runs before every new answer, so
 * cache it for a few seconds.
 *
 * @param spending - Your app's spending (only `read` is used).
 * @example
 * ```ts
 * const runner = createRunner({ ...options, budget: spendingBudget(spending) });
 * ```
 */
export function spendingBudget(
  spending: Pick<EvalSpending, "read">,
): (call: { operation: string }) => Promise<string | null> {
  return async ({ operation }) => spendingHalt(await spending.read(operation));
}

/** Why tests can't run now, in words that say what to do; null: they can. */
export function spendingHalt(
  r: SpendingReading,
  now: Date = new Date(),
): string | null {
  if (r.stoppedUntil && r.stoppedUntil > now)
    return `Tests are stopped until ${timeOf(r.stoppedUntil)}. Answers already given are kept, and reused when you test again. Allow tests to start sooner.`;
  if (r.spentUsd >= r.limitUsd)
    return `Tests have spent ${usd(r.spentUsd)} in the last 24 hours, over the ${usd(r.limitUsd)} daily limit for all tests. Raise the limit, or wait until earlier spending is more than 24 hours old.`;
  const f = r.feature;
  if (f && f.limitUsd !== null && f.spentUsd >= f.limitUsd)
    return `This feature's tests have spent ${usd(f.spentUsd)} in the last 24 hours, over its ${usd(f.limitUsd)} daily limit. Raise its limit, or wait until earlier spending is more than 24 hours old.`;
  return null;
}

/**
 * Whether spending earns room on the page: tests are stopped, over a
 * limit, or running (so Stop is in reach). Otherwise it stays in the
 * page's menu.
 */
export function spendingNeedsRoom(
  r: SpendingReading,
  now: Date = new Date(),
): boolean {
  return r.running > 0 || spendingHalt(r, now) !== null;
}

const timeOf = (d: Date) =>
  d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

/**
 * Spending kept in memory, for demos and tests: you add what each test
 * spends (`spend`) and how many run (`setRunning`), and the stop lasts
 * `stopMinutes`.
 *
 * @param opts - Starting limits, defaults per feature, and how long a stop lasts.
 */
export function memorySpending(
  opts: {
    limitUsd?: number;
    featureDefaults?: Readonly<Record<string, number>>;
    stopMinutes?: number;
  } = {},
): EvalSpending & {
  /** Records USD a feature's test spent, now. */
  spend(operation: string, usd: number, at?: Date): void;
  /** Sets how many tests are running. */
  setRunning(n: number): void;
} {
  let limitUsd = opts.limitUsd ?? 15;
  const own = new Map<string, number>();
  const spent: { operation: string; usd: number; at: Date }[] = [];
  let running = 0;
  let stoppedUntil: Date | null = null;
  const since = () => Date.now() - 24 * 60 * 60 * 1000;
  const sum = (op?: string) =>
    spent
      .filter(
        (s) => +s.at >= since() && (op === undefined || s.operation === op),
      )
      .reduce((t, s) => t + s.usd, 0);
  return {
    async read(operation) {
      const defaultUsd =
        operation === undefined
          ? null
          : (opts.featureDefaults?.[operation] ?? null);
      return {
        spentUsd: sum(),
        limitUsd,
        stoppedUntil,
        running,
        ...(operation === undefined
          ? {}
          : {
              feature: {
                operation,
                spentUsd: sum(operation),
                limitUsd: own.get(operation) ?? defaultUsd,
                defaultUsd,
              },
            }),
      };
    },
    async saveLimits(limits) {
      limitUsd = limits.allUsd;
      const f = limits.feature;
      if (f) {
        if (f.usd === null) own.delete(f.operation);
        else own.set(f.operation, f.usd);
      }
    },
    async stopAll() {
      stoppedUntil = new Date(Date.now() + (opts.stopMinutes ?? 15) * 60_000);
      const closed = running;
      running = 0;
      return closed;
    },
    async allow() {
      stoppedUntil = null;
    },
    spend(operation, amount, at = new Date()) {
      spent.push({ operation, usd: amount, at });
    },
    setRunning(n) {
      running = n;
    },
  };
}
