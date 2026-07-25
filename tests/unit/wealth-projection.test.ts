// Tests for the Wealth Projector math: BRS match, blended returns, compounding.

import { describe, expect, it } from "vitest";
import {
  blendedAnnualReturn,
  brsAgencyPct,
  projectWealth,
  yearsToDouble,
  type AccountInput,
} from "@/lib/projection/wealth";

describe("brsAgencyPct", () => {
  it("pays the 1% automatic contribution even at 0% member contribution", () => {
    expect(brsAgencyPct(0)).toBeCloseTo(0.01, 10);
    expect(brsAgencyPct(-0.05)).toBeCloseTo(0.01, 10);
  });

  it("matches dollar-for-dollar on the first 3%", () => {
    expect(brsAgencyPct(0.01)).toBeCloseTo(0.02, 10);
    expect(brsAgencyPct(0.03)).toBeCloseTo(0.04, 10);
  });

  it("matches 50 cents on the dollar for the next 2%", () => {
    expect(brsAgencyPct(0.04)).toBeCloseTo(0.045, 10);
    expect(brsAgencyPct(0.05)).toBeCloseTo(0.05, 10);
  });

  it("caps at 5% total no matter how much the member contributes", () => {
    expect(brsAgencyPct(0.1)).toBeCloseTo(0.05, 10);
    expect(brsAgencyPct(1)).toBeCloseTo(0.05, 10);
  });
});

describe("blendedAnnualReturn", () => {
  const returns = { G: 0.047, F: 0.052, C: 0.109, S: 0.101, I: 0.069 };

  it("weights returns by allocation", () => {
    const blended = blendedAnnualReturn({ G: 0, F: 0, C: 100, S: 0, I: 0 }, returns);
    expect(blended).toBeCloseTo(0.109, 10);
  });

  it("normalizes allocations that don't sum to 100", () => {
    const halfAndHalf = blendedAnnualReturn({ G: 10, F: 0, C: 10, S: 0, I: 0 }, returns);
    expect(halfAndHalf).toBeCloseTo((0.047 + 0.109) / 2, 10);
  });

  it("returns 0 for an empty allocation", () => {
    expect(blendedAnnualReturn({ G: 0, F: 0, C: 0, S: 0, I: 0 }, returns)).toBe(0);
  });
});

function account(overrides: Partial<AccountInput>): AccountInput {
  return {
    key: "a",
    label: "A",
    startBalance: 0,
    monthlyContribution: 0,
    annualReturn: 0,
    ...overrides,
  };
}

describe("projectWealth", () => {
  it("returns the start balances for a zero-year projection", () => {
    const r = projectWealth([account({ startBalance: 1000 })], 0, 0.025);
    expect(r.years).toHaveLength(0);
    expect(r.final.total).toBe(1000);
    expect(r.totalGrowth).toBe(0);
  });

  it("sums plain contributions at 0% return", () => {
    const r = projectWealth([account({ monthlyContribution: 100 })], 1, 0);
    expect(r.final.total).toBeCloseTo(1200, 6);
    expect(r.totalContributions).toBeCloseTo(1200, 6);
    expect(r.totalGrowth).toBeCloseTo(0, 6);
  });

  it("compounds a lump sum at exactly the effective annual rate", () => {
    // Monthly rate is derived as (1+r)^(1/12)−1, so 12 months = ×(1+r) exactly.
    const r = projectWealth([account({ startBalance: 1000, annualReturn: 0.08 })], 2, 0);
    expect(r.years[0].total).toBeCloseTo(1080, 6);
    expect(r.years[1].total).toBeCloseTo(1166.4, 6);
  });

  it("matches the closed-form future value of a monthly annuity", () => {
    const annual = 0.12;
    const m = Math.pow(1 + annual, 1 / 12) - 1;
    const expected = 100 * ((Math.pow(1 + m, 12) - 1) / m);
    const r = projectWealth([account({ monthlyContribution: 100, annualReturn: annual })], 1, 0);
    expect(r.final.total).toBeCloseTo(expected, 6);
  });

  it("tracks contributions vs growth separately", () => {
    const r = projectWealth(
      [account({ startBalance: 1000, monthlyContribution: 100, annualReturn: 0.07 })],
      5,
      0
    );
    expect(r.totalContributions).toBeCloseTo(1000 + 100 * 60, 6);
    expect(r.totalGrowth).toBeCloseTo(r.final.total - r.totalContributions, 6);
    expect(r.totalGrowth).toBeGreaterThan(0);
  });

  it("deflates real totals by the inflation assumption", () => {
    const r = projectWealth([account({ startBalance: 1000, annualReturn: 0.08 })], 3, 0.025);
    expect(r.years[2].realTotal).toBeCloseTo(r.years[2].total / Math.pow(1.025, 3), 6);
  });

  it("keeps accounts independent and totals them", () => {
    const r = projectWealth(
      [
        account({ key: "tsp", startBalance: 1000, annualReturn: 0.1 }),
        account({ key: "cash", startBalance: 500, annualReturn: 0.04 }),
      ],
      1,
      0
    );
    expect(r.final.balances.tsp).toBeCloseTo(1100, 6);
    expect(r.final.balances.cash).toBeCloseTo(520, 6);
    expect(r.final.total).toBeCloseTo(1620, 6);
  });

  it("clamps negative balances and contributions to zero", () => {
    const r = projectWealth(
      [account({ startBalance: -50, monthlyContribution: -10, annualReturn: 0.05 })],
      1,
      0
    );
    expect(r.final.total).toBe(0);
    expect(r.totalContributions).toBe(0);
  });
});

describe("yearsToDouble", () => {
  it("applies the Rule of 72", () => {
    expect(yearsToDouble(0.072)).toBeCloseTo(10, 6);
    expect(yearsToDouble(0.1)).toBeCloseTo(7.2, 6);
  });

  it("returns null at or below 0%", () => {
    expect(yearsToDouble(0)).toBeNull();
    expect(yearsToDouble(-0.02)).toBeNull();
  });
});
