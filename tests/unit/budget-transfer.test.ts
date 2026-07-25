// Tests for the Pay Calculator → Budget Builder transfer bridge.

import { describe, expect, it } from "vitest";
import {
  buildBudgetFromTransfer,
  loadTransfer,
  saveTransfer,
  type PayTransfer,
} from "@/lib/budget/transfer";

const TRANSFER: PayTransfer = {
  v: 1,
  generatedOn: "2026-07-25",
  meta: {
    year: 2026,
    grade: "E-5",
    yosLabel: "8",
    location: "02139",
    dependents: false,
    stateOfLegalResidence: "MA",
    receivesBah: true,
  },
  income: {
    base: 4299.9,
    bah: 3615,
    bas: 476.95,
    specials: [
      { label: "Flight pay", monthly: 150.4 },
      { label: "Ignored", monthly: 0 },
    ],
  },
  deductions: {
    federal: 308.52,
    state: 120.2,
    fica: 328.94,
    sgli: 26,
    tsp: 214.99,
    tspPct: 0.05,
    tspType: "traditional",
  },
  grossMonthly: 8542.25,
  takeHomeMonthly: 7543.6,
};

describe("buildBudgetFromTransfer", () => {
  it("combined mode yields a single rounded gross income row", () => {
    const { income } = buildBudgetFromTransfer(TRANSFER, "combined");
    expect(income).toEqual([
      { id: "t-inc-gross", label: "Military pay (gross)", amount: 8542 },
    ]);
  });

  it("bysource mode breaks out base/BAH/BAS and positive special pays", () => {
    const { income } = buildBudgetFromTransfer(TRANSFER, "bysource");
    expect(income.map((r) => [r.label, r.amount])).toEqual([
      ["Base Pay", 4300],
      ["BAH", 3615],
      ["BAS", 477],
      ["Flight pay", 150],
    ]);
  });

  it("seeds Housing and Groceries from BAH/BAS", () => {
    const { expenses } = buildBudgetFromTransfer(TRANSFER, "combined");
    const byLabel = Object.fromEntries(expenses.map((r) => [r.label, r.amount]));
    expect(byLabel["Housing"]).toBe(3615);
    expect(byLabel["Groceries"]).toBe(477);
  });

  it("models deductions as expense rows so leftover nets to take-home", () => {
    const { expenses } = buildBudgetFromTransfer(TRANSFER, "combined");
    const labels = expenses.map((r) => r.label);
    expect(labels).toContain("Federal tax");
    expect(labels).toContain("State tax");
    expect(labels).toContain("FICA (Social Security + Medicare)");
    expect(labels).toContain("TSP (5% traditional)");
    expect(labels).toContain("SGLI");
  });

  it("omits zero-value optional rows (no BAH/BAS/state/TSP/SGLI)", () => {
    const bare: PayTransfer = {
      ...TRANSFER,
      income: { base: 2226, bah: 0, bas: 0, specials: [] },
      deductions: { federal: 50, state: 0, fica: 170, sgli: 0, tsp: 0, tspPct: 0, tspType: "roth" },
    };
    const { income, expenses } = buildBudgetFromTransfer(bare, "bysource");
    expect(income.map((r) => r.label)).toEqual(["Base Pay"]);
    const labels = expenses.map((r) => r.label);
    expect(labels).not.toContain("State tax");
    expect(labels).not.toContain("SGLI");
    expect(labels.some((l) => l.startsWith("TSP"))).toBe(false);
    // Housing/Groceries still present as empty starting points.
    const byLabel = Object.fromEntries(expenses.map((r) => [r.label, r.amount]));
    expect(byLabel["Housing"]).toBe(0);
    expect(byLabel["Groceries"]).toBe(0);
  });

  it("never emits negative amounts", () => {
    const weird: PayTransfer = {
      ...TRANSFER,
      grossMonthly: -5,
      income: { base: -10, bah: 0, bas: 0, specials: [] },
    };
    const { income } = buildBudgetFromTransfer(weird, "combined");
    expect(income[0].amount).toBe(0);
  });
});

describe("localStorage guards outside the browser", () => {
  it("save/load fail soft when window is undefined", () => {
    expect(saveTransfer(TRANSFER)).toBe(false);
    expect(loadTransfer()).toBeNull();
  });
});
