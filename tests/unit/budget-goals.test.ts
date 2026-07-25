// Tests for the emergency-fund & savings-goal helpers.

import { describe, expect, it } from "vitest";
import {
  emergencyFundTarget,
  goalEtaLabel,
  goalProgress,
  isSavingsGoal,
  type SavingsGoal,
} from "@/lib/budget/goals";

const GOAL: SavingsGoal = { id: "g1", label: "PCS fund", target: 3000, saved: 600 };

describe("goalProgress", () => {
  it("computes remaining, fraction, and months at the given pace", () => {
    const p = goalProgress(GOAL, 400);
    expect(p.remaining).toBe(2400);
    expect(p.fraction).toBeCloseTo(0.2, 6);
    expect(p.monthsToGoal).toBe(6);
    expect(p.done).toBe(false);
  });

  it("rounds partial months up", () => {
    expect(goalProgress(GOAL, 700).monthsToGoal).toBe(4); // 2400/700 = 3.43
  });

  it("is done at or past the target", () => {
    const p = goalProgress({ ...GOAL, saved: 3000 }, 0);
    expect(p.done).toBe(true);
    expect(p.monthsToGoal).toBe(0);
    expect(goalProgress({ ...GOAL, saved: 9999 }, 0).fraction).toBe(1);
  });

  it("returns null months when there is no funding pace", () => {
    expect(goalProgress(GOAL, 0).monthsToGoal).toBeNull();
    expect(goalProgress(GOAL, -50).monthsToGoal).toBeNull();
  });

  it("clamps negative targets and savings", () => {
    const p = goalProgress({ ...GOAL, target: -100, saved: -5 }, 100);
    expect(p.remaining).toBe(0);
    expect(p.fraction).toBe(0);
    expect(p.done).toBe(false); // a zero target is never "funded"
  });
});

describe("emergencyFundTarget", () => {
  it("uses 3 months of essential (needs) spending", () => {
    expect(emergencyFundTarget(2000, 3500)).toBe(6000);
  });

  it("falls back to total non-tax spending when needs are empty", () => {
    expect(emergencyFundTarget(0, 3500)).toBe(10500);
  });

  it("supports other month counts and never goes negative", () => {
    expect(emergencyFundTarget(2000, 0, 6)).toBe(12000);
    expect(emergencyFundTarget(-10, -10)).toBe(0);
  });
});

describe("isSavingsGoal", () => {
  it("accepts well-formed goals and rejects malformed ones", () => {
    expect(isSavingsGoal(GOAL)).toBe(true);
    expect(isSavingsGoal(null)).toBe(false);
    expect(isSavingsGoal({ id: "x", label: "y" })).toBe(false);
    expect(isSavingsGoal({ ...GOAL, target: "3000" })).toBe(false);
  });
});

describe("goalEtaLabel", () => {
  it("labels the month the goal completes, rolling over years", () => {
    const from = new Date(2026, 6, 25); // July 2026
    expect(goalEtaLabel(6, from)).toBe("Jan 2027");
    expect(goalEtaLabel(0, from)).toBe("Jul 2026");
  });
});
