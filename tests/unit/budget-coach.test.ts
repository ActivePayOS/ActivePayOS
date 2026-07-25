// Tests for the 50/30/20 coach: classification, measurement, auto-balance.

import { describe, expect, it } from "vitest";
import {
  autoBalance,
  classifyLabel,
  computeCoach,
  type BucketOverrides,
} from "@/lib/budget/coach";
import type { BudgetItem } from "@/lib/sankey/model";

describe("classifyLabel", () => {
  it("sorts common military-budget labels into the right buckets", () => {
    expect(classifyLabel("Housing")).toBe("needs");
    expect(classifyLabel("Groceries")).toBe("needs");
    expect(classifyLabel("Transportation")).toBe("needs");
    expect(classifyLabel("Utilities")).toBe("needs");
    expect(classifyLabel("Insurance")).toBe("needs");
    expect(classifyLabel("SGLI")).toBe("needs");
    expect(classifyLabel("Fun money")).toBe("wants");
    expect(classifyLabel("Savings & TSP")).toBe("savings");
    expect(classifyLabel("Emergency fund")).toBe("savings");
    // The 50/30/20 rule's 20% bucket is "savings AND debt payoff".
    expect(classifyLabel("Debt payments")).toBe("savings");
    expect(classifyLabel("Student loan")).toBe("savings");
  });

  it("excludes tax/FICA rows off the top", () => {
    expect(classifyLabel("Federal tax")).toBe("offtop");
    expect(classifyLabel("State tax")).toBe("offtop");
    expect(classifyLabel("FICA (Social Security + Medicare)")).toBe("offtop");
  });

  it("defaults unknown labels to wants (so they get a second look)", () => {
    expect(classifyLabel("Llama grooming")).toBe("wants");
    expect(classifyLabel("")).toBe("wants");
  });
});

const EXPENSES: BudgetItem[] = [
  { id: "e1", label: "Housing", amount: 1500 },
  { id: "e2", label: "Groceries", amount: 500 },
  { id: "e3", label: "Fun money", amount: 600 },
  { id: "e4", label: "Savings", amount: 400 },
  { id: "e5", label: "Federal tax", amount: 1000 },
];
const NO_OVERRIDES: BucketOverrides = {};

describe("computeCoach", () => {
  it("measures buckets against after-tax income", () => {
    const c = computeCoach(5000, EXPENSES, 100, NO_OVERRIDES);
    expect(c.offTopTotal).toBe(1000);
    expect(c.afterTaxMonthly).toBe(4000);
    expect(c.buckets.needs.total).toBe(2000);
    expect(c.buckets.needs.pct).toBeCloseTo(0.5, 6);
    expect(c.buckets.needs.deltaMonthly).toBeCloseTo(0, 6);
    expect(c.buckets.wants.total).toBe(600);
    expect(c.buckets.wants.deltaMonthly).toBeCloseTo(600 - 1200, 6);
    // TSP contribution counts toward savings.
    expect(c.buckets.savings.total).toBe(500);
    expect(c.buckets.savings.deltaMonthly).toBeCloseTo(500 - 800, 6);
  });

  it("honors per-row bucket overrides", () => {
    const c = computeCoach(5000, EXPENSES, 0, { e3: "savings" });
    expect(c.buckets.wants.total).toBe(0);
    expect(c.buckets.savings.total).toBe(1000);
  });

  it("handles zero income without dividing by zero", () => {
    const c = computeCoach(0, EXPENSES, 0, NO_OVERRIDES);
    expect(c.afterTaxMonthly).toBe(0);
    expect(c.buckets.needs.pct).toBe(0);
  });

  it("ignores negative row amounts", () => {
    const c = computeCoach(1000, [{ id: "x", label: "Housing", amount: -50 }], 0, NO_OVERRIDES);
    expect(c.buckets.needs.total).toBe(0);
  });
});

function makeIdFactory() {
  let n = 0;
  return () => `new-${++n}`;
}

describe("autoBalance", () => {
  it("returns null when there is no after-tax income to balance", () => {
    expect(autoBalance(0, EXPENSES, 0, NO_OVERRIDES, makeIdFactory())).toBeNull();
    // Income fully consumed by taxes.
    expect(autoBalance(1000, EXPENSES, 0, NO_OVERRIDES, makeIdFactory())).toBeNull();
  });

  it("lands each bucket exactly on its 50/30/20 share", () => {
    const r = autoBalance(5000, EXPENSES, 0, NO_OVERRIDES, makeIdFactory());
    expect(r).not.toBeNull();
    const c = computeCoach(5000, r!.expenses, 0, NO_OVERRIDES);
    expect(c.buckets.needs.total).toBe(2000);
    expect(c.buckets.wants.total).toBe(1200);
    expect(c.buckets.savings.total).toBe(800);
    // Off-the-top rows untouched.
    expect(r!.expenses.find((e) => e.id === "e5")!.amount).toBe(1000);
    expect(r!.createdLabels).toEqual([]);
  });

  it("scales rows within a bucket proportionally", () => {
    const r = autoBalance(5000, EXPENSES, 0, NO_OVERRIDES, makeIdFactory())!;
    const housing = r.expenses.find((e) => e.id === "e1")!.amount;
    const groceries = r.expenses.find((e) => e.id === "e2")!.amount;
    expect(housing / groceries).toBeCloseTo(3, 5); // was 1500 : 500
  });

  it("reduces the savings target by the percentage-based TSP contribution", () => {
    const r = autoBalance(5000, EXPENSES, 100, NO_OVERRIDES, makeIdFactory())!;
    // 20% of 4000 = 800, minus 100 TSP → savings rows total 700.
    expect(r.expenses.find((e) => e.id === "e4")!.amount).toBe(700);
  });

  it("creates a row when a bucket is empty", () => {
    const noSavings = EXPENSES.filter((e) => e.id !== "e4");
    const r = autoBalance(5000, noSavings, 0, NO_OVERRIDES, makeIdFactory())!;
    expect(r.createdLabels).toEqual(["Savings"]);
    const created = r.expenses.find((e) => e.label === "Savings")!;
    expect(created.amount).toBe(800);
  });

  it("splits equally when a bucket's rows are all zero", () => {
    const zeros: BudgetItem[] = [
      { id: "w1", label: "Fun money", amount: 0 },
      { id: "w2", label: "Entertainment", amount: 0 },
      { id: "n1", label: "Housing", amount: 1000 },
      { id: "s1", label: "Savings", amount: 500 },
    ];
    const r = autoBalance(1000, zeros, 0, NO_OVERRIDES, makeIdFactory())!;
    const w1 = r.expenses.find((e) => e.id === "w1")!.amount;
    const w2 = r.expenses.find((e) => e.id === "w2")!.amount;
    expect(w1 + w2).toBe(300);
    expect(Math.abs(w1 - w2)).toBeLessThanOrEqual(1);
  });

  it("produces whole-dollar amounts that sum exactly per bucket", () => {
    const odd: BudgetItem[] = [
      { id: "n1", label: "Housing", amount: 333 },
      { id: "n2", label: "Groceries", amount: 333 },
      { id: "n3", label: "Utilities", amount: 333 },
    ];
    const r = autoBalance(1001, odd, 0, NO_OVERRIDES, makeIdFactory())!;
    const needsSum = r.expenses
      .filter((e) => ["n1", "n2", "n3"].includes(e.id))
      .reduce((a, e) => a + e.amount, 0);
    expect(needsSum).toBe(Math.round(0.5 * 1001));
    for (const e of r.expenses) expect(Number.isInteger(e.amount)).toBe(true);
  });
});
