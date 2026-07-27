// Budget Builder → Wealth Projector hand-off.
//
// Turns the saved budget (localStorage, read by the caller) into a list of
// assignable monthly-contribution candidates: savings-type categories, any
// row the user wants to redirect, and the unallocated leftover. Pure logic —
// the projector UI owns the actual assignment state.

import { classifyLabel } from "@/lib/budget/coach";
import type { BudgetItem } from "@/lib/sankey/model";

export type ContributionDestination = "savings" | "invest" | "skip";

export type ContributionCandidate = {
  id: string;
  label: string;
  monthly: number;
  kind: "expense" | "income" | "leftover";
  /** Default destination the UI starts from — every row stays reassignable. */
  suggested: ContributionDestination;
};

const INVEST_RE = /invest|brokerage|\bira\b|roth ira|529|index fund|stock/i;
const TSP_RE = /\btsp\b/i;
const DEBT_RE = /debt|loan/i;

/**
 * Suggest where a budget row's dollars should flow in the projector.
 *
 * TSP-labeled rows are skipped (the projector models TSP from % of base pay —
 * counting the row too would double it). Debt rows are skipped: payments
 * reduce liabilities rather than fill these accounts. Investment-ish labels
 * go to the investment account; everything else the coach calls savings goes
 * to savings; remaining rows default to skip.
 */
export function suggestDestination(label: string): ContributionDestination {
  if (TSP_RE.test(label)) return "skip";
  if (DEBT_RE.test(label)) return "skip";
  if (INVEST_RE.test(label)) return "invest";
  if (classifyLabel(label) === "savings") return "savings";
  return "skip";
}

export type SavedBudgetLike = {
  income?: Array<Partial<BudgetItem>>;
  expenses?: Array<Partial<BudgetItem>>;
  tspPct?: number;
  tspBaseId?: string;
  iraEnabled?: boolean;
  iraMonthly?: number;
};

/** Coerce best-effort stored rows into well-formed budget items. */
function rows(list: Array<Partial<BudgetItem>> | undefined): BudgetItem[] {
  if (!Array.isArray(list)) return [];
  return list.map((r, i) => ({
    id: typeof r?.id === "string" ? r.id : `row-${i}`,
    label: typeof r?.label === "string" ? r.label : "",
    amount: typeof r?.amount === "number" && Number.isFinite(r.amount) ? r.amount : 0,
  }));
}

/** Positive-amount sum, mirroring how the Budget Builder totals rows. */
function total(list: BudgetItem[]): number {
  return list.reduce((a, r) => a + (r.amount > 0 ? r.amount : 0), 0);
}

/**
 * Build the candidate list from a saved budget: every expense and income row
 * (amount > 0) plus a synthetic "Unallocated leftover" row when income
 * exceeds expenses + the percentage-based TSP contribution.
 */
export function budgetContributionCandidates(
  saved: SavedBudgetLike | null
): ContributionCandidate[] {
  if (!saved) return [];
  const income = rows(saved.income);
  const expenses = rows(saved.expenses);

  const candidates: ContributionCandidate[] = [
    ...expenses
      .filter((r) => r.amount > 0)
      .map((r) => ({
        id: r.id,
        label: r.label || "Expense",
        monthly: r.amount,
        kind: "expense" as const,
        suggested: suggestDestination(r.label || ""),
      })),
    ...income
      .filter((r) => r.amount > 0)
      .map((r) => ({
        id: `income:${r.id}`,
        label: `${r.label || "Income"} (income)`,
        monthly: r.amount,
        kind: "income" as const,
        // Income rows fund spending by default; assigning one is opt-in.
        suggested: "skip" as const,
      })),
  ];

  const baseRow =
    income.find((r) => r.id === saved.tspBaseId) ?? income.find((r) => /base/i.test(r.label));
  const tspMonthly =
    Math.max(0, saved.tspPct ?? 0) * Math.max(0, baseRow?.amount ?? income[0]?.amount ?? 0);
  // The budget's percentage-TSP and IRA contributions already leave the
  // spendable pool, so they come out of the leftover too (the IRA itself is
  // modeled as its own account in the projector, prefilled from the budget).
  const iraMonthly = saved.iraEnabled ? Math.max(0, saved.iraMonthly ?? 0) : 0;
  const leftover = total(income) - total(expenses) - tspMonthly - iraMonthly;
  if (leftover > 0.5) {
    candidates.push({
      id: "leftover",
      label: "Unallocated leftover",
      monthly: Math.round(leftover),
      kind: "leftover",
      suggested: "savings",
    });
  }

  return candidates;
}

/** Sum assigned candidates into the projector's monthly contribution inputs. */
export function applyAssignments(
  candidates: ContributionCandidate[],
  assignments: Record<string, ContributionDestination>
): { savingsMonthly: number; investMonthly: number } {
  let savingsMonthly = 0;
  let investMonthly = 0;
  for (const c of candidates) {
    const dest = assignments[c.id] ?? c.suggested;
    if (dest === "savings") savingsMonthly += c.monthly;
    else if (dest === "invest") investMonthly += c.monthly;
  }
  return { savingsMonthly: Math.round(savingsMonthly), investMonthly: Math.round(investMonthly) };
}
