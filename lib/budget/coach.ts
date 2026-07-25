// 50/30/20 budget coach.
//
// Classifies budget expense rows into needs / wants / savings buckets, measures
// them against the 50/30/20 guideline, and can auto-balance the budget to hit
// the targets. Pure functions only — the Budget Builder wires them to state.
//
// The guideline (Warren/Tyagi "All Your Worth") splits AFTER-TAX income:
//   50% needs · 30% wants · 20% savings & debt payoff.
// Tax/FICA rows (present when a budget is imported from the Pay Calculator)
// are therefore excluded "off the top" rather than counted as spending.

import type { BudgetItem } from "@/lib/sankey/model";

export type Bucket = "needs" | "wants" | "savings" | "offtop";

export const BUCKET_TARGETS: Record<Exclude<Bucket, "offtop">, number> = {
  needs: 0.5,
  wants: 0.3,
  savings: 0.2,
};

export const BUCKET_LABELS: Record<Bucket, string> = {
  needs: "Needs",
  wants: "Wants",
  savings: "Savings & debt payoff",
  offtop: "Off the top (taxes)",
};

// Heuristic label → bucket mapping. Order matters: taxes first, then savings
// (so "Savings & TSP" doesn't fall through), then needs. Unmatched labels
// default to "wants" so they get a second look — every chip is reassignable.
const OFFTOP_RE = /tax|fica|withhold/i;
const SAVINGS_RE = /\bsav|tsp|invest|retire|emergency|brokerage|529\b|\bira\b|fund\b|debt|loan/i;
const NEEDS_RE =
  /hous|rent|mortgage|grocer|food|transport|car|gas|fuel|utilit|electric|water|insur|sgli|medical|health|dental|childcare|daycare|diaper|phone|internet|commissary/i;

export function classifyLabel(label: string): Bucket {
  const l = (label || "").trim();
  if (OFFTOP_RE.test(l)) return "offtop";
  if (SAVINGS_RE.test(l)) return "savings";
  if (NEEDS_RE.test(l)) return "needs";
  return "wants";
}

export type BucketOverrides = Record<string, Bucket>;

export function bucketFor(item: BudgetItem, overrides: BucketOverrides): Bucket {
  return overrides[item.id] ?? classifyLabel(item.label);
}

export type CoachRow = { id: string; label: string; amount: number; bucket: Bucket };

export type CoachResult = {
  /** Income minus the off-the-top (tax/FICA) rows — the 50/30/20 denominator. */
  afterTaxMonthly: number;
  offTopTotal: number;
  rows: CoachRow[];
  buckets: Record<
    Exclude<Bucket, "offtop">,
    {
      total: number;
      /** Share of after-tax income, 0..1 (0 when after-tax income is 0). */
      pct: number;
      target: number;
      /** total − target dollars; positive = over the guideline. */
      deltaMonthly: number;
    }
  >;
};

/**
 * Measure the budget against 50/30/20.
 *
 * `tspMonthly` is the percentage-based TSP contribution from the TSP panel; it
 * counts toward the savings bucket (it is real saving, it just isn't an
 * expense row).
 */
export function computeCoach(
  totalIncome: number,
  expenses: BudgetItem[],
  tspMonthly: number,
  overrides: BucketOverrides
): CoachResult {
  const rows: CoachRow[] = expenses.map((e) => ({
    id: e.id,
    label: e.label,
    amount: Math.max(0, e.amount),
    bucket: bucketFor(e, overrides),
  }));

  const sum = (b: Bucket) => rows.filter((r) => r.bucket === b).reduce((a, r) => a + r.amount, 0);
  const offTopTotal = sum("offtop");
  const afterTaxMonthly = Math.max(0, totalIncome - offTopTotal);

  const totals = {
    needs: sum("needs"),
    wants: sum("wants"),
    savings: sum("savings") + Math.max(0, tspMonthly),
  };

  const buckets = Object.fromEntries(
    (Object.keys(BUCKET_TARGETS) as Array<Exclude<Bucket, "offtop">>).map((key) => {
      const total = totals[key];
      const target = BUCKET_TARGETS[key] * afterTaxMonthly;
      return [
        key,
        {
          total,
          pct: afterTaxMonthly > 0 ? total / afterTaxMonthly : 0,
          target,
          deltaMonthly: total - target,
        },
      ];
    })
  ) as CoachResult["buckets"];

  return { afterTaxMonthly, offTopTotal, rows, buckets };
}

// Labels used when auto-balance must create a row for an empty bucket.
const NEW_ROW_LABELS: Record<Exclude<Bucket, "offtop">, string> = {
  needs: "Living costs",
  wants: "Fun money",
  savings: "Savings",
};

export type AutoBalanceResult = {
  expenses: BudgetItem[];
  /** Rows that were created because a bucket had nothing in it. */
  createdLabels: string[];
};

/**
 * Rewrite expense amounts so each bucket lands exactly on its 50/30/20 share
 * of after-tax income. Off-the-top rows are untouched. Rows within a bucket
 * are scaled proportionally (equal split if the bucket is all zeros); an empty
 * bucket gets one new row. TSP (percentage-based) already counts toward the
 * savings target, so the savings rows only need to cover the remainder.
 *
 * Returns null when there is nothing to balance (no after-tax income).
 */
export function autoBalance(
  totalIncome: number,
  expenses: BudgetItem[],
  tspMonthly: number,
  overrides: BucketOverrides,
  makeId: () => string
): AutoBalanceResult | null {
  const coach = computeCoach(totalIncome, expenses, tspMonthly, overrides);
  if (coach.afterTaxMonthly <= 0) return null;

  const targets: Record<Exclude<Bucket, "offtop">, number> = {
    needs: BUCKET_TARGETS.needs * coach.afterTaxMonthly,
    wants: BUCKET_TARGETS.wants * coach.afterTaxMonthly,
    savings: Math.max(0, BUCKET_TARGETS.savings * coach.afterTaxMonthly - Math.max(0, tspMonthly)),
  };

  const next: BudgetItem[] = expenses.map((e) => ({ ...e }));
  const createdLabels: string[] = [];

  for (const key of Object.keys(targets) as Array<Exclude<Bucket, "offtop">>) {
    const target = targets[key];
    const members = next.filter((e) => bucketFor(e, overrides) === key);

    if (members.length === 0) {
      if (Math.round(target) > 0) {
        const label = NEW_ROW_LABELS[key];
        next.push({ id: makeId(), label, amount: Math.round(target) });
        createdLabels.push(label);
      }
      continue;
    }

    const current = members.reduce((a, e) => a + Math.max(0, e.amount), 0);
    // Proportional scale, or an equal split when the bucket is all zeros.
    for (const m of members) {
      const share = current > 0 ? Math.max(0, m.amount) / current : 1 / members.length;
      m.amount = Math.round(target * share);
    }
    // Rounding drift lands on the largest row so the bucket sums exactly.
    const rounded = members.reduce((a, e) => a + e.amount, 0);
    const drift = Math.round(target) - rounded;
    if (drift !== 0) {
      const biggest = members.reduce((a, b) => (b.amount > a.amount ? b : a), members[0]);
      biggest.amount = Math.max(0, biggest.amount + drift);
    }
  }

  return { expenses: next, createdLabels };
}
