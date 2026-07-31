"use client";

import { fmtUSD0 } from "@/lib/sankey/model";
import InfoDot from "@/components/InfoDot";

// The gain/loss colours the projector already uses for its trade-space deltas
// (see the next-PCS rows) — amber for worse, green for better.
const WORSE = "#b45309";
const BETTER = "#15803d";

const signed = (v: number, fmt: (n: number) => string) =>
  `${v >= 0 ? "+" : "−"}${fmt(Math.abs(v))}`;

export type TuneControl = {
  key: string;
  label: string;
  value: number;
  onChange: (next: number) => void;
  step: number;
  min: number;
  max?: number;
  /** Rendered inside the field, ahead of the number (e.g. "$"). */
  prefix?: string;
  /** Rendered after the field (e.g. "%", "/mo", "/yr"). */
  suffix?: string;
  /** Width utility for the number input — defaults to w-16. */
  width?: string;
  disabled?: boolean;
  /** One line explaining why the control is greyed out. */
  disabledReason?: string;
  /** InfoDot copy, when the control needs one. */
  info?: string;
  ariaLabel: string;
};

export type TuneDelta = {
  /** Change in the end-of-horizon total, nominal dollars. */
  endTotal: number;
  /** Change in the same total deflated to today's dollars. */
  realTotal: number;
  /** Change in the end total as a percent of the baseline total. */
  pct: number;
  /** Age the horizon ends at, for the "by age 60" phrasing. */
  endAge: number;
  /** Plain-English list of what moved, e.g. "Investing $150/mo (was $100)". */
  changes: string[];
};

// Nudge to the next step boundary rather than adding blindly, so a typed 137
// steps to 150 instead of 187.
function nudge(value: number, step: number, dir: 1 | -1): number {
  const n = value / step;
  const next = dir > 0 ? Math.floor(n) * step + step : Math.ceil(n) * step - step;
  return Math.round(next * 1e6) / 1e6;
}

/**
 * The "Tune this plan" panel that sits directly under the growth chart: the
 * same state the sidebar drives, in a form you can click while watching the
 * curve move, plus the delta against the plan you started with.
 */
export default function TuneStrip({
  controls,
  delta,
  dirty,
  onReset,
  onSetBaseline,
}: {
  controls: TuneControl[];
  /** Null while the plan still matches the baseline. */
  delta: TuneDelta | null;
  dirty: boolean;
  onReset: () => void;
  onSetBaseline: () => void;
}) {
  return (
    <div className="mt-4 rounded-2xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold">
          Tune this plan{" "}
          <InfoDot
            text={
              "Every control here writes the same value the sidebar does, so the chart, the table, and the reports all follow.\n\nThe dashed “Before tuning” line is the plan you started with — Reset puts it back, Set as baseline makes today's numbers the new comparison."
            }
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onReset}
            disabled={!dirty}
            className="rounded-full border px-3 py-1.5 text-xs font-medium hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
            title="Put every tuned number back to the plan you started with."
          >
            Reset
          </button>
          <button
            type="button"
            onClick={onSetBaseline}
            disabled={!dirty}
            className="rounded-full border border-black bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
            title="Adopt these numbers as the new comparison point — the dashed baseline line moves here."
          >
            Set as baseline
          </button>
        </div>
      </div>
      <p className="mt-1 text-xs text-gray-500">
        {
          "Nudge a number and the curve moves with it — an extra $50/mo compounds for decades."
        }
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {controls.map((c) => {
          const max = c.max ?? Number.POSITIVE_INFINITY;
          const clamp = (v: number) => Math.min(max, Math.max(c.min, v));
          const set = (v: number) => c.onChange(clamp(Number.isFinite(v) ? v : c.min));
          return (
            <div key={c.key} className="rounded-xl border p-3">
              <div className="flex items-center gap-1.5 text-xs font-medium text-gray-600">
                <span>{c.label}</span>
                {c.info && <InfoDot text={c.info} />}
              </div>
              <div
                className={`mt-2 flex flex-wrap items-center gap-1.5 ${
                  c.disabled ? "opacity-50" : ""
                }`}
              >
                <button
                  type="button"
                  disabled={c.disabled || c.value <= c.min}
                  onClick={() => set(nudge(c.value, c.step, -1))}
                  className="field inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm font-semibold leading-none disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label={`Decrease ${c.ariaLabel}`}
                >
                  −
                </button>
                <div className="field flex items-center rounded-lg px-2 py-1">
                  {c.prefix && <span className="text-gray-500">{c.prefix}</span>}
                  <input
                    type="number"
                    min={c.min}
                    max={c.max}
                    step={c.step}
                    value={c.value}
                    disabled={c.disabled}
                    onChange={(e) => set(Number(e.target.value))}
                    className={`${
                      c.width ?? "w-16"
                    } bg-transparent text-right text-sm outline-none disabled:cursor-not-allowed`}
                    aria-label={c.ariaLabel}
                  />
                </div>
                <button
                  type="button"
                  disabled={c.disabled || c.value >= max}
                  onClick={() => set(nudge(c.value, c.step, 1))}
                  className="field inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm font-semibold leading-none disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label={`Increase ${c.ariaLabel}`}
                >
                  +
                </button>
                {c.suffix && <span className="text-xs text-gray-600">{c.suffix}</span>}
              </div>
              {c.disabled && c.disabledReason && (
                <p className="mt-1.5 text-[11px] text-gray-400">{c.disabledReason}</p>
              )}
            </div>
          );
        })}
      </div>

      {delta ? (
        <div className="mt-3 rounded-xl border border-dashed p-3">
          <div
            className="text-sm font-semibold"
            style={{ color: delta.endTotal < 0 ? WORSE : BETTER }}
          >
            {`${signed(delta.endTotal, fmtUSD0)} by age ${delta.endAge} (${signed(
              delta.pct,
              (n) => `${n.toFixed(1)}%`
            )}) · ${signed(delta.realTotal, fmtUSD0)} in today's dollars`}
          </div>
          {delta.changes.length > 0 && (
            <p className="mt-1 text-xs text-gray-600">{delta.changes.join(" · ")}</p>
          )}
          <p className="mt-1 text-[11px] text-gray-400">
            {"Measured against the dashed “Before tuning” line on the chart."}
          </p>
        </div>
      ) : (
        <p className="mt-3 text-xs text-gray-500">
          {
            "Change any number above and the chart adds a dashed line showing where you started, so you can see exactly what the change is worth."
          }
        </p>
      )}
    </div>
  );
}
