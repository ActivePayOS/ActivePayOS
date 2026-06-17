// Shared Sankey graph model.
//
// Turns budget rows (or generic inflows/outflows) into the {nodes, links} graph
// the SVG renderer draws. Keeping this separate keeps the renderer dumb.
//
// Privacy note: this module is pure math. It takes the numbers the user typed
// and returns a graph. Nothing here touches the network, storage, or any API.

export type BudgetItem = {
  id: string;
  label: string;
  amount: number;
};

export type SankeyNodeKind = "income" | "pool" | "expense" | "surplus" | "shortfall";

export type SankeyNodeInput = {
  id: string;
  label: string;
  /** 0 = income (left), 1 = pool (center), 2 = expense (right). */
  column: 0 | 1 | 2;
  value: number;
  color: string;
  kind: SankeyNodeKind;
};

export type SankeyLinkInput = {
  source: string; // node id
  target: string; // node id
  value: number;
  color: string;
};

export type SankeyGraph = {
  nodes: SankeyNodeInput[];
  links: SankeyLinkInput[];
  totalIncome: number;
  totalExpense: number;
  /** income - expense; positive = surplus, negative = overspend. */
  leftover: number;
};

export const POOL_ID = "__pool__";
export const SURPLUS_ID = "out:__surplus__";
export const SHORTFALL_ID = "in:__shortfall__";

// A categorical palette tuned to read well on both the light and dark themes
// (roughly Tailwind 500 weights). Income and expense rows draw from the same
// pool so colors stay distinct across the whole chart.
export const CATEGORY_PALETTE = [
  "#3b82f6", // blue
  "#10b981", // emerald
  "#f59e0b", // amber
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#f97316", // orange
  "#84cc16", // lime
  "#e11d48", // rose
  "#14b8a6", // teal
  "#a855f7", // purple
  "#eab308", // yellow
];

export const SURPLUS_COLOR = "#22c55e";
export const SHORTFALL_COLOR = "#ef4444";

const usd2 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});
const usd0 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function fmtUSD(n: number | null | undefined) {
  return typeof n === "number" && Number.isFinite(n) ? usd2.format(n) : "-";
}

export function fmtUSD0(n: number | null | undefined) {
  return typeof n === "number" && Number.isFinite(n) ? usd0.format(n) : "-";
}

function sum(items: BudgetItem[]) {
  return items.reduce((a, x) => a + (Number.isFinite(x.amount) ? Math.max(0, x.amount) : 0), 0);
}

export type BuildOptions = {
  /** Center "pool" node color (usually a neutral theme color). */
  poolColor: string;
  poolLabel?: string;
  /**
   * Expense id to fold any positive remainder into. When set (and there is a
   * surplus), that category absorbs the leftover and the standalone
   * "Unallocated" node is omitted, so the budget is fully allocated.
   */
  absorbRemainderInto?: string | null;
};

/**
 * Convert the editable income/expense rows into a balanced 3-column Sankey.
 *
 * The graph always balances (sum of inflows === pool === sum of outflows):
 *  - a surplus becomes an "Unallocated" green outflow,
 *  - an overspend becomes a red "Shortfall" inflow,
 * so the ribbons never overflow their nodes and the imbalance is visible.
 */
export function buildBudgetGraph(
  income: BudgetItem[],
  expenses: BudgetItem[],
  opts: BuildOptions
): SankeyGraph {
  const totalIncome = sum(income);
  const totalExpense = sum(expenses);
  const leftover = totalIncome - totalExpense;
  const poolValue = Math.max(totalIncome, totalExpense);

  // Only fold the remainder into a category when there is a positive surplus.
  const captureId = opts.absorbRemainderInto && leftover > 0 ? opts.absorbRemainderInto : null;

  const nodes: SankeyNodeInput[] = [];
  const links: SankeyLinkInput[] = [];

  // --- Income column (left) --- (use the original index so a row keeps its
  // color even when another row drops to $0 and disappears)
  income.forEach((it, i) => {
    if (!(Number.isFinite(it.amount) && it.amount > 0)) return;
    nodes.push({
      id: `in:${it.id}`,
      label: it.label || "Income",
      column: 0,
      value: it.amount,
      color: CATEGORY_PALETTE[i % CATEGORY_PALETTE.length],
      kind: "income",
    });
  });
  if (leftover < 0) {
    nodes.push({
      id: SHORTFALL_ID,
      label: "Shortfall",
      column: 0,
      value: -leftover,
      color: SHORTFALL_COLOR,
      kind: "shortfall",
    });
  }

  // --- Pool (center) ---
  nodes.push({
    id: POOL_ID,
    label: opts.poolLabel ?? "Total Income",
    column: 1,
    value: poolValue,
    color: opts.poolColor,
    kind: "pool",
  });

  // --- Expense column (right) ---
  let absorbed = false;
  expenses.forEach((it, j) => {
    let value = Number.isFinite(it.amount) && it.amount > 0 ? it.amount : 0;
    if (captureId && it.id === captureId) {
      value += leftover; // fold the surplus into this category
      absorbed = true;
    }
    if (!(value > 0)) return;
    nodes.push({
      id: `out:${it.id}`,
      label: it.label || "Expense",
      column: 2,
      value,
      color: CATEGORY_PALETTE[(income.length + j) % CATEGORY_PALETTE.length],
      kind: "expense",
    });
  });
  // Show "Unallocated" only when there's a surplus we didn't fold into a category.
  if (leftover > 0 && !absorbed) {
    nodes.push({
      id: SURPLUS_ID,
      label: "Unallocated",
      column: 2,
      value: leftover,
      color: SURPLUS_COLOR,
      kind: "surplus",
    });
  }

  // --- Links: every inflow → pool, pool → every outflow ---
  for (const n of nodes) {
    if (n.column === 0) {
      links.push({ source: n.id, target: POOL_ID, value: n.value, color: n.color });
    } else if (n.column === 2) {
      links.push({ source: POOL_ID, target: n.id, value: n.value, color: n.color });
    }
  }

  return { nodes, links, totalIncome, totalExpense, leftover };
}

export type FlowItem = { id: string; label: string; value: number; color: string };

/**
 * Generic inflow → pool → outflow Sankey with caller-chosen colors. Used by the
 * Pay Calculator's inflow chart (Base Pay / BAH / BAS → Monthly Pay →
 * take-home / FICA).
 */
export function buildFlowGraph(
  inflows: FlowItem[],
  outflows: FlowItem[],
  opts: { poolColor: string; poolLabel: string }
): SankeyGraph {
  const inf = inflows.filter((i) => Number.isFinite(i.value) && i.value > 0);
  const outf = outflows.filter((o) => Number.isFinite(o.value) && o.value > 0);
  const totalIncome = inf.reduce((a, x) => a + x.value, 0);
  const totalExpense = outf.reduce((a, x) => a + x.value, 0);
  const poolValue = Math.max(totalIncome, totalExpense);

  const nodes: SankeyNodeInput[] = [];
  const links: SankeyLinkInput[] = [];

  inf.forEach((it) =>
    nodes.push({ id: `in:${it.id}`, label: it.label, column: 0, value: it.value, color: it.color, kind: "income" })
  );
  nodes.push({ id: POOL_ID, label: opts.poolLabel, column: 1, value: poolValue, color: opts.poolColor, kind: "pool" });
  outf.forEach((it) =>
    nodes.push({ id: `out:${it.id}`, label: it.label, column: 2, value: it.value, color: it.color, kind: "expense" })
  );

  for (const n of nodes) {
    if (n.column === 0) links.push({ source: n.id, target: POOL_ID, value: n.value, color: n.color });
    else if (n.column === 2) links.push({ source: POOL_ID, target: n.id, value: n.value, color: n.color });
  }

  return { nodes, links, totalIncome, totalExpense, leftover: totalIncome - totalExpense };
}
