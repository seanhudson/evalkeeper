import {
  MAX_LIMIT_USD,
  spendingHalt,
  spendingNeedsRoom,
  usd,
  type SpendingReading,
} from "../spending.js";
import type { EvalAppConfig } from "./app.js";
import { InfoTip, Submit, TextInput } from "./pieces.js";
import { WARN_PANEL } from "./format.js";

/**
 * What tests spent, and the stop, when it matters: over a limit, stopped,
 * or a test running (so Stop is in reach). Otherwise it renders nothing,
 * and spending lives in the page's menu. Needs your app's `spending`.
 *
 * @param props.reading - The reading the page loaded; null: none to show.
 */
export function SpendingAlert({
  app,
  reading,
}: {
  app: EvalAppConfig;
  reading: SpendingReading | null;
}) {
  if (!reading || !spendingNeedsRoom(reading)) return null;
  const halt = spendingHalt(reading);
  const stopped =
    reading.stoppedUntil !== null && reading.stoppedUntil > new Date();
  const { stopTests, allowTests } = app.actions;
  const canStop = app.spending?.stopAll && stopTests;
  const canAllow = app.spending?.allow && allowTests;
  return (
    <section
      aria-label="Eval spending"
      className={`flex flex-wrap items-start justify-between gap-3 rounded-lg p-4 text-sm ${WARN_PANEL}`}
    >
      <div className="readable space-y-1">
        <p className="font-medium">
          {halt
            ? stopped
              ? "Tests are stopped"
              : "Tests are over a daily limit"
            : `${reading.running} ${reading.running === 1 ? "test is" : "tests are"} running`}
          <InfoTip term="spending" id="spending-alert" />
        </p>
        <p>
          {halt ??
            `${usd(reading.spentUsd)} spent in the last 24 hours, of a ${usd(reading.limitUsd)} daily limit. Stop them if they cost more than you meant.`}
        </p>
      </div>
      {stopped
        ? canAllow && (
            <form action={allowTests}>
              <Submit variant="quiet">Allow tests</Submit>
            </form>
          )
        : reading.running > 0 &&
          canStop && (
            <form action={stopTests}>
              <Submit variant="quiet">Stop all tests</Submit>
            </form>
          )}
    </section>
  );
}

/**
 * The Spending and daily limits drawer: the last 24 hours' spending, then
 * one form for both limits with one Save. On a suite's page the reading
 * has its feature; an empty feature limit means its default.
 *
 * @param props.suite - The suite whose page this is, for its feature's limit.
 * @param props.label - That feature's name, as the page shows it.
 */
export function SpendingForm({
  app,
  reading,
  suite,
  label,
}: {
  app: EvalAppConfig;
  reading: SpendingReading;
  suite?: string;
  label?: string;
}) {
  const f = reading.feature;
  const name = label ?? "This feature";
  const action = app.actions.saveLimits;
  return (
    <div className="space-y-5">
      <dl className="space-y-2">
        <div className="flex justify-between gap-4">
          <dt className="text-muted">All tests, last 24 hours</dt>
          <dd className="font-medium tabular-nums">
            {usd(reading.spentUsd)} of {usd(reading.limitUsd)}
          </dd>
        </div>
        {f && (
          <div className="flex justify-between gap-4">
            <dt className="text-muted">{name}, last 24 hours</dt>
            <dd className="font-medium tabular-nums">
              {usd(f.spentUsd)}
              {f.limitUsd === null
                ? ", no limit of its own"
                : ` of ${usd(f.limitUsd)}`}
            </dd>
          </div>
        )}
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Running now</dt>
          <dd className="tabular-nums">{reading.running}</dd>
        </div>
      </dl>
      {action && (
        // Keyed by the saved values, so the fields show them after a save.
        <form
          key={`${reading.limitUsd}-${f?.limitUsd ?? "none"}`}
          action={action}
          className="space-y-4"
        >
          {suite && f && (
            <>
              <input type="hidden" name="suite" value={suite} />
              <input type="hidden" name="operation" value={f.operation} />
            </>
          )}
          <MoneyField
            id="limit-all"
            name="allUsd"
            label="Daily limit for all tests"
            help="Every feature's tests together stop at this, over any 24 hours."
            value={reading.limitUsd}
            required
          />
          {suite && f && (
            <MoneyField
              id="limit-feature"
              name="featureUsd"
              label={`Daily limit for ${name}`}
              help={
                f.defaultUsd === null
                  ? "Leave it empty for none of its own: only the limit for all tests applies."
                  : `Leave it empty for its default, ${usd(f.defaultUsd)}.`
              }
              value={
                f.limitUsd !== null && f.limitUsd !== f.defaultUsd
                  ? f.limitUsd
                  : null
              }
            />
          )}
          <Submit>Save limits</Submit>
        </form>
      )}
    </div>
  );
}

/** A dollar field: a $ before it, and the saved value to the cent. */
function MoneyField({
  id,
  name,
  label,
  help,
  value,
  required = false,
}: {
  id: string;
  name: string;
  label: string;
  help: string;
  value: number | null;
  required?: boolean;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block font-medium">
        {label}
      </label>
      <div className="flex items-center rounded-md border border-line bg-card focus-within:border-accent">
        <span aria-hidden className="pl-3 text-muted">
          $
        </span>
        <TextInput
          id={id}
          name={name}
          inputMode="decimal"
          required={required}
          defaultValue={value === null ? "" : value.toFixed(2)}
          aria-describedby={`${id}-help`}
          pattern="\$?[0-9,]*(\.[0-9]{0,2})?"
          title={`Dollars, up to ${usd(MAX_LIMIT_USD)}`}
          className="w-full rounded-md bg-transparent px-2 py-2 tabular-nums focus:outline-none"
        />
      </div>
      <p id={`${id}-help`} className="text-xs text-muted">
        {help}
      </p>
    </div>
  );
}
