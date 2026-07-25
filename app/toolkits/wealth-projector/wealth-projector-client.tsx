"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { fmtUSD0 } from "@/lib/sankey/model";
import {
  DEFAULT_FUND_ALLOCATION,
  TSP_ELECTIVE_DEFERRAL_LIMIT_2026,
  TSP_FUNDS,
  type FundAllocation,
  type TspFundKey,
} from "@/lib/pay/tsp";
import {
  blendedAnnualReturn,
  brsAgencyPct,
  projectWealth,
  yearsToDouble,
  type AccountInput,
} from "@/lib/projection/wealth";
import {
  applyAssignments,
  budgetContributionCandidates,
  type ContributionDestination,
} from "@/lib/projection/budget-link";
import fundPerformance from "@/data/tsp/fund-performance.json";

const emptySubscribe = () => () => {};

type ReturnPreset = "longRun" | "tenYear" | "custom";

type FundPerf = {
  asOf: string;
  funds: Record<TspFundKey, { name: string; longRunPct: number; tenYearPct: number }>;
  calendarReturnsPct: Record<string, Record<TspFundKey, number>>;
  otherAssets: {
    sp500LongRunPct: number;
    savingsApyPct: number;
    inflationPct: number;
  };
};
const PERF = fundPerformance as unknown as FundPerf;
const FUND_KEYS = TSP_FUNDS.map((f) => f.key);

// One-time read of the saved Budget Builder state (used for prefill and the
// "Use your budget" contribution assignments). Shape is best-effort — every
// consumer guards the fields it reads.
type StoredBudget = {
  income?: Array<{ id?: string; label?: string; amount?: number }>;
  expenses?: Array<{ id?: string; label?: string; amount?: number }>;
  tspPct?: number;
  tspBaseId?: string;
  fundAlloc?: FundAllocation;
};

function loadSavedBudgetRaw(): StoredBudget | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("activepayos:budget:v1");
    return raw ? (JSON.parse(raw) as StoredBudget) : null;
  } catch {
    return null;
  }
}

// Pull starting values from the saved Budget Builder state when it exists, so
// the projector opens on the user's real numbers without any new data entry.
function loadBudgetPrefill(): {
  basePay?: number;
  tspPct?: number;
  fundAlloc?: FundAllocation;
} {
  try {
    const parsed = loadSavedBudgetRaw();
    if (!parsed) return {};
    const income: Array<{ id?: string; label?: string; amount?: number }> = Array.isArray(
      parsed?.income
    )
      ? parsed.income
      : [];
    const baseRow =
      income.find((i) => i.id === parsed?.tspBaseId) ??
      income.find((i) => /base/i.test(i.label ?? ""));
    return {
      basePay:
        typeof baseRow?.amount === "number" && baseRow.amount > 0 ? baseRow.amount : undefined,
      tspPct: typeof parsed?.tspPct === "number" && parsed.tspPct > 0 ? parsed.tspPct : undefined,
      fundAlloc:
        parsed?.fundAlloc && typeof parsed.fundAlloc === "object" ? parsed.fundAlloc : undefined,
    };
  } catch {
    return {};
  }
}

const CHART_COLORS: Record<string, string> = {
  tsp: "#3b82f6",
  invest: "#22c55e",
  savings: "#f59e0b",
};

export default function WealthProjectorClient() {
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);

  // ---- Horizon ----
  const [years, setYears] = useState(5);
  const [inflationPct, setInflationPct] = useState(PERF.otherAssets.inflationPct);

  // ---- TSP ----
  const [prefill] = useState(loadBudgetPrefill);
  const [tspBalance, setTspBalance] = useState(5000);
  const [basePay, setBasePay] = useState(() => prefill.basePay ?? 3826);
  const [contribPct, setContribPct] = useState(() => prefill.tspPct ?? 0.05);
  const [brs, setBrs] = useState(true);
  const [alloc, setAlloc] = useState<FundAllocation>(
    () => prefill.fundAlloc ?? DEFAULT_FUND_ALLOCATION
  );
  const [preset, setPreset] = useState<ReturnPreset>("longRun");
  const [customReturns, setCustomReturns] = useState<Record<TspFundKey, number>>(() =>
    Object.fromEntries(FUND_KEYS.map((k) => [k, PERF.funds[k].longRunPct])) as Record<
      TspFundKey,
      number
    >
  );
  const [showTspDetail, setShowTspDetail] = useState(false);

  // ---- "Use your budget" contribution assignments ----
  const [candidates] = useState(() => budgetContributionCandidates(loadSavedBudgetRaw()));
  const [assignments, setAssignments] = useState<Record<string, ContributionDestination>>({});
  const [showAllRows, setShowAllRows] = useState(false);
  const [budgetNote, setBudgetNote] = useState<string | null>(null);

  // ---- Taxable investments & savings ----
  const [invBalance, setInvBalance] = useState(1000);
  const [invMonthly, setInvMonthly] = useState(100);
  const [invReturnPct, setInvReturnPct] = useState(PERF.otherAssets.sp500LongRunPct);
  const [savBalance, setSavBalance] = useState(2000);
  const [savMonthly, setSavMonthly] = useState(150);
  const [savApyPct, setSavApyPct] = useState(PERF.otherAssets.savingsApyPct);

  // ---- Derived ----
  const fundReturns = useMemo(() => {
    return Object.fromEntries(
      FUND_KEYS.map((k) => [
        k,
        (preset === "longRun"
          ? PERF.funds[k].longRunPct
          : preset === "tenYear"
          ? PERF.funds[k].tenYearPct
          : customReturns[k]) / 100,
      ])
    ) as Record<TspFundKey, number>;
  }, [preset, customReturns]);

  const tspReturn = blendedAnnualReturn(alloc, fundReturns);

  const employeeUncapped = Math.max(0, basePay) * Math.max(0, contribPct);
  const employeeMonthly = Math.min(employeeUncapped, TSP_ELECTIVE_DEFERRAL_LIMIT_2026 / 12);
  const tspCapped = employeeUncapped > employeeMonthly + 0.005;
  const agencyMonthly = brs ? Math.max(0, basePay) * brsAgencyPct(Math.max(0, contribPct)) : 0;

  const accounts: AccountInput[] = useMemo(
    () => [
      {
        key: "tsp",
        label: "TSP",
        startBalance: tspBalance,
        monthlyContribution: employeeMonthly + agencyMonthly,
        annualReturn: tspReturn,
      },
      {
        key: "invest",
        label: "Investments",
        startBalance: invBalance,
        monthlyContribution: invMonthly,
        annualReturn: invReturnPct / 100,
      },
      {
        key: "savings",
        label: "Savings",
        startBalance: savBalance,
        monthlyContribution: savMonthly,
        annualReturn: savApyPct / 100,
      },
    ],
    [
      tspBalance,
      employeeMonthly,
      agencyMonthly,
      tspReturn,
      invBalance,
      invMonthly,
      invReturnPct,
      savBalance,
      savMonthly,
      savApyPct,
    ]
  );

  const inflation = Math.max(0, inflationPct) / 100;
  const projection = useMemo(
    () => projectWealth(accounts, years, inflation),
    [accounts, years, inflation]
  );
  // "What if I stayed 3 more years" — the stay-in/get-out trade space in one number.
  const extended = useMemo(
    () => projectWealth(accounts, years + 3, inflation),
    [accounts, years, inflation]
  );

  const startYear = new Date().getFullYear();
  const endYear = startYear + years;
  const agencyTotal = agencyMonthly * 12 * years;
  const doubling = yearsToDouble(tspReturn);
  const startTotal = accounts.reduce((s, a) => s + Math.max(0, a.startBalance), 0);
  const allocTotal = FUND_KEYS.reduce((a, k) => a + (alloc[k] || 0), 0);

  const pctInput =
    "field w-16 rounded-lg px-2 py-1 text-right text-sm outline-none";

  function num(v: string, fallback = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  const destinationOf = (id: string, suggested: ContributionDestination) =>
    assignments[id] ?? suggested;
  const visibleCandidates = showAllRows
    ? candidates
    : candidates.filter((c) => destinationOf(c.id, c.suggested) !== "skip");
  const assignedTotals = applyAssignments(candidates, assignments);

  function applyBudgetAssignments() {
    setSavMonthly(assignedTotals.savingsMonthly);
    setInvMonthly(assignedTotals.investMonthly);
    setBudgetNote(
      `Applied — savings now ${fmtUSD0(assignedTotals.savingsMonthly)}/mo and investments ${fmtUSD0(
        assignedTotals.investMonthly
      )}/mo. Adjust either below anytime.`
    );
  }

  return (
    <main className="space-y-8">
      <header className="rounded-3xl border bg-white p-6 md:p-8 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Wealth Projector</h1>
            <p className="mt-2 max-w-2xl text-sm text-gray-600">
              See where your TSP, investments, and savings could be by the end of your service
              commitment — and what staying in longer is worth. Every assumption is editable.
            </p>
            <p className="mt-2 max-w-2xl text-xs text-gray-500">
              Educational planning estimate, not investment advice. Markets vary year to year;
              past performance does not predict future returns.
            </p>
          </div>
          <span
            className="w-fit shrink-0 rounded-full border bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700"
            title="Your numbers stay in your browser. Nothing is sent to a server."
          >
            🔒 Private — runs entirely in your browser
          </span>
        </div>
      </header>

      {!mounted ? (
        <div className="rounded-3xl border bg-white p-10 text-center text-sm text-gray-500 shadow-sm">
          Loading projector…
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
          {/* ------------------------------ Inputs ------------------------------ */}
          <section className="space-y-6">
            <div className="rounded-3xl border bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold">Your horizon</h2>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                <input
                  type="range"
                  min={1}
                  max={30}
                  value={years}
                  onChange={(e) => setYears(num(e.target.value, 5))}
                  className="w-full"
                  aria-label="Years remaining on your commitment"
                />
                <span className="font-medium">
                  {years} year{years === 1 ? "" : "s"} left
                </span>
                <span className="text-gray-500">→ projected through {endYear}</span>
              </div>
              <div className="mt-3 flex items-center gap-2 text-xs text-gray-600">
                <span>Inflation assumption</span>
                <input
                  type="number"
                  min={0}
                  max={10}
                  step={0.1}
                  value={inflationPct}
                  onChange={(e) => setInflationPct(Math.max(0, Math.min(10, num(e.target.value))))}
                  className={pctInput}
                  aria-label="Inflation percent per year"
                />
                <span>%/yr (for today&apos;s-dollar figures)</span>
              </div>
            </div>

            {/* Budget → contributions hand-off */}
            {candidates.length > 0 && (
              <div className="rounded-3xl border border-[var(--brand-blue)]/40 bg-[var(--brand-blue)]/5 p-5 shadow-sm">
                <h2 className="text-lg font-semibold">Use your budget</h2>
                <p className="mt-1 text-xs text-gray-500">
                  Point categories from your saved budget at an account below, then apply. TSP-
                  and debt-labeled rows are skipped by default (TSP is already modeled above;
                  debt payments pay down balances, not these accounts).
                </p>

                {visibleCandidates.length === 0 ? (
                  <p className="mt-3 rounded-xl bg-white/70 px-3 py-2 text-xs text-gray-600">
                    No savings-type categories or leftover found in your budget — use “show all”
                    to assign any category or income row.
                  </p>
                ) : (
                  <div className="mt-3 space-y-1.5">
                    {visibleCandidates.map((c) => (
                      <div key={c.id} className="flex items-center gap-2 text-sm">
                        <span className="min-w-0 flex-1 truncate" title={c.label}>
                          {c.label}
                          {c.kind === "leftover" && (
                            <span className="ml-1 rounded-full bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                              income − expenses
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 text-gray-600">{fmtUSD0(c.monthly)}/mo</span>
                        <select
                          value={destinationOf(c.id, c.suggested)}
                          onChange={(e) =>
                            setAssignments((prev) => ({
                              ...prev,
                              [c.id]: e.target.value as ContributionDestination,
                            }))
                          }
                          className="field shrink-0 rounded-lg px-2 py-1 text-xs"
                          aria-label={`Where ${c.label} goes in the projection`}
                        >
                          <option value="savings">→ Savings</option>
                          <option value="invest">→ Investments</option>
                          <option value="skip">Skip</option>
                        </select>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={applyBudgetAssignments}
                    className="rounded-full border border-black bg-black px-4 py-2 text-xs font-medium text-white hover:bg-gray-800"
                  >
                    Apply {fmtUSD0(assignedTotals.savingsMonthly)} + {fmtUSD0(assignedTotals.investMonthly)}
                    /mo
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAllRows((s) => !s)}
                    className="text-xs font-medium text-gray-600 underline underline-offset-2 hover:text-gray-900"
                  >
                    {showAllRows ? "Show suggested only" : "Show all categories & income"}
                  </button>
                </div>
                {budgetNote && (
                  <p className="mt-2 rounded-xl bg-white/70 px-3 py-2 text-xs text-gray-600">
                    {budgetNote}
                  </p>
                )}
              </div>
            )}

            {/* TSP */}
            <div className="rounded-3xl border bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">TSP</h2>
                <span className="text-sm font-semibold">
                  {fmtUSD0(employeeMonthly + agencyMonthly)}/mo
                </span>
              </div>
              {(prefill.tspPct || prefill.basePay) && (
                <p className="mt-1 text-[11px] text-gray-400">
                  Pre-filled from your saved budget — edit anything.
                </p>
              )}
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-gray-600">Balance today</span>
                  <div className="field flex items-center rounded-lg px-2 py-1">
                    <span className="text-gray-500">$</span>
                    <input
                      type="number"
                      min={0}
                      step={500}
                      value={tspBalance === 0 ? "" : tspBalance}
                      placeholder="0"
                      onChange={(e) => setTspBalance(Math.max(0, num(e.target.value)))}
                      className="w-24 bg-transparent text-right outline-none"
                      aria-label="Current TSP balance"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-gray-600">Base pay</span>
                  <div className="field flex items-center rounded-lg px-2 py-1">
                    <span className="text-gray-500">$</span>
                    <input
                      type="number"
                      min={0}
                      step={100}
                      value={basePay === 0 ? "" : basePay}
                      placeholder="0"
                      onChange={(e) => setBasePay(Math.max(0, num(e.target.value)))}
                      className="w-20 bg-transparent text-right outline-none"
                      aria-label="Monthly base pay"
                    />
                  </div>
                  <span className="text-gray-600">/mo · contributing</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={Math.round(contribPct * 100)}
                    onChange={(e) =>
                      setContribPct(Math.max(0, Math.min(100, num(e.target.value))) / 100)
                    }
                    className={pctInput}
                    aria-label="TSP contribution percent of base pay"
                  />
                  <span className="text-gray-600">%</span>
                </div>
                <label className="flex items-center gap-2 text-xs text-gray-600">
                  <input
                    type="checkbox"
                    checked={brs}
                    onChange={(e) => setBrs(e.target.checked)}
                  />
                  BRS agency contributions (1% automatic + up to 4% match)
                </label>
                <p className="text-xs text-gray-500">
                  You: {fmtUSD0(employeeMonthly)}/mo
                  {brs && <> · Agency: {fmtUSD0(agencyMonthly)}/mo</>}
                  {tspCapped && (
                    <span className="text-amber-700">
                      {" "}
                      · capped at the {fmtUSD0(TSP_ELECTIVE_DEFERRAL_LIMIT_2026)} annual limit
                    </span>
                  )}
                  {brs && contribPct < 0.05 && (
                    <span className="text-amber-700">
                      {" "}
                      · contribute 5% to collect the full match
                    </span>
                  )}
                </p>

                <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                  <span className="text-gray-600">Assumed returns</span>
                  <select
                    value={preset}
                    onChange={(e) => setPreset(e.target.value as ReturnPreset)}
                    className="field rounded-lg px-2 py-1 text-xs"
                    aria-label="Return assumption preset"
                  >
                    <option value="longRun">Long run (since 1987–88)</option>
                    <option value="tenYear">Last 10 years (2016–2025)</option>
                    <option value="custom">Custom</option>
                  </select>
                  <span className="font-medium text-gray-700">
                    blended ≈ {(tspReturn * 100).toFixed(1)}%/yr
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setShowTspDetail((s) => !s)}
                  className="text-xs font-medium text-gray-600 underline underline-offset-2 hover:text-gray-900"
                >
                  {showTspDetail ? "Hide" : "Edit"}
                  {" fund mix & returns"}
                </button>
                {showTspDetail && (
                  <div className="space-y-1.5 pt-1">
                    {TSP_FUNDS.map((f) => (
                      <div key={f.key} className="flex items-center gap-2 text-xs">
                        <span
                          className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: f.color }}
                        />
                        <span className="w-12 font-medium">{f.name}</span>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={5}
                          value={alloc[f.key] || 0}
                          onChange={(e) =>
                            setAlloc((prev) => ({
                              ...prev,
                              [f.key]: Math.max(0, Math.min(100, num(e.target.value))),
                            }))
                          }
                          className={pctInput}
                          aria-label={`${f.name} allocation percent`}
                        />
                        <span className="text-gray-500">% ·</span>
                        {preset === "custom" ? (
                          <input
                            type="number"
                            min={-20}
                            max={30}
                            step={0.1}
                            value={customReturns[f.key]}
                            onChange={(e) =>
                              setCustomReturns((prev) => ({
                                ...prev,
                                [f.key]: num(e.target.value),
                              }))
                            }
                            className={pctInput}
                            aria-label={`${f.name} assumed annual return percent`}
                          />
                        ) : (
                          <span className="w-16 text-right font-medium">
                            {(fundReturns[f.key] * 100).toFixed(1)}
                          </span>
                        )}
                        <span className="text-gray-500">%/yr</span>
                      </div>
                    ))}
                    {allocTotal !== 100 && (
                      <p className="text-xs text-amber-600">
                        Mix totals {allocTotal}% — weights are normalized, but aim for 100%.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Taxable investments */}
            <div className="rounded-3xl border bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Investment account</h2>
                <span className="text-sm font-semibold">{fmtUSD0(invMonthly)}/mo</span>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Brokerage / IRA money outside the TSP — e.g. an S&amp;P 500 index fund.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                <span className="text-gray-600">Balance</span>
                <div className="field flex items-center rounded-lg px-2 py-1">
                  <span className="text-gray-500">$</span>
                  <input
                    type="number"
                    min={0}
                    step={500}
                    value={invBalance === 0 ? "" : invBalance}
                    placeholder="0"
                    onChange={(e) => setInvBalance(Math.max(0, num(e.target.value)))}
                    className="w-24 bg-transparent text-right outline-none"
                    aria-label="Current investment balance"
                  />
                </div>
                <span className="text-gray-600">adding</span>
                <div className="field flex items-center rounded-lg px-2 py-1">
                  <span className="text-gray-500">$</span>
                  <input
                    type="number"
                    min={0}
                    step={25}
                    value={invMonthly === 0 ? "" : invMonthly}
                    placeholder="0"
                    onChange={(e) => setInvMonthly(Math.max(0, num(e.target.value)))}
                    className="w-20 bg-transparent text-right outline-none"
                    aria-label="Monthly investment contribution"
                  />
                </div>
                <span className="text-gray-600">/mo at</span>
                <input
                  type="number"
                  min={-20}
                  max={30}
                  step={0.5}
                  value={invReturnPct}
                  onChange={(e) => setInvReturnPct(num(e.target.value))}
                  className={pctInput}
                  aria-label="Assumed investment annual return percent"
                />
                <span className="text-gray-600">%/yr</span>
              </div>
              <p className="mt-2 text-xs text-gray-500">
                {PERF.otherAssets.sp500LongRunPct}% ≈ the S&amp;P 500&apos;s long-run average with
                dividends, before inflation. Any given 5-year stretch can be far above or below it.
              </p>
            </div>

            {/* Savings */}
            <div className="rounded-3xl border bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Savings</h2>
                <span className="text-sm font-semibold">{fmtUSD0(savMonthly)}/mo</span>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Emergency fund and short-term goals in a high-yield savings account.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                <span className="text-gray-600">Balance</span>
                <div className="field flex items-center rounded-lg px-2 py-1">
                  <span className="text-gray-500">$</span>
                  <input
                    type="number"
                    min={0}
                    step={250}
                    value={savBalance === 0 ? "" : savBalance}
                    placeholder="0"
                    onChange={(e) => setSavBalance(Math.max(0, num(e.target.value)))}
                    className="w-24 bg-transparent text-right outline-none"
                    aria-label="Current savings balance"
                  />
                </div>
                <span className="text-gray-600">adding</span>
                <div className="field flex items-center rounded-lg px-2 py-1">
                  <span className="text-gray-500">$</span>
                  <input
                    type="number"
                    min={0}
                    step={25}
                    value={savMonthly === 0 ? "" : savMonthly}
                    placeholder="0"
                    onChange={(e) => setSavMonthly(Math.max(0, num(e.target.value)))}
                    className="w-20 bg-transparent text-right outline-none"
                    aria-label="Monthly savings contribution"
                  />
                </div>
                <span className="text-gray-600">/mo at</span>
                <input
                  type="number"
                  min={0}
                  max={15}
                  step={0.1}
                  value={savApyPct}
                  onChange={(e) => setSavApyPct(Math.max(0, num(e.target.value)))}
                  className={pctInput}
                  aria-label="Savings APY percent"
                />
                <span className="text-gray-600">% APY</span>
              </div>
            </div>
          </section>

          {/* ------------------------------ Results ------------------------------ */}
          <section className="space-y-6 lg:self-start">
            <div className="rounded-3xl border bg-white p-6 shadow-sm md:p-8">
              <div className="text-sm text-gray-600">
                Projected net worth (these accounts) by {endYear}
              </div>
              <div className="mt-2 text-4xl font-bold tracking-tight">
                {fmtUSD0(projection.final.total)}
              </div>
              <div className="mt-1 text-sm text-gray-600">
                ≈ {fmtUSD0(projection.final.realTotal)} in today&apos;s dollars ·{" "}
                {fmtUSD0(projection.totalContributions)} put in +{" "}
                {fmtUSD0(Math.max(0, projection.totalGrowth))} growth
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                {(["tsp", "invest", "savings"] as const).map((k) => {
                  const label = k === "tsp" ? "TSP" : k === "invest" ? "Investments" : "Savings";
                  return (
                    <span
                      key={k}
                      className="rounded-full border px-2.5 py-1 font-medium"
                      style={{ color: CHART_COLORS[k], borderColor: `${CHART_COLORS[k]}66` }}
                    >
                      {label} {fmtUSD0(projection.final.balances[k] ?? 0)}
                    </span>
                  );
                })}
              </div>

              <div className="mt-5 overflow-hidden rounded-2xl border">
                <StackedAreaChart
                  projection={projection}
                  startTotal={startTotal}
                  startBalances={Object.fromEntries(
                    accounts.map((a) => [a.key, Math.max(0, a.startBalance)])
                  )}
                  startYear={startYear}
                />
              </div>
            </div>

            {/* Insights */}
            <div className="rounded-3xl border bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold">What this says</h2>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-gray-600">
                {brs && agencyTotal > 0 && (
                  <li>
                    The BRS match adds <strong>{fmtUSD0(agencyTotal)}</strong> of agency money over{" "}
                    {years} year{years === 1 ? "" : "s"}
                    {" before any growth — that's pay you only get by contributing."}
                  </li>
                )}
                <li>
                  Of your projected {fmtUSD0(projection.final.total)}, growth does{" "}
                  <strong>
                    {projection.final.total > 0
                      ? Math.round(
                          (Math.max(0, projection.totalGrowth) / projection.final.total) * 100
                        )
                      : 0}
                    %
                  </strong>{" "}
                  of the work. The earlier the dollars go in, the harder they work.
                </li>
                {doubling !== null && (
                  <li>
                    At your blended TSP return of {(tspReturn * 100).toFixed(1)}%/yr, money doubles
                    roughly every <strong>{doubling.toFixed(0)} years</strong> (Rule of 72) — TSP
                    dollars kept invested after separation keep compounding.
                  </li>
                )}
                <li>
                  Staying <strong>3 more years</strong> (through {endYear + 3}) at this pace ends
                  near <strong>{fmtUSD0(extended.final.total)}</strong> — a difference of{" "}
                  {fmtUSD0(extended.final.total - projection.final.total)}. Useful context for
                  reenlistment or separation planning.
                </li>
                {savApyPct < inflationPct && savMonthly + savBalance > 0 && (
                  <li>
                    Your savings APY ({savApyPct}%) is below your inflation assumption (
                    {inflationPct}%), so cash slowly loses buying power — keep the emergency fund
                    there, but think hard before parking long-term money in cash.
                  </li>
                )}
              </ul>
            </div>

            {/* Year-by-year table */}
            <div className="rounded-3xl border bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold">Year by year</h2>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[560px] text-right text-sm">
                  <thead>
                    <tr className="border-b text-xs text-gray-500">
                      <th className="py-2 text-left font-medium">Year</th>
                      <th className="py-2 font-medium">TSP</th>
                      <th className="py-2 font-medium">Investments</th>
                      <th className="py-2 font-medium">Savings</th>
                      <th className="py-2 font-medium">Total</th>
                      <th className="py-2 font-medium">Today&apos;s $</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projection.years.map((s) => (
                      <tr
                        key={s.yearIndex}
                        className={`border-b last:border-0 ${
                          s.yearIndex === years ? "font-semibold" : ""
                        }`}
                      >
                        <td className="py-1.5 text-left">
                          {startYear + s.yearIndex}
                          {s.yearIndex === years && (
                            <span className="ml-1 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                              end of commitment
                            </span>
                          )}
                        </td>
                        <td className="py-1.5">{fmtUSD0(s.balances.tsp ?? 0)}</td>
                        <td className="py-1.5">{fmtUSD0(s.balances.invest ?? 0)}</td>
                        <td className="py-1.5">{fmtUSD0(s.balances.savings ?? 0)}</td>
                        <td className="py-1.5">{fmtUSD0(s.total)}</td>
                        <td className="py-1.5 text-gray-500">{fmtUSD0(s.realTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Assumptions & sources */}
            <div className="rounded-3xl border bg-gray-50 p-5 text-xs leading-5 text-gray-600">
              <h2 className="text-sm font-semibold text-gray-800">Assumptions &amp; data</h2>
              <p className="mt-2">
                TSP fund return presets are compound annual returns through{" "}
                {PERF.asOf.slice(0, 4)} (long-run figures are index-backfilled to 1987–88; verify
                at{" "}
                <a
                  href="https://www.tsp.gov/fund-performance/"
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-2"
                >
                  tsp.gov/fund-performance
                </a>
                ). Recent calendar years, for scale:
              </p>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[420px] text-right">
                  <thead>
                    <tr className="border-b text-[11px] text-gray-500">
                      <th className="py-1 text-left font-medium">Fund</th>
                      {Object.keys(PERF.calendarReturnsPct).map((y) => (
                        <th key={y} className="py-1 font-medium">
                          {y}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {TSP_FUNDS.map((f) => (
                      <tr key={f.key} className="border-b last:border-0">
                        <td className="py-1 text-left font-medium">{f.name}</td>
                        {Object.entries(PERF.calendarReturnsPct).map(([y, row]) => (
                          <td
                            key={y}
                            className="py-1"
                            style={{ color: row[f.key] < 0 ? "#b91c1c" : undefined }}
                          >
                            {row[f.key].toFixed(1)}%
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2">
                Projections compound monthly at your assumed rates with steady contributions; real
                results arrive unevenly (see 2022 above). Taxes on the investment account,
                contribution-limit changes, and pay raises are not modeled. Not affiliated with the
                FRTIB or tsp.gov. Pair this with the{" "}
                <Link href="/toolkits/retirement-tsp" className="underline underline-offset-2">
                  TSP &amp; Retirement toolkit
                </Link>{" "}
                and the{" "}
                <Link href="/budget" className="underline underline-offset-2">
                  Budget Builder
                </Link>
                .
              </p>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

// ---------------------------------------------------------------------------
// Stacked area chart: TSP + investments + savings by year, with a dashed
// today's-dollars total line. Self-contained SVG, no external deps.
// ---------------------------------------------------------------------------
function StackedAreaChart({
  projection,
  startTotal,
  startBalances,
  startYear,
}: {
  projection: ReturnType<typeof projectWealth>;
  startTotal: number;
  startBalances: Record<string, number>;
  startYear: number;
}) {
  const W = 920;
  const H = 380;
  const ML = 68;
  const MR = 20;
  const MT = 20;
  const MB = 36;

  const points = [
    { yearIndex: 0, balances: startBalances, total: startTotal, realTotal: startTotal },
    ...projection.years,
  ];
  const n = points.length - 1;
  const maxTotal = Math.max(1, ...points.map((p) => p.total));

  const x = (i: number) => ML + (i / Math.max(1, n)) * (W - ML - MR);
  const y = (v: number) => MT + (1 - v / maxTotal) * (H - MT - MB);

  // Stack order: TSP (bottom), investments, savings (top).
  const keys = ["tsp", "invest", "savings"] as const;
  const stacked = points.map((p) => {
    let acc = 0;
    const levels: Record<string, { from: number; to: number }> = {};
    for (const k of keys) {
      const v = p.balances[k] ?? 0;
      levels[k] = { from: acc, to: acc + v };
      acc += v;
    }
    return levels;
  });

  function areaPath(key: (typeof keys)[number]) {
    const top = stacked.map((s, i) => `${x(i).toFixed(1)},${y(s[key].to).toFixed(1)}`);
    const bottom = stacked
      .map((s, i) => `${x(i).toFixed(1)},${y(s[key].from).toFixed(1)}`)
      .reverse();
    return `M${top.join("L")}L${bottom.join("L")}Z`;
  }

  const realLine = points
    .map((p, i) => `${x(i).toFixed(1)},${y(p.realTotal).toFixed(1)}`)
    .join("L");

  // ~4 horizontal gridlines at round values.
  const step = niceStep(maxTotal / 4);
  const gridVals: number[] = [];
  for (let v = step; v <= maxTotal; v += step) gridVals.push(v);

  // Label every year up to 8 points, then every other/steps.
  const labelEvery = n <= 8 ? 1 : n <= 16 ? 2 : 5;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="Projected balances by year, stacked by account"
      className="block w-full"
    >
      <rect width={W} height={H} fill="white" />
      {gridVals.map((v) => (
        <g key={v}>
          <line x1={ML} x2={W - MR} y1={y(v)} y2={y(v)} stroke="#e5e7eb" strokeWidth={1} />
          <text x={ML - 8} y={y(v) + 4} textAnchor="end" fontSize={12} fill="#6b7280">
            {compactUSD(v)}
          </text>
        </g>
      ))}
      {(["savings", "invest", "tsp"] as const).map((k) => (
        <path key={k} d={areaPath(k)} fill={CHART_COLORS[k]} fillOpacity={0.75} />
      ))}
      <path
        d={`M${realLine}`}
        fill="none"
        stroke="#374151"
        strokeWidth={2}
        strokeDasharray="6 4"
      />
      {points.map((p, i) =>
        i % labelEvery === 0 || i === n ? (
          <text
            key={i}
            x={x(i)}
            y={H - 12}
            textAnchor="middle"
            fontSize={12}
            fill="#6b7280"
          >
            {startYear + p.yearIndex}
          </text>
        ) : null
      )}
      {/* Legend */}
      <g transform={`translate(${ML + 8}, ${MT + 4})`} fontSize={12}>
        {(
          [
            ["tsp", "TSP"],
            ["invest", "Investments"],
            ["savings", "Savings"],
          ] as const
        ).map(([k, label], i) => (
          <g key={k} transform={`translate(${i * 110}, 0)`}>
            <rect width={10} height={10} y={2} rx={2} fill={CHART_COLORS[k]} fillOpacity={0.8} />
            <text x={14} y={11} fill="#374151">
              {label}
            </text>
          </g>
        ))}
        <g transform="translate(330, 0)">
          <line x1={0} x2={18} y1={7} y2={7} stroke="#374151" strokeWidth={2} strokeDasharray="6 4" />
          <text x={22} y={11} fill="#374151">
            Total in today&apos;s dollars
          </text>
        </g>
      </g>
    </svg>
  );
}

function niceStep(raw: number): number {
  const mag = Math.pow(10, Math.floor(Math.log10(Math.max(1, raw))));
  const norm = raw / mag;
  const nice = norm >= 5 ? 5 : norm >= 2 ? 2.5 : norm >= 1 ? 2 : 1;
  return nice * mag;
}

function compactUSD(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${Math.round(v / 1_000)}k`;
  return `$${Math.round(v)}`;
}
