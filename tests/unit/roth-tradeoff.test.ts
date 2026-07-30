// Tests for the Roth vs. Traditional trade space. The winner must follow the
// equal-out-of-pocket rule the UI states: equal rates tie, Roth wins when the
// withdrawal-time rate is higher than today's, Traditional wins when lower —
// with the breakeven pinned at today's rate.

import { describe, expect, it } from "vitest";
import { computeRothTradeoff, type RothTradeoffInput } from "@/lib/projection/roth-tradeoff";

const BASE: RothTradeoffInput = {
  monthlyContribution: 400,
  yearsContributing: 5,
  yearsToWithdrawal: 38,
  annualReturn: 0.07,
  taxRateNow: 0.12,
  taxRateAtWithdrawal: 0.12,
};

describe("computeRothTradeoff", () => {
  it("ties when today's rate equals the withdrawal rate", () => {
    const r = computeRothTradeoff(BASE);
    expect(r.winner).toBe("even");
    expect(r.advantage).toBeLessThan(1);
  });

  it("Roth wins when the retirement rate is higher than today's", () => {
    const r = computeRothTradeoff({ ...BASE, taxRateNow: 0.12, taxRateAtWithdrawal: 0.22 });
    expect(r.winner).toBe("roth");
    // Equal out-of-pocket: the edge is balance x (tLater - tNow).
    expect(r.advantage).toBeCloseTo(r.final.balance * 0.1, 4);
  });

  it("Traditional wins when the retirement rate is lower than today's", () => {
    const r = computeRothTradeoff({ ...BASE, taxRateNow: 0.22, taxRateAtWithdrawal: 0.12 });
    expect(r.winner).toBe("traditional");
    expect(r.advantage).toBeCloseTo(r.final.balance * 0.1, 4);
  });

  it("keeps the breakeven at today's marginal rate", () => {
    const r = computeRothTradeoff({ ...BASE, taxRateNow: 0.12, taxRateAtWithdrawal: 0.15 });
    expect(r.breakevenRatePct).toBe(12);
  });

  it("leaves the displayed per-year series unchanged (same dollars in, identical pre-tax balance)", () => {
    const r = computeRothTradeoff({ ...BASE, taxRateNow: 0.1, taxRateAtWithdrawal: 0.2 });
    const f = r.final;
    // Roth card shows the tax-free balance; Traditional nets the deferred bill.
    expect(f.rothAfterTax).toBeCloseTo(f.balance, 6);
    expect(f.tradAfterTax).toBeCloseTo(f.balance - f.deferredTaxBill, 6);
    expect(f.deferredTaxBill).toBeCloseTo(f.balance * 0.2, 6);
    expect(f.taxPaidUpFront).toBeCloseTo(r.contributed * 0.1, 6);
  });
});
