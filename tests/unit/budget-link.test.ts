// Tests for the Budget Builder → Wealth Projector contribution hand-off.

import { describe, expect, it } from "vitest";
import {
  applyAssignments,
  budgetContributionCandidates,
  suggestDestination,
  type SavedBudgetLike,
} from "@/lib/projection/budget-link";

describe("suggestDestination", () => {
  it("routes savings-type labels to savings", () => {
    expect(suggestDestination("Savings")).toBe("savings");
    expect(suggestDestination("Emergency fund")).toBe("savings");
    expect(suggestDestination("PCS fund")).toBe("savings");
  });

  it("routes investment-type labels to the investment account", () => {
    expect(suggestDestination("Brokerage")).toBe("invest");
    expect(suggestDestination("Roth IRA")).toBe("invest");
    expect(suggestDestination("Index fund investing")).toBe("invest");
    expect(suggestDestination("529 college")).toBe("invest");
  });

  it("skips TSP rows to avoid double-counting the modeled TSP account", () => {
    expect(suggestDestination("TSP (5% traditional)")).toBe("skip");
    expect(suggestDestination("Savings & TSP")).toBe("skip");
  });

  it("skips debt payments and ordinary spending", () => {
    expect(suggestDestination("Debt payments")).toBe("skip");
    expect(suggestDestination("Student loan")).toBe("skip");
    expect(suggestDestination("Housing")).toBe("skip");
    expect(suggestDestination("Fun money")).toBe("skip");
  });
});

const SAVED: SavedBudgetLike = {
  income: [
    { id: "inc-1", label: "Base Pay", amount: 3826 },
    { id: "inc-2", label: "BAH", amount: 2100 },
  ],
  expenses: [
    { id: "e1", label: "Housing", amount: 1800 },
    { id: "e2", label: "Savings", amount: 400 },
    { id: "e3", label: "Brokerage", amount: 200 },
    { id: "e4", label: "Empty row", amount: 0 },
  ],
  tspPct: 0.05,
  tspBaseId: "inc-1",
};

describe("budgetContributionCandidates", () => {
  it("lists positive expense rows with suggestions and income rows as skip", () => {
    const c = budgetContributionCandidates(SAVED);
    const byLabel = Object.fromEntries(c.map((x) => [x.label, x]));
    expect(byLabel["Savings"].suggested).toBe("savings");
    expect(byLabel["Brokerage"].suggested).toBe("invest");
    expect(byLabel["Housing"].suggested).toBe("skip");
    expect(byLabel["Base Pay (income)"].suggested).toBe("skip");
    expect(byLabel["Base Pay (income)"].kind).toBe("income");
    expect(c.find((x) => x.label === "Empty row")).toBeUndefined();
  });

  it("adds the unallocated leftover net of the percentage-based TSP", () => {
    const c = budgetContributionCandidates(SAVED);
    const leftover = c.find((x) => x.kind === "leftover")!;
    // 5926 income − 2400 expenses − 191.30 TSP = 3334.70
    expect(leftover.monthly).toBe(3335);
    expect(leftover.suggested).toBe("savings");
  });

  it("omits the leftover row when the budget overspends", () => {
    const c = budgetContributionCandidates({
      ...SAVED,
      expenses: [{ id: "e1", label: "Housing", amount: 9000 }],
    });
    expect(c.find((x) => x.kind === "leftover")).toBeUndefined();
  });

  it("handles null and malformed saves without throwing", () => {
    expect(budgetContributionCandidates(null)).toEqual([]);
    expect(
      budgetContributionCandidates({
        income: [{ id: "x" }],
        expenses: [{ label: 42 } as never],
      })
    ).toEqual([]);
  });
});

describe("applyAssignments", () => {
  it("sums by suggested destination when there are no overrides", () => {
    const c = budgetContributionCandidates(SAVED);
    const t = applyAssignments(c, {});
    expect(t.savingsMonthly).toBe(400 + 3335);
    expect(t.investMonthly).toBe(200);
  });

  it("honors overrides, including redirecting income rows and leftover", () => {
    const c = budgetContributionCandidates(SAVED);
    const t = applyAssignments(c, {
      leftover: "invest",
      "income:inc-2": "savings",
      e2: "skip",
    });
    expect(t.savingsMonthly).toBe(2100);
    expect(t.investMonthly).toBe(200 + 3335);
  });
});
