// Tests for the shared summary-first overview builders.

import { describe, expect, it } from "vitest";
import { buildPaySummary } from "@/lib/export/summary";
import { payOverview, budgetOverview, projectionOverview } from "@/lib/export/overview";
import type { BudgetExport } from "@/lib/export/budget-summary";
import type { ProjectionExport } from "@/lib/export/projection";

const PAY = buildPaySummary({
  year: 2026,
  grade: "E-5",
  yosLabel: "Over 6",
  zip5: "22003",
  receivesBah: true,
  dependents: true,
  stateOfLegalResidence: "VA",
  baseMonthly: 4000,
  bahMonthly: 2500,
  basMonthly: 465,
  otherMonthly: 0,
  generatedOn: "2026-07-30",
});

describe("payOverview", () => {
  const items = payOverview(PAY);

  it("leads with the total and annualized figures", () => {
    expect(items[0].label).toBe("Total monthly pay");
    expect(items[0].value).toBe("$6,965.00");
    expect(items[1].label).toBe("Annual total");
    expect(items[1].value).toBe("$83,580.00");
  });

  it("calls out the tax-free allowances", () => {
    const allowances = items.find((i) => i.label.includes("Tax-free"));
    expect(allowances?.value).toBe("$2,965.00/mo");
  });

  it("explains every item", () => {
    for (const i of items) expect(i.explanation.length).toBeGreaterThan(10);
  });
});

const BUDGET: BudgetExport = {
  generatedOn: "2026-07-30",
  income: [{ label: "Base Pay", monthly: 4000 }],
  expenses: [
    { label: "Housing", monthly: 1800 },
    { label: "Groceries", monthly: 600 },
  ],
  totalIncome: 4000,
  totalExpense: 2400,
  leftover: 1600,
};

describe("budgetOverview", () => {
  it("leads with the leftover", () => {
    const items = budgetOverview(BUDGET);
    expect(items[0].label).toBe("Leftover (income - expenses)");
    expect(items[0].value).toContain("$1,600.00/mo");
    expect(items.find((i) => i.label === "Share of income unspent")?.value).toBe("40%");
  });

  it("flips to Overspent when expenses exceed income", () => {
    const items = budgetOverview({ ...BUDGET, totalExpense: 5000, leftover: -1000 });
    expect(items[0].label).toBe("Overspent");
    expect(items[0].value).toContain("$1,000.00/mo");
    expect(items[0].explanation).toContain("exceed");
  });
});

const PROJECTION: ProjectionExport = {
  generatedOn: "2026-07-30",
  scenario: {
    branchLabel: "Marine Corps",
    track: "enlisted",
    grade: "E-5",
    yos: 6,
    currentAge: 22,
    serviceYears: 5,
    projectionYears: 38,
    endYear: 2064,
    tspPct: 0.05,
    brs: true,
    tspReturnPct: 9.7,
    invReturnPct: 10,
    savApyPct: 3.8,
    inflationPct: 2.5,
    payRaisePct: 2,
    modelPromotions: true,
  },
  promotions: [],
  years: [],
  totals: {
    final: 1573414,
    finalReal: 615653,
    atSeparation: 64349,
    separationYear: 2031,
    contributed: 237956,
    growth: 1335458,
    agencyMatch: 13042,
    employeeTsp: 21000,
  },
  fees: {
    tspExpenseRatioPct: 0.05,
    iraExpenseRatioPct: null,
    estimatedFeeDrag: 8000,
    notes: [],
  },
  rothTradeoff: {
    monthlyContribution: 400,
    yearsContributing: 5,
    yearsToWithdrawal: 38,
    annualReturnPct: 9.7,
    taxRateNowPct: 12,
    taxRateAtWithdrawalPct: 12,
    preTaxBalance: 100000,
    taxPaidUpFront: 3000,
    deferredTaxBill: 12000,
    rothAfterTax: 97000,
    tradAfterTax: 88000,
    winner: "roth",
    advantage: 9000,
  },
};

describe("projectionOverview", () => {
  const items = projectionOverview(PROJECTION);

  it("leads with the projected total and today's-dollar figure", () => {
    expect(items[0].label).toBe("Projected total (2064)");
    expect(items[0].value).toBe("$1,573,414.00");
    expect(items[1].label).toBe("In today's dollars");
  });

  it("includes separation, employee TSP, fee drag, and the Roth verdict", () => {
    const labels = items.map((i) => i.label);
    expect(labels).toContain("At separation (2031)");
    expect(labels).toContain("Your TSP contributions while serving");
    expect(labels).toContain("Estimated fee drag");
    const roth = items.find((i) => i.label === "Roth vs Traditional");
    expect(roth?.value).toContain("Roth ahead by ~$9,000.00");
  });

  it("omits optional items when the sections are absent", () => {
    const bare = projectionOverview({
      ...PROJECTION,
      totals: { ...PROJECTION.totals, atSeparation: null, separationYear: null, employeeTsp: undefined },
      fees: undefined,
      rothTradeoff: undefined,
    });
    const labels = bare.map((i) => i.label);
    expect(labels).not.toContain("At separation (2031)");
    expect(labels).not.toContain("Estimated fee drag");
    expect(labels).not.toContain("Roth vs Traditional");
  });
});
