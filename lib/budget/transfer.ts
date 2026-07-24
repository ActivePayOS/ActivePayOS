// lib/budget/transfer.ts
//
// Hand-off bridge between the Pay Calculator and the Budget Builder.
//
// Both tools are separate client routes with their own state, and the whole app
// is privacy-first ("runs entirely in your browser — nothing sent to a server").
// So the transfer is a small JSON payload the Pay Calculator stashes in
// localStorage; the Budget Builder reads it on mount and offers to import it.
// Nothing here touches the network.

import type { BudgetItem } from "@/lib/sankey/model";

const TRANSFER_KEY = "activepayos:pay-transfer:v1";

/** How the imported income is broken out in the budget. */
export type TransferMode = "combined" | "bysource";

type PayTransferSpecial = { label: string; monthly: number };

export type PayTransfer = {
  v: 1;
  generatedOn: string; // YYYY-MM-DD

  // Context carried over for the combined export / display.
  meta: {
    year: number;
    grade: string;
    yosLabel: string;
    location: string; // duty ZIP, or a "no BAH" note
    dependents: boolean;
    stateOfLegalResidence: string;
    receivesBah: boolean;
  };

  // Gross monthly income components.
  income: {
    base: number;
    bah: number;
    bas: number;
    specials: PayTransferSpecial[];
  };

  // Monthly deductions from the take-home estimate. Modeled as budget expense
  // rows so the budget's leftover equals true spendable income.
  deductions: {
    federal: number;
    state: number;
    fica: number;
    sgli: number;
    tsp: number;
    tspPct: number; // decimal, of base pay
    tspType: "traditional" | "roth";
  };

  grossMonthly: number;
  takeHomeMonthly: number;
};

function isTransfer(x: unknown): x is PayTransfer {
  if (!x || typeof x !== "object") return false;
  const t = x as Partial<PayTransfer>;
  return (
    t.v === 1 &&
    !!t.meta &&
    !!t.income &&
    !!t.deductions &&
    typeof t.income.base === "number"
  );
}

export function saveTransfer(t: PayTransfer): boolean {
  if (typeof window === "undefined") return false;
  try {
    localStorage.setItem(TRANSFER_KEY, JSON.stringify(t));
    return true;
  } catch {
    return false;
  }
}

export function loadTransfer(): PayTransfer | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(TRANSFER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isTransfer(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function clearTransfer() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(TRANSFER_KEY);
  } catch {
    // ignore
  }
}

const round0 = (n: number) => Math.max(0, Math.round(n));

/**
 * Turn a pay transfer into ready-to-use budget rows.
 *
 * Income granularity is controlled by `mode`:
 *   - "combined"  → a single "Military pay (gross)" income row
 *   - "bysource"  → Base Pay, BAH, BAS, and each special pay as its own row
 *
 * In BOTH modes the deductions (federal/state tax, FICA, TSP, SGLI) become
 * expense rows so the budget nets down to take-home. Housing and Groceries are
 * seeded from BAH/BAS as editable starting points; other living categories are
 * left at $0 for the user to fill.
 */
export function buildBudgetFromTransfer(
  t: PayTransfer,
  mode: TransferMode
): { income: BudgetItem[]; expenses: BudgetItem[] } {
  const { income: inc, deductions: d } = t;

  const income: BudgetItem[] =
    mode === "combined"
      ? [{ id: "t-inc-gross", label: "Military pay (gross)", amount: round0(t.grossMonthly) }]
      : [
          { id: "t-inc-base", label: "Base Pay", amount: round0(inc.base) },
          ...(inc.bah > 0
            ? [{ id: "t-inc-bah", label: "BAH", amount: round0(inc.bah) }]
            : []),
          ...(inc.bas > 0
            ? [{ id: "t-inc-bas", label: "BAS", amount: round0(inc.bas) }]
            : []),
          ...inc.specials
            .filter((s) => s.monthly > 0)
            .map((s, i) => ({
              id: `t-inc-sp-${i}`,
              label: s.label || "Special pay",
              amount: round0(s.monthly),
            })),
        ];

  // Living-expense starting points: allowances spent on their purpose, plus
  // common empty categories the member can fill in.
  const living: BudgetItem[] = [
    ...(inc.bah > 0
      ? [{ id: "t-exp-housing", label: "Housing", amount: round0(inc.bah) }]
      : [{ id: "t-exp-housing", label: "Housing", amount: 0 }]),
    ...(inc.bas > 0
      ? [{ id: "t-exp-food", label: "Groceries", amount: round0(inc.bas) }]
      : [{ id: "t-exp-food", label: "Groceries", amount: 0 }]),
    { id: "t-exp-transport", label: "Transportation", amount: 0 },
    { id: "t-exp-utilities", label: "Utilities", amount: 0 },
    { id: "t-exp-insurance", label: "Insurance", amount: 0 },
    { id: "t-exp-fun", label: "Fun money", amount: 0 },
  ];

  // Deduction rows — kept together at the end so they read as "off the top."
  const deductions: BudgetItem[] = [
    { id: "t-exp-federal", label: "Federal tax", amount: round0(d.federal) },
    ...(d.state > 0
      ? [{ id: "t-exp-state", label: "State tax", amount: round0(d.state) }]
      : []),
    { id: "t-exp-fica", label: "FICA (Social Security + Medicare)", amount: round0(d.fica) },
    ...(d.tsp > 0
      ? [
          {
            id: "t-exp-tsp",
            label: `TSP (${Math.round(d.tspPct * 100)}% ${d.tspType})`,
            amount: round0(d.tsp),
          },
        ]
      : []),
    ...(d.sgli > 0
      ? [{ id: "t-exp-sgli", label: "SGLI", amount: round0(d.sgli) }]
      : []),
  ];

  return { income, expenses: [...living, ...deductions] };
}
