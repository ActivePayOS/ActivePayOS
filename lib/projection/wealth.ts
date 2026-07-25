// Long-term wealth projection over a service commitment.
//
// Pure math for the Wealth Projector: monthly-compounded growth of several
// accounts (TSP, taxable investments, savings) with contributions, the BRS
// agency match, and inflation adjustment. Educational planning estimates —
// returns are user-editable assumptions, not predictions.

import type { FundAllocation } from "@/lib/pay/tsp";

// ---------------------------------------------------------------------------
// BRS agency contributions (5 U.S.C. 8432; Blended Retirement System).
// Service Automatic: 1% of base pay regardless of member contributions.
// Service Matching: 100% on the first 3% contributed + 50% on the next 2%.
// Contributing 5% therefore earns the full 5% agency total.
// ---------------------------------------------------------------------------
export function brsAgencyPct(memberContribPct: number): number {
  const c = Math.max(0, memberContribPct);
  const dollarForDollar = Math.min(c, 0.03);
  const fiftyCents = Math.min(Math.max(0, c - 0.03), 0.02) * 0.5;
  return 0.01 + dollarForDollar + fiftyCents;
}

/** Blend per-fund annual returns (decimals) by a percent-based allocation. */
export function blendedAnnualReturn(
  alloc: FundAllocation,
  fundReturns: Record<keyof FundAllocation, number>
): number {
  const entries = Object.entries(alloc) as Array<[keyof FundAllocation, number]>;
  const totalWeight = entries.reduce((a, [, w]) => a + Math.max(0, w), 0);
  if (totalWeight <= 0) return 0;
  return entries.reduce(
    (a, [k, w]) => a + (Math.max(0, w) / totalWeight) * (fundReturns[k] ?? 0),
    0
  );
}

export type AccountInput = {
  key: string;
  label: string;
  startBalance: number;
  /** Contribution added at the end of each month. */
  monthlyContribution: number;
  /** Nominal annual return as a decimal (0.07 = 7%). */
  annualReturn: number;
};

export type YearSnapshot = {
  /** 1-based year index from the start of the projection. */
  yearIndex: number;
  balances: Record<string, number>;
  total: number;
  /** Total dollars put in across all accounts through this year (incl. start balances). */
  contributed: number;
  /** total − contributed. */
  growth: number;
  /** Total in today's dollars at the given inflation rate. */
  realTotal: number;
};

export type ProjectionResult = {
  years: YearSnapshot[];
  final: YearSnapshot;
  totalContributions: number;
  totalGrowth: number;
};

/**
 * Project account balances year by year with monthly compounding.
 *
 * Each account grows at its own rate: balance compounds monthly at
 * (1+r)^(1/12)−1 and the contribution lands at month end. Inflation deflates
 * totals back to today's dollars for the `realTotal` series.
 */
export function projectWealth(
  accounts: AccountInput[],
  years: number,
  inflation: number
): ProjectionResult {
  const n = Math.max(0, Math.floor(years));
  const balances: Record<string, number> = {};
  let contributed = 0;
  for (const a of accounts) {
    balances[a.key] = Math.max(0, a.startBalance);
    contributed += Math.max(0, a.startBalance);
  }

  const monthlyRate = (annual: number) => Math.pow(1 + annual, 1 / 12) - 1;
  const rates = Object.fromEntries(accounts.map((a) => [a.key, monthlyRate(a.annualReturn)]));

  const snapshots: YearSnapshot[] = [];
  for (let y = 1; y <= n; y++) {
    for (let m = 0; m < 12; m++) {
      for (const a of accounts) {
        balances[a.key] = balances[a.key] * (1 + rates[a.key]) + Math.max(0, a.monthlyContribution);
        contributed += Math.max(0, a.monthlyContribution);
      }
    }
    const total = accounts.reduce((s, a) => s + balances[a.key], 0);
    snapshots.push({
      yearIndex: y,
      balances: { ...balances },
      total,
      contributed,
      growth: total - contributed,
      realTotal: total / Math.pow(1 + Math.max(0, inflation), y),
    });
  }

  const startTotal = accounts.reduce((s, a) => s + Math.max(0, a.startBalance), 0);
  const final =
    snapshots[snapshots.length - 1] ??
    ({
      yearIndex: 0,
      balances: { ...balances },
      total: startTotal,
      contributed,
      growth: 0,
      realTotal: startTotal,
    } satisfies YearSnapshot);

  return {
    years: snapshots,
    final,
    totalContributions: final.contributed,
    totalGrowth: final.growth,
  };
}

/** Years for a balance to double at an annual rate (Rule of 72; null at ≤0%). */
export function yearsToDouble(annualReturn: number): number | null {
  if (annualReturn <= 0) return null;
  return 72 / (annualReturn * 100);
}
