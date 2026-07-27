// Roth vs. Traditional trade space across time.
//
// Captures the core question for TSP and IRA elections: pay tax on the money
// now (Roth) or later (Traditional)? Both paths put the SAME dollars into the
// account each month, so the pre-tax balance is identical — what differs is
// when the tax bill lands and how big it is:
//
//   Roth:        tax is paid up front at today's marginal rate on every
//                contribution; qualified withdrawals are tax-free.
//   Traditional: contributions are excluded from tax now; the ENTIRE balance
//                (contributions + all growth) is taxed at withdrawal at the
//                future rate.
//
// With equal contributions the after-tax outcome reduces to a clean rule:
// Roth wins when your withdrawal-time tax rate is HIGHER than today's rate,
// Traditional wins when it is LOWER, and at equal rates they tie (the
// commutative property of multiplication — tax now or later, same product).
// The year-by-year series makes the "small tax now vs. big tax later" shape
// visible: the deferred tax bill compounds right along with the balance.
//
// Pure math, planning estimate only. Real elections also involve BRS match
// mechanics (the match is always Traditional), state taxes, deployment
// CZTE months (tax-free pay makes Roth contributions extraordinarily
// attractive), and future tax law — all called out in the UI.

export type RothTradeoffInput = {
  /** Dollars contributed to the account per month (same on both paths). */
  monthlyContribution: number;
  /** Years contributions continue. */
  yearsContributing: number;
  /** Years until withdrawal (>= yearsContributing; balance keeps compounding). */
  yearsToWithdrawal: number;
  /** Nominal annual return, decimal. */
  annualReturn: number;
  /** Marginal tax rate on income today, decimal (fed + state on the margin). */
  taxRateNow: number;
  /** Expected marginal tax rate on withdrawals in retirement, decimal. */
  taxRateAtWithdrawal: number;
};

export type RothTradeoffYear = {
  year: number; // 1-based
  /** Pre-tax account balance (identical on both paths). */
  balance: number;
  /** Roth path: cumulative tax already paid on contributions so far. */
  taxPaidUpFront: number;
  /** Traditional path: tax due if the whole balance were withdrawn this year. */
  deferredTaxBill: number;
  /** After-tax value if withdrawn this year. */
  rothAfterTax: number;
  tradAfterTax: number;
};

export type RothTradeoffResult = {
  years: RothTradeoffYear[];
  final: RothTradeoffYear;
  /** Total contributed over the window. */
  contributed: number;
  /** roth | traditional | even — by final after-tax value. */
  winner: "roth" | "traditional" | "even";
  /** After-tax advantage of the winner at the horizon (>= 0). */
  advantage: number;
  /** The withdrawal-time rate at which the two paths tie: today's rate. */
  breakevenRatePct: number;
};

const monthlyRate = (annual: number) => Math.pow(1 + annual, 1 / 12) - 1;

export function computeRothTradeoff(i: RothTradeoffInput): RothTradeoffResult {
  const months = Math.max(1, Math.round(Math.max(i.yearsToWithdrawal, i.yearsContributing) * 12));
  const contribMonths = Math.max(0, Math.round(i.yearsContributing * 12));
  const r = monthlyRate(i.annualReturn);
  const c = Math.max(0, i.monthlyContribution);
  const tNow = Math.max(0, Math.min(0.6, i.taxRateNow));
  const tLater = Math.max(0, Math.min(0.6, i.taxRateAtWithdrawal));

  let balance = 0;
  let contributed = 0;
  let taxPaidUpFront = 0;
  const years: RothTradeoffYear[] = [];

  for (let m = 0; m < months; m++) {
    balance *= 1 + r;
    if (m < contribMonths) {
      balance += c;
      contributed += c;
      // Roth: to put $c INTO the account you also paid tax on that income now.
      taxPaidUpFront += c * tNow;
    }
    if ((m + 1) % 12 === 0 || m === months - 1) {
      const deferredTaxBill = balance * tLater;
      years.push({
        year: Math.floor(m / 12) + 1,
        balance,
        taxPaidUpFront,
        deferredTaxBill,
        rothAfterTax: balance,
        tradAfterTax: balance - deferredTaxBill,
      });
    }
  }

  const final = years[years.length - 1];
  // Fair comparison note: on the Roth path you ALSO parted with the up-front
  // tax money. Net position = after-tax value − tax paid up front (Roth) vs
  // after-tax value (Traditional, tax netted at withdrawal). With equal
  // contributions this is exactly the t_now vs t_later comparison.
  const rothNet = final.rothAfterTax - final.taxPaidUpFront;
  const tradNet = final.tradAfterTax;
  const diff = rothNet - tradNet;
  const winner = Math.abs(diff) < 1 ? "even" : diff > 0 ? "roth" : "traditional";

  return {
    years,
    final,
    contributed,
    winner,
    advantage: Math.abs(diff),
    breakevenRatePct: Math.round(tNow * 1000) / 10,
  };
}

export const ROTH_TRADEOFF_CAVEATS: string[] = [
  "Both paths contribute the same dollars, so the pre-tax balance is identical — the trade is purely when the tax lands. Roth wins when your withdrawal-time rate is higher than today's; Traditional wins when it's lower; equal rates tie.",
  "Junior-enlisted marginal rates are usually low (10–12%), which tilts early-career members toward Roth: pay the small tax now, never pay tax on decades of growth.",
  "BRS agency/matching contributions are always Traditional regardless of your election, so most members end with both buckets.",
  "Contributions made in a combat zone (CZTE) go in tax-free — Roth CZTE contributions come out tax-free too, the best of both worlds.",
  "Traditional dollars are taxed at withdrawal as ordinary income under whatever tax law exists then; required minimum distributions apply to Traditional (not Roth) accounts.",
  "Educational estimate — real elections also depend on state taxes, credits, and your full retirement income picture.",
];
