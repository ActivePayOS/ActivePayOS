// Emergency-fund & savings goals.
//
// Pure helpers for the Budget Builder's goal tracker: months-to-goal from the
// budget's monthly savings pace, plus the DoD Financial Readiness headline
// goal ("3 months of expenses") auto-derived from the budget itself.

export type SavingsGoal = {
  id: string;
  label: string;
  /** Total dollars the goal needs. */
  target: number;
  /** Dollars already set aside toward it. */
  saved: number;
};

export function isSavingsGoal(x: unknown): x is SavingsGoal {
  if (!x || typeof x !== "object") return false;
  const g = x as Partial<SavingsGoal>;
  return (
    typeof g.id === "string" &&
    typeof g.label === "string" &&
    typeof g.target === "number" &&
    typeof g.saved === "number"
  );
}

export type GoalProgress = {
  remaining: number;
  /** 0..1 of the target already saved. */
  fraction: number;
  /** Whole months until funded at the given pace; null when pace is 0 and not done. */
  monthsToGoal: number | null;
  done: boolean;
};

export function goalProgress(goal: SavingsGoal, monthlyContribution: number): GoalProgress {
  const target = Math.max(0, goal.target);
  const saved = Math.max(0, goal.saved);
  const remaining = Math.max(0, target - saved);
  const done = target > 0 && remaining === 0;
  const fraction = target > 0 ? Math.min(1, saved / target) : 0;
  const monthsToGoal =
    remaining === 0 ? 0 : monthlyContribution > 0 ? Math.ceil(remaining / monthlyContribution) : null;
  return { remaining, fraction, monthsToGoal, done };
}

/**
 * "N months of expenses" target for an emergency fund.
 *
 * Prefers essential (needs-bucket) spending — that's what an emergency fund
 * has to cover — and falls back to all non-tax spending when the needs bucket
 * is empty, so the quick-add always produces something sensible.
 */
export function emergencyFundTarget(
  needsMonthly: number,
  nonTaxSpendMonthly: number,
  months = 3
): number {
  const base = needsMonthly > 0 ? needsMonthly : nonTaxSpendMonthly;
  return Math.round(Math.max(0, base) * months);
}

/** "Mar 2027"-style label for a goal that finishes in `months` months. */
export function goalEtaLabel(months: number, from: Date): string {
  const d = new Date(from.getFullYear(), from.getMonth() + months, 1);
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}
