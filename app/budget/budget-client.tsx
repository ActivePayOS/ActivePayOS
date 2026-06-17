"use client";

import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import SankeySvg from "@/components/sankey/SankeySvg";
import { useThemeColors } from "@/components/sankey/useThemeColors";
import { downloadPng, downloadSvg } from "@/lib/sankey/export";
import {
  buildBudgetGraph,
  fmtUSD0,
  type BudgetItem,
} from "@/lib/sankey/model";
import {
  DEFAULT_FUND_ALLOCATION,
  TSP_ELECTIVE_DEFERRAL_LIMIT_2026,
  TSP_FUNDS,
  type FundAllocation,
} from "@/lib/pay/tsp";

const STORAGE_KEY = "activepayos:budget:v1";

// Hydration flag without an effect: getServerSnapshot returns false (SSR + the
// hydrating render), the client snapshot returns true, so we render the
// interactive UI only once we're safely on the client.
const emptySubscribe = () => () => {};

// Illustrative monthly defaults — the user edits everything.
const DEFAULT_INCOME: BudgetItem[] = [
  { id: "inc-1", label: "Base Pay", amount: 3826 },
  { id: "inc-2", label: "BAH", amount: 2100 },
  { id: "inc-3", label: "BAS", amount: 465 },
];
const DEFAULT_EXPENSES: BudgetItem[] = [
  { id: "exp-1", label: "Housing", amount: 1800 },
  { id: "exp-2", label: "Groceries", amount: 600 },
  { id: "exp-3", label: "Transportation", amount: 450 },
  { id: "exp-4", label: "Savings & TSP", amount: 750 },
  { id: "exp-5", label: "Debt payments", amount: 300 },
  { id: "exp-6", label: "Utilities", amount: 250 },
  { id: "exp-7", label: "Insurance", amount: 200 },
  { id: "exp-8", label: "Fun money", amount: 350 },
];

// One-time read of any budget the user previously saved on THIS device.
// Used as a lazy useState initializer so there is no setState-in-effect and no
// hydration mismatch (the interactive UI is gated behind `mounted`).
type SavedBudget = {
  income: BudgetItem[];
  expenses: BudgetItem[];
  tspPct?: number;
  tspBaseId?: string;
  fundAlloc?: FundAllocation;
};

function loadSaved(): SavedBudget | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const income = Array.isArray(parsed?.income) ? parsed.income : null;
    const expenses = Array.isArray(parsed?.expenses) ? parsed.expenses : null;
    if (!income || !expenses) return null;
    return {
      income,
      expenses,
      tspPct: typeof parsed.tspPct === "number" ? parsed.tspPct : undefined,
      tspBaseId: typeof parsed.tspBaseId === "string" ? parsed.tspBaseId : undefined,
      fundAlloc:
        parsed.fundAlloc && typeof parsed.fundAlloc === "object" ? parsed.fundAlloc : undefined,
    };
  } catch {
    return null;
  }
}

export default function BudgetClient() {
  const [income, setIncome] = useState<BudgetItem[]>(
    () => loadSaved()?.income ?? DEFAULT_INCOME
  );
  const [expenses, setExpenses] = useState<BudgetItem[]>(
    () => loadSaved()?.expenses ?? DEFAULT_EXPENSES
  );
  const [captureInto, setCaptureInto] = useState<string>("");
  const [savedNote, setSavedNote] = useState<string | null>(null);

  // TSP (retirement)
  const [tspPct, setTspPct] = useState<number>(() => loadSaved()?.tspPct ?? 0.05);
  const [tspBaseId, setTspBaseId] = useState<string>(() => loadSaved()?.tspBaseId ?? "inc-1");
  const [fundAlloc, setFundAlloc] = useState<FundAllocation>(
    () => loadSaved()?.fundAlloc ?? DEFAULT_FUND_ALLOCATION
  );
  const [showFunds, setShowFunds] = useState(false);

  // Render the interactive UI only on the client so theme colors and any
  // device-saved budget match between hydration and the live DOM.
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);

  const colors = useThemeColors();
  const svgRef = useRef<SVGSVGElement>(null);
  const idCounter = useRef(1000);

  // Resolve the catch-all category against the rows that actually exist.
  const captureExists = expenses.some((e) => e.id === captureInto);
  const captureId = captureExists ? captureInto : null;

  // TSP contribution: a % of a chosen income (most people know the %, not the $).
  const tspBase = income.find((i) => i.id === tspBaseId) ?? income[0];
  const tspMonthly = Math.max(0, tspBase?.amount ?? 0) * tspPct;
  const tspAnnual = tspMonthly * 12;
  const tspPctToMax =
    TSP_ELECTIVE_DEFERRAL_LIMIT_2026 > 0 ? tspAnnual / TSP_ELECTIVE_DEFERRAL_LIMIT_2026 : 0;
  const fundTotal = TSP_FUNDS.reduce((a, f) => a + (fundAlloc[f.key] || 0), 0);

  const visibleExpenseTotal = expenses.reduce((a, e) => a + (e.amount > 0 ? e.amount : 0), 0);

  // TSP flows through the Sankey as its own outflow when contributing.
  const expensesForGraph = useMemo<BudgetItem[]>(
    () =>
      tspMonthly > 0
        ? [...expenses, { id: "__tsp__", label: `TSP (${Math.round(tspPct * 100)}%)`, amount: tspMonthly }]
        : expenses,
    [expenses, tspMonthly, tspPct]
  );

  const graph = useMemo(
    () =>
      buildBudgetGraph(income, expensesForGraph, {
        poolColor: colors.muted,
        poolLabel: "Total Income",
        absorbRemainderInto: captureId,
      }),
    [income, expensesForGraph, colors.muted, captureId]
  );

  const leftover = graph.leftover;
  const captured = captureId !== null && leftover > 0;
  const capturedLabel = expenses.find((e) => e.id === captureId)?.label;

  function update(setter: typeof setIncome, id: string, patch: Partial<BudgetItem>) {
    setter((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }
  function add(setter: typeof setIncome, label: string) {
    idCounter.current += 1;
    setter((prev) => [...prev, { id: `row-${idCounter.current}`, label, amount: 0 }]);
  }
  function remove(setter: typeof setIncome, id: string) {
    setter((prev) => prev.filter((it) => it.id !== id));
  }

  function saveLocal() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ income, expenses, tspPct, tspBaseId, fundAlloc })
      );
      setSavedNote("Saved to this device.");
    } catch {
      setSavedNote("Couldn't save (storage blocked).");
    }
  }
  function clearLocal() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    setIncome(DEFAULT_INCOME);
    setExpenses(DEFAULT_EXPENSES);
    setCaptureInto("");
    setTspPct(0.05);
    setTspBaseId("inc-1");
    setFundAlloc(DEFAULT_FUND_ALLOCATION);
    setSavedNote("Cleared saved budget and reset to the example.");
  }

  function exportPng() {
    if (svgRef.current) downloadPng(svgRef.current, "activepayos_budget_sankey.png", 2, colors.card);
  }
  function exportSvg() {
    if (svgRef.current) downloadSvg(svgRef.current, "activepayos_budget_sankey.svg");
  }

  return (
    <main className="space-y-8">
      <header className="rounded-3xl border bg-white p-6 md:p-8 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Budget Builder</h1>
            <p className="mt-2 max-w-2xl text-sm text-gray-600">
              Build a monthly budget and watch the money flow as a Sankey diagram. Edit any row and
              the chart updates instantly, then export it as an image.
            </p>
          </div>
          <span
            className="w-fit rounded-full border bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700"
            title="Your numbers stay in your browser. Nothing is sent to a server."
          >
            🔒 Private — runs entirely in your browser
          </span>
        </div>
      </header>

      {!mounted ? (
        <div className="rounded-3xl border bg-white p-10 text-center text-sm text-gray-500 shadow-sm">
          Loading budget builder…
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
          {/* ------------------------------ Editor ------------------------------ */}
          <section className="space-y-6">
            <div className="rounded-3xl border bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Income</h2>
                <span className="text-sm font-semibold">{fmtUSD0(graph.totalIncome)}</span>
              </div>
              <div className="mt-4 space-y-2">
                {income.map((it) => (
                  <Row
                    key={it.id}
                    item={it}
                    onLabel={(label) => update(setIncome, it.id, { label })}
                    onAmount={(amount) => update(setIncome, it.id, { amount })}
                    onRemove={() => remove(setIncome, it.id)}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={() => add(setIncome, "New income")}
                className="mt-3 w-full rounded-xl border border-dashed px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900"
              >
                + Add income
              </button>
            </div>

            <div className="rounded-3xl border bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Expenses &amp; savings</h2>
                <span className="text-sm font-semibold">{fmtUSD0(visibleExpenseTotal)}</span>
              </div>
              <div className="mt-4 space-y-2">
                {expenses.map((it) => (
                  <Row
                    key={it.id}
                    item={it}
                    onLabel={(label) => update(setExpenses, it.id, { label })}
                    onAmount={(amount) => update(setExpenses, it.id, { amount })}
                    onRemove={() => remove(setExpenses, it.id)}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={() => add(setExpenses, "New expense")}
                className="mt-3 w-full rounded-xl border border-dashed px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900"
              >
                + Add expense
              </button>
            </div>

            {/* ------------------------------ TSP ------------------------------ */}
            <div className="rounded-3xl border bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">TSP (retirement)</h2>
                <span className="text-sm font-semibold">{fmtUSD0(tspMonthly)}/mo</span>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Most people know their TSP as a percent — enter it and we&apos;ll do the math. It
                flows through the chart as its own outflow.
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
                <span className="text-gray-600">Contribute</span>
                <div className="field flex items-center rounded-lg px-2 py-1">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={Math.round(tspPct * 100)}
                    onChange={(e) =>
                      setTspPct(Math.max(0, Math.min(100, Number(e.target.value) || 0)) / 100)
                    }
                    className="w-12 bg-transparent text-right outline-none"
                    aria-label="TSP percent"
                  />
                  <span className="text-gray-500">%</span>
                </div>
                <span className="text-gray-600">of</span>
                <select
                  value={tspBase?.id ?? ""}
                  onChange={(e) => setTspBaseId(e.target.value)}
                  className="field rounded-lg px-2 py-1"
                  aria-label="TSP base income"
                >
                  {income.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.label || "Income"}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mt-1 text-xs text-gray-500">
                ≈ {fmtUSD0(tspMonthly)}/mo · {fmtUSD0(tspAnnual)}/yr
              </div>

              {/* Annual limit progress */}
              <div className="mt-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-600">2026 annual limit</span>
                  <span className="text-gray-500">
                    {fmtUSD0(tspAnnual)} / {fmtUSD0(TSP_ELECTIVE_DEFERRAL_LIMIT_2026)}
                  </span>
                </div>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-gray-200">
                  <div
                    className="h-2 rounded-full"
                    style={{
                      width: `${Math.min(100, tspPctToMax * 100)}%`,
                      backgroundColor:
                        tspPctToMax > 1 ? "#ef4444" : tspPctToMax >= 0.95 ? "#f59e0b" : "#22c55e",
                    }}
                  />
                </div>
                <div
                  className="mt-1 text-xs font-medium"
                  style={{
                    color: tspPctToMax > 1 ? "#ef4444" : tspPctToMax >= 0.95 ? "#b45309" : "#15803d",
                  }}
                >
                  {tspAnnual <= 0
                    ? "Set a percentage to start contributing."
                    : tspPctToMax > 1
                    ? `Over the annual limit by ${fmtUSD0(
                        tspAnnual - TSP_ELECTIVE_DEFERRAL_LIMIT_2026
                      )} — payroll stops contributions once you hit the cap.`
                    : tspPctToMax >= 0.95
                    ? "You'll just about max out the annual limit — nice."
                    : `${fmtUSD0(TSP_ELECTIVE_DEFERRAL_LIMIT_2026 - tspAnnual)} (${Math.round(
                        (1 - tspPctToMax) * 100
                      )}%) left before you hit the limit.`}
                </div>
              </div>

              {/* Fund allocation (collapsible) */}
              <button
                type="button"
                onClick={() => setShowFunds((s) => !s)}
                className="mt-4 text-xs font-medium text-gray-600 underline underline-offset-2 hover:text-gray-900"
              >
                {showFunds ? "Hide" : "Show"} fund allocation
              </button>

              {showFunds && (
                <div className="mt-3 space-y-3">
                  <div className="flex h-3 w-full overflow-hidden rounded-full bg-gray-200">
                    {TSP_FUNDS.map((f) =>
                      (fundAlloc[f.key] || 0) > 0 ? (
                        <div
                          key={f.key}
                          style={{
                            width: `${fundTotal > 0 ? ((fundAlloc[f.key] || 0) / fundTotal) * 100 : 0}%`,
                            backgroundColor: f.color,
                          }}
                          title={`${f.name}: ${fundAlloc[f.key]}%`}
                        />
                      ) : null
                    )}
                  </div>
                  {fundTotal !== 100 && (
                    <p className="text-xs text-amber-600">
                      Allocations total {fundTotal}% — aim for 100%.
                    </p>
                  )}
                  <div className="space-y-2">
                    {TSP_FUNDS.map((f) => (
                      <div key={f.key} className="flex items-center gap-2 text-xs">
                        <span
                          className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: f.color }}
                        />
                        <span className="w-12 font-medium">{f.name}</span>
                        <div className="field flex items-center rounded-md px-1.5 py-0.5">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step={5}
                            value={fundAlloc[f.key] || 0}
                            onChange={(e) =>
                              setFundAlloc((prev) => ({
                                ...prev,
                                [f.key]: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                              }))
                            }
                            className="w-10 bg-transparent text-right outline-none"
                            aria-label={`${f.name} percent`}
                          />
                          <span className="text-gray-500">%</span>
                        </div>
                        <span className="text-gray-500">
                          {fmtUSD0((tspMonthly * (fundAlloc[f.key] || 0)) / 100)}/mo
                        </span>
                        <span className="hidden flex-1 text-gray-400 sm:block">{f.blurb}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500">
                    Prefer one-and-done? TSP Lifecycle (L) funds auto-diversify and rebalance toward a
                    target retirement date.
                  </p>
                </div>
              )}
            </div>

            <div className="rounded-3xl border bg-gray-50 p-5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Income − expenses</span>
                <span className="font-bold" style={{ color: leftover < 0 ? "#ef4444" : "#22c55e" }}>
                  {leftover < 0
                    ? `Overspent ${fmtUSD0(Math.abs(leftover))}`
                    : captured
                    ? `Captured ${fmtUSD0(leftover)} into ${capturedLabel || "category"}`
                    : `${fmtUSD0(leftover)} unallocated`}
                </span>
              </div>

              {/* Capture-the-remainder control */}
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <label htmlFor="capture-into" className="text-gray-600">
                  Put leftover into
                </label>
                <select
                  id="capture-into"
                  value={captureInto}
                  onChange={(e) => setCaptureInto(e.target.value)}
                  className="field rounded-lg px-2 py-1 text-xs"
                >
                  <option value="">Show as “Unallocated”</option>
                  {expenses.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.label || "Expense"}
                    </option>
                  ))}
                </select>
              </div>

              <p className="mt-2 text-xs text-gray-500">
                Tip: keep housing within your BAH and make savings automatic. Choose a category above
                to fold any leftover into it and fully allocate your budget.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={saveLocal}
                  className="rounded-full border px-3 py-1.5 text-xs font-medium hover:bg-gray-100"
                >
                  Save to this device
                </button>
                <button
                  type="button"
                  onClick={clearLocal}
                  className="rounded-full border px-3 py-1.5 text-xs font-medium hover:bg-gray-100"
                >
                  Clear &amp; reset
                </button>
              </div>
              {savedNote && <p className="mt-2 text-xs text-gray-500">{savedNote}</p>}
            </div>
          </section>

          {/* ------------------------------ Chart ------------------------------ */}
          <section className="rounded-3xl border bg-white p-5 md:p-6 shadow-sm">
            <div>
              <h2 className="text-lg font-semibold">Money flow</h2>
              <p className="mt-1 text-xs text-gray-500">
                Income on the left flows into your total, then out to each category. Edit any row to
                update it live.
              </p>
            </div>

            <div className="mt-5 overflow-hidden rounded-2xl border">
              <SankeySvg graph={graph} colors={colors} svgRef={svgRef} />
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={exportPng}
                className="rounded-full border border-black bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
              >
                Export PNG
              </button>
              <button
                type="button"
                onClick={exportSvg}
                className="rounded-full border px-4 py-2 text-sm font-medium hover:bg-gray-100"
              >
                Export SVG
              </button>
              <span className="text-xs text-gray-500">
                Generated in your browser — the image never leaves your device.
              </span>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function Row({
  item,
  onLabel,
  onAmount,
  onRemove,
}: {
  item: BudgetItem;
  onLabel: (v: string) => void;
  onAmount: (v: number) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={item.label}
        onChange={(e) => onLabel(e.target.value)}
        className="field min-w-0 flex-1 rounded-lg px-2.5 py-1.5 text-sm"
        aria-label="Label"
      />
      <div className="field flex items-center rounded-lg px-2 py-1.5">
        <span className="text-sm text-gray-500">$</span>
        <input
          type="number"
          min={0}
          step={10}
          value={item.amount === 0 ? "" : item.amount}
          placeholder="0"
          onChange={(e) => {
            const v = e.target.value === "" ? 0 : Number(e.target.value);
            onAmount(Number.isFinite(v) ? Math.max(0, v) : 0);
          }}
          className="w-20 bg-transparent text-right text-sm outline-none"
          aria-label="Amount"
        />
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="rounded-lg border px-2 py-1.5 text-sm text-gray-500 hover:text-gray-900"
        aria-label={`Remove ${item.label}`}
        title="Remove"
      >
        ✕
      </button>
    </div>
  );
}
