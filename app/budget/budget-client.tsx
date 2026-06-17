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
function loadSaved(): { income: BudgetItem[]; expenses: BudgetItem[] } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const income = Array.isArray(parsed?.income) ? parsed.income : null;
    const expenses = Array.isArray(parsed?.expenses) ? parsed.expenses : null;
    if (!income || !expenses) return null;
    return { income, expenses };
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

  // Render the interactive UI only on the client so theme colors and any
  // device-saved budget match between hydration and the live DOM.
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);

  const colors = useThemeColors();
  const svgRef = useRef<SVGSVGElement>(null);
  const idCounter = useRef(1000);

  // Resolve the catch-all category against the rows that actually exist.
  const captureExists = expenses.some((e) => e.id === captureInto);
  const captureId = captureExists ? captureInto : null;

  const graph = useMemo(
    () =>
      buildBudgetGraph(income, expenses, {
        poolColor: colors.muted,
        poolLabel: "Total Income",
        absorbRemainderInto: captureId,
      }),
    [income, expenses, colors.muted, captureId]
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
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ income, expenses }));
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
                <span className="text-sm font-semibold">{fmtUSD0(graph.totalExpense)}</span>
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
