"use client";

// "Over-contributed to TSP?" — the mid-year reset.
//
// Someone told they should run 47% to max the year, who has been running 60%
// since January, needs a different number for the rest of the year. Setting the
// election too high does not add money: TSP stops the deferral at the IRS limit,
// and the BRS match is worked out per pay period, so every stopped month
// forfeits that month's match.
//
// Shared by the Pay Calculator, Budget Builder and Wealth Projector. It opens
// closed so it never adds noise for the majority who are nowhere near the limit.

import { useMemo, useState } from "react";
import InfoDot from "@/components/InfoDot";
import { fmtUSD0 } from "@/lib/sankey/model";
import { computeTspReset, FULL_MATCH_PCT } from "@/lib/pay/tsp-reset";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function pctLabel(pct: number): string {
  const shown = pct * 100;
  return `${shown < 10 ? shown.toFixed(1) : Math.round(shown)}%`;
}

export default function TspResetCalculator({
  monthlyBasePay = 0,
  currentPct = 0,
  onApply,
  className = "",
}: {
  /** Prefill: monthly base pay — the only pay TSP percentages apply to. */
  monthlyBasePay?: number;
  /** Prefill: the elected percent as a decimal (0.6 = 60%). */
  currentPct?: number;
  /** When provided, offers a button that writes the suggested percent back. */
  onApply?: (pct: number) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [payText, setPayText] = useState("");
  const [pctText, setPctText] = useState("");
  const [monthsText, setMonthsText] = useState("");
  const [ytdText, setYtdText] = useState("");

  const pay = payText.trim() === "" ? monthlyBasePay : Number(payText);
  const pct = pctText.trim() === "" ? currentPct * 100 : Number(pctText);
  const monthsElapsed = monthsText.trim() === "" ? 0 : Number(monthsText);
  const ytd = ytdText.trim() === "" ? undefined : Number(ytdText);

  const result = useMemo(
    () =>
      computeTspReset({
        monthlyBasePay: Number.isFinite(pay) ? pay : 0,
        currentPct: Number.isFinite(pct) ? pct / 100 : 0,
        monthsElapsed: Number.isFinite(monthsElapsed) ? monthsElapsed : 0,
        contributedYtd: ytd !== undefined && Number.isFinite(ytd) ? ytd : undefined,
      }),
    [pay, pct, monthsElapsed, ytd]
  );

  const canSuggest = result.monthsRemaining > 0 && pay > 0 && !result.alreadyAtLimit;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`text-xs font-medium text-gray-600 underline underline-offset-2 transition hover:text-[var(--brand-blue)] ${className}`}
      >
        Over-contributed to TSP? Work out your new percentage →
      </button>
    );
  }

  return (
    <div className={`rounded-2xl border p-4 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            Over-contributed to TSP?
            <InfoDot text="The IRS limit caps what you can defer in a calendar year. Contributing a high percent early does not add money — TSP stops at the limit, and because the BRS match is worked out each pay period, you forfeit the match for every month you are stopped. This works out the percent to run for the rest of the year so the last dollar lands on the final pay period." />
          </h3>
          <p className="mt-1 text-xs text-gray-500">
            Tell us what you have put in so far and we will work out the percent to run for the rest
            of the year.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="shrink-0 text-xs font-medium text-gray-500 transition hover:text-gray-900"
        >
          Close
        </button>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-gray-600">
          Monthly base pay
          <input
            type="number"
            inputMode="decimal"
            min={0}
            value={payText}
            placeholder={monthlyBasePay > 0 ? String(Math.round(monthlyBasePay)) : "4,340"}
            onChange={(e) => setPayText(e.target.value)}
            className="field mt-1 w-full rounded-xl px-3 py-2 text-sm"
          />
        </label>

        <label className="text-xs text-gray-600">
          Current contribution %
          <input
            type="number"
            inputMode="decimal"
            min={0}
            max={100}
            value={pctText}
            placeholder={currentPct > 0 ? String(Math.round(currentPct * 100)) : "60"}
            onChange={(e) => setPctText(e.target.value)}
            className="field mt-1 w-full rounded-xl px-3 py-2 text-sm"
          />
        </label>

        <label className="text-xs text-gray-600">
          <span className="flex items-center gap-1.5">
            Months contributed this year
            <InfoDot text="How many pay periods this calendar year you have already contributed at that percent. January through the end of last month." />
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={12}
            value={monthsText}
            placeholder="5"
            onChange={(e) => setMonthsText(e.target.value)}
            className="field mt-1 w-full rounded-xl px-3 py-2 text-sm"
          />
        </label>

        <label className="text-xs text-gray-600">
          <span className="flex items-center gap-1.5">
            Contributed so far (optional)
            <InfoDot text="The exact year-to-date TSP figure from your LES. Leave blank and we estimate it from your percent and the months above — the LES figure is always the more reliable one." />
          </span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            value={ytdText}
            placeholder={fmtUSD0(result.contributedYtd).replace("$", "")}
            onChange={(e) => setYtdText(e.target.value)}
            className="field mt-1 w-full rounded-xl px-3 py-2 text-sm"
          />
        </label>
      </div>

      <div className="mt-4 rounded-xl border bg-[var(--field-bg)]/40 p-3">
        {canSuggest ? (
          <>
            <p className="text-xs text-gray-600">
              Set your contribution to
              <span className="ml-1.5 text-lg font-semibold text-gray-900">
                {pctLabel(result.suggestedPct)}
              </span>
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {fmtUSD0(result.suggestedMonthly)}/mo for your remaining {result.monthsRemaining}{" "}
              {result.monthsRemaining === 1 ? "month" : "months"} — landing on{" "}
              {fmtUSD0(result.limit)} exactly.
            </p>
            {onApply && (
              <button
                type="button"
                onClick={() => onApply(result.suggestedPct)}
                className="mt-2.5 rounded-full border border-black bg-black px-3.5 py-1.5 text-xs font-medium text-white transition hover:bg-gray-800"
              >
                Use {pctLabel(result.suggestedPct)}
              </button>
            )}
          </>
        ) : (
          <p className="text-xs text-gray-600">
            {result.alreadyAtLimit
              ? "You are already at this year's limit — set your election for January."
              : "Enter your base pay and how many months you have contributed."}
          </p>
        )}
      </div>

      <dl className="mt-3 space-y-1.5 text-xs">
        <div className="flex justify-between gap-3">
          <dt className="text-gray-500">Contributed so far</dt>
          <dd className="font-medium tabular-nums">{fmtUSD0(result.contributedYtd)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-gray-500">Room left this year</dt>
          <dd className="font-medium tabular-nums">{fmtUSD0(result.remainingRoom)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="flex items-center gap-1.5 text-gray-500">
            Even percent for a full year
            <InfoDot text="The percent that would have spread the annual limit evenly across all 12 pay periods from January — the number to elect next year to stay contributing (and matched) every month." />
          </dt>
          <dd className="font-medium tabular-nums">{pctLabel(result.evenPctForYear)}</dd>
        </div>
        {result.limitReachedInMonth !== null && (
          <div className="flex justify-between gap-3">
            <dt className="text-gray-500">At your current percent you stop in</dt>
            <dd className="font-medium tabular-nums">
              {MONTH_NAMES[result.limitReachedInMonth - 1]}
            </dd>
          </div>
        )}
      </dl>

      {result.warnings.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {result.warnings.map((w) => (
            <li key={w} className="text-xs leading-5 text-amber-700">
              {w}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 text-[11px] leading-4 text-gray-400">
        Contributing at least {Math.round(FULL_MATCH_PCT * 100)}% of base pay every month captures
        the full BRS match, and agency money never counts against your own limit. Change your
        election in myPay; it takes effect the following pay period. Planning estimate — confirm
        against your LES.
      </p>
    </div>
  );
}
