// Tests for the military retirement mechanics.
//
// The multipliers and the COLA rule are pinned hard, because both are statutory
// and both have a well-known wrong answer in circulation: a 75% cap that no
// longer binds, and a CPI-minus-1% adjustment that applies only to CSB/REDUX.
// The present-value engine is cross-checked against a closed-form annuity
// rather than a recorded output, so a change in the loop cannot quietly pass.

import { describe, expect, it } from "vitest";
import {
  CONTINUATION_PAY_MULTIPLE,
  CONTINUATION_PAY_WINDOW,
  REGULAR_RETIREMENT_YEARS,
  RETIREMENT_MULTIPLIER_PCT,
  continuationPay,
  continuationPayEligibleAtYos,
  high3MonthlyBase,
  lifetimePensionTotal,
  monthlyPension,
  pensionAsNestEgg,
  pensionPresentValue,
} from "@/lib/projection/military-retirement";

describe("monthlyPension — statutory multipliers", () => {
  it("pays 40% of High-3 at 20 years under BRS (2.0%/yr)", () => {
    const r = monthlyPension({ high3: 6000, yearsOfService: 20, system: "brs" });
    expect(r.multiplierPct).toBe(2.0);
    expect(r.retiredPayPct).toBeCloseTo(40, 10);
    expect(r.monthlyPension).toBeCloseTo(2400, 10);
    expect(r.annualPension).toBeCloseTo(28800, 10);
    expect(r.eligible).toBe(true);
  });

  it("pays 50% of High-3 at 20 years under legacy High-3 (2.5%/yr)", () => {
    const r = monthlyPension({ high3: 6000, yearsOfService: 20, system: "high3" });
    expect(r.multiplierPct).toBe(2.5);
    expect(r.retiredPayPct).toBeCloseTo(50, 10);
    expect(r.monthlyPension).toBeCloseTo(3000, 10);
  });

  it("exposes the multipliers as constants so no surface restates them", () => {
    expect(RETIREMENT_MULTIPLIER_PCT.brs).toBe(2.0);
    expect(RETIREMENT_MULTIPLIER_PCT.high3).toBe(2.5);
    expect(REGULAR_RETIREMENT_YEARS).toBe(20);
  });

  it("counts fractional years of creditable service (10 U.S.C. § 1409(c))", () => {
    const r = monthlyPension({ high3: 6000, yearsOfService: 22.5, system: "brs" });
    expect(r.retiredPayPct).toBeCloseTo(45, 10);
    expect(r.monthlyPension).toBeCloseTo(2700, 10);
  });

  it("does NOT cap the multiplier past 30 years — the 75%/60% ceiling died in 2006", () => {
    const brs = monthlyPension({ high3: 6000, yearsOfService: 34, system: "brs" });
    expect(brs.retiredPayPct).toBeCloseTo(68, 10);
    expect(brs.retiredPayPct).toBeGreaterThan(60);

    const legacy = monthlyPension({ high3: 6000, yearsOfService: 34, system: "high3" });
    expect(legacy.retiredPayPct).toBeCloseTo(85, 10);
    expect(legacy.retiredPayPct).toBeGreaterThan(75);
  });

  it("pays nothing below 20 years — the cliff, not a gradient", () => {
    const justShort = monthlyPension({ high3: 6000, yearsOfService: 19.9, system: "brs" });
    expect(justShort.eligible).toBe(false);
    expect(justShort.monthlyPension).toBe(0);
    expect(justShort.annualPension).toBe(0);
    expect(justShort.notes.join(" ")).toMatch(/cliff/i);

    const atTwenty = monthlyPension({ high3: 6000, yearsOfService: 20, system: "brs" });
    expect(atTwenty.eligible).toBe(true);
    expect(atTwenty.monthlyPension).toBeGreaterThan(0);
  });

  it("never returns a negative pension from junk input", () => {
    const r = monthlyPension({ high3: -5000, yearsOfService: -3, system: "brs" });
    expect(r.monthlyPension).toBe(0);
    expect(r.eligible).toBe(false);
  });
});

describe("high3MonthlyBase — source selection and honesty about it", () => {
  it("averages the highest 36 months when a monthly series is available", () => {
    // 4000, 4001, ... 4039. The top 36 are 4004..4039 → mean 4021.5.
    const monthlyBasePay = Array.from({ length: 40 }, (_, i) => 4000 + i);
    const r = high3MonthlyBase({ monthlyBasePay });
    expect(r.source).toBe("monthly-basic-pay");
    expect(r.exact).toBe(true);
    expect(r.periodsAveraged).toBe(36);
    expect(r.monthlyBase).toBeCloseTo(4021.5, 10);
  });

  it("picks the HIGHEST 36, not the last 36, so a pay cut cannot drag it down", () => {
    const rising = Array.from({ length: 36 }, (_, i) => 5000 + i * 10);
    const r = high3MonthlyBase({ monthlyBasePay: [...rising, 100, 100, 100] });
    const expected = rising.reduce((a, b) => a + b, 0) / 36;
    expect(r.monthlyBase).toBeCloseTo(expected, 10);
  });

  it("flags a short monthly series rather than pretending it is the statutory figure", () => {
    const r = high3MonthlyBase({ monthlyBasePay: [5000, 5100, 5200] });
    expect(r.source).toBe("monthly-basic-pay");
    expect(r.exact).toBe(false);
    expect(r.periodsAveraged).toBe(3);
    expect(r.monthlyBase).toBeCloseTo(5100, 10);
  });

  it("falls back to the highest 3 annual snapshots", () => {
    const r = high3MonthlyBase({ annualBasePay: [4000, 4500, 5000, 5500] });
    expect(r.source).toBe("annual-basic-pay");
    expect(r.exact).toBe(false);
    expect(r.monthlyBase).toBeCloseTo(5000, 10);
    expect(r.note).toMatch(/approximated/i);
  });

  it("uses final pay only as a last resort, and says it overstates the pension", () => {
    const r = high3MonthlyBase({ finalMonthlyBasePay: 6000 });
    expect(r.source).toBe("final-pay-proxy");
    expect(r.exact).toBe(false);
    expect(r.monthlyBase).toBe(6000);
    expect(r.note).toMatch(/OVERSTATES/);
  });

  it("prefers the better source when several are supplied", () => {
    const monthly = high3MonthlyBase({
      monthlyBasePay: [5000, 5000, 5000],
      annualBasePay: [9000],
      finalMonthlyBasePay: 9999,
    });
    expect(monthly.source).toBe("monthly-basic-pay");

    const annual = high3MonthlyBase({ annualBasePay: [9000], finalMonthlyBasePay: 9999 });
    expect(annual.source).toBe("annual-basic-pay");
  });

  it("degrades to zero with an explanation when nothing usable is supplied", () => {
    const empty = high3MonthlyBase({});
    expect(empty.source).toBe("unavailable");
    expect(empty.monthlyBase).toBe(0);

    const junk = high3MonthlyBase({ monthlyBasePay: [0, -100, Number.NaN], annualBasePay: [0] });
    expect(junk.source).toBe("unavailable");
    expect(junk.monthlyBase).toBe(0);
  });
});

describe("pensionPresentValue", () => {
  // Closed form for a growing annuity-due, computed independently of the
  // implementation's loop.
  const closedForm = (annual: number, n: number, g: number, d: number, deferral: number) => {
    const q = (1 + g) / (1 + d);
    const sum = Math.abs(q - 1) < 1e-12 ? n : (1 - Math.pow(q, n)) / (1 - q);
    return (annual * sum) / Math.pow(1 + d, deferral);
  };

  it("matches a hand-computed two-payment annuity", () => {
    // $2,000/mo = $24,000/yr, paid at ages 60 and 61, no COLA, 10% discount:
    //   24000 + 24000/1.1 = 45,818.1818...
    const r = pensionPresentValue({
      monthlyPension: 2000,
      startAge: 60,
      endAge: 62,
      colaPct: 0,
      discountRatePct: 10,
    });
    expect(r.payments).toBe(2);
    expect(r.annualPensionAtStart).toBe(24000);
    expect(r.presentValue).toBeCloseTo(24000 + 24000 / 1.1, 6);
  });

  it("discounts the deferral from the valuation age to the start age", () => {
    const r = pensionPresentValue({
      monthlyPension: 2000,
      startAge: 60,
      endAge: 62,
      colaPct: 0,
      discountRatePct: 10,
      valuationAge: 58,
    });
    expect(r.deferralYears).toBe(2);
    expect(r.presentValue).toBeCloseTo((24000 + 24000 / 1.1) / 1.21, 6);
  });

  it("collapses to payments x annual when the COLA equals the discount rate", () => {
    // A full-CPI-indexed pension discounted at inflation holds its purchasing
    // power exactly — this identity is the whole reason CPI-1 is the wrong rule.
    const r = pensionPresentValue({
      monthlyPension: 2000,
      startAge: 45,
      endAge: 85,
      colaPct: 2.5,
      discountRatePct: 2.5,
    });
    expect(r.payments).toBe(40);
    expect(r.presentValue).toBeCloseTo(24000 * 40, 6);
  });

  it("agrees with the closed-form growing annuity across rate combinations", () => {
    for (const [g, d] of [
      [0, 5],
      [2.5, 4],
      [3, 2],
      [2, 2],
    ] as [number, number][]) {
      const r = pensionPresentValue({
        monthlyPension: 2500,
        startAge: 42,
        endAge: 85,
        colaPct: g,
        discountRatePct: d,
        valuationAge: 38,
      });
      expect(r.presentValue).toBeCloseTo(closedForm(30000, 43, g / 100, d / 100, 4), 4);
    }
  });

  it("is worth more the longer you live", () => {
    const shared = { monthlyPension: 2400, startAge: 42, colaPct: 2.5, discountRatePct: 2.5 };
    const to80 = pensionPresentValue({ ...shared, endAge: 80 });
    const to90 = pensionPresentValue({ ...shared, endAge: 90 });
    expect(to90.presentValue).toBeGreaterThan(to80.presentValue);
  });

  it("returns zero, not NaN, when the end age is at or before the start age", () => {
    const r = pensionPresentValue({
      monthlyPension: 2400,
      startAge: 60,
      endAge: 60,
      colaPct: 2.5,
      discountRatePct: 2.5,
    });
    expect(r.payments).toBe(0);
    expect(r.presentValue).toBe(0);
  });
});

describe("lifetimePensionTotal", () => {
  it("sums every payment undiscounted, with the COLA compounding", () => {
    const r = lifetimePensionTotal({ monthlyPension: 1000, startAge: 60, endAge: 63, colaPct: 10 });
    // 12000 + 13200 + 14520 = 39,720
    expect(r.payments).toBe(3);
    expect(r.nominalTotal).toBeCloseTo(39720, 6);
    expect(r.firstYearAnnual).toBe(12000);
    expect(r.finalYearAnnual).toBeCloseTo(14520, 6);
  });

  it("is a plain multiplication with no COLA", () => {
    const r = lifetimePensionTotal({ monthlyPension: 2000, startAge: 45, endAge: 85, colaPct: 0 });
    expect(r.nominalTotal).toBeCloseTo(24000 * 40, 6);
  });

  it("always exceeds the present value at a positive discount rate", () => {
    const shared = { monthlyPension: 2400, startAge: 42, endAge: 85, colaPct: 2.5 };
    const lifetime = lifetimePensionTotal(shared);
    const pv = pensionPresentValue({ ...shared, discountRatePct: 5 });
    expect(lifetime.nominalTotal).toBeGreaterThan(pv.presentValue);
  });
});

describe("pensionAsNestEgg", () => {
  it("inverts the sustainable-withdrawal rule", () => {
    const r = pensionAsNestEgg({ annualPension: 28800, withdrawalRatePct: 4 });
    expect(r.nestEggEquivalent).toBeCloseTo(720000, 6);
    expect(r.withdrawalRatePct).toBe(4);
  });

  it("defaults to 4% and never divides by zero", () => {
    expect(pensionAsNestEgg({ annualPension: 40000 }).nestEggEquivalent).toBeCloseTo(1000000, 6);
    expect(pensionAsNestEgg({ annualPension: 40000, withdrawalRatePct: 0 }).nestEggEquivalent).toBeCloseTo(
      1000000,
      6
    );
  });
});

describe("continuationPay", () => {
  it("uses the current 7–12 year window, not the outdated 8–12", () => {
    expect(CONTINUATION_PAY_WINDOW.minYos).toBe(7);
    expect(CONTINUATION_PAY_WINDOW.maxYos).toBe(12);
    expect(continuationPayEligibleAtYos(6.9)).toBe(false);
    expect(continuationPayEligibleAtYos(7)).toBe(true);
    expect(continuationPayEligibleAtYos(12)).toBe(true);
    expect(continuationPayEligibleAtYos(12.1)).toBe(false);
  });

  it("reports a range of monthly basic pay, never a point estimate", () => {
    const r = continuationPay({ monthlyBasePay: 5000, yearsOfService: 9 });
    expect(r.eligible).toBe(true);
    expect(r.minAmount).toBeCloseTo(5000 * CONTINUATION_PAY_MULTIPLE.active.min, 6);
    expect(r.maxAmount).toBeCloseTo(5000 * CONTINUATION_PAY_MULTIPLE.active.max, 6);
    expect(r.illustrative.length).toBeGreaterThan(2);
    for (const x of r.illustrative) expect(x.amount).toBeCloseTo(5000 * x.multiple, 6);
    // The spread is wide enough that a single number would be badly wrong.
    expect(r.maxAmount / r.minAmount).toBeGreaterThan(4);
  });

  it("uses the drilling-reserve multiples for a reserve component", () => {
    const r = continuationPay({ monthlyBasePay: 5000, yearsOfService: 9, component: "reserve" });
    expect(r.minMultiple).toBe(CONTINUATION_PAY_MULTIPLE.reserve.min);
    expect(r.maxMultiple).toBe(CONTINUATION_PAY_MULTIPLE.reserve.max);
  });

  it("is BRS-only and outside-the-window aware, but still reports the range", () => {
    expect(continuationPay({ monthlyBasePay: 5000, yearsOfService: 9, brs: false }).eligible).toBe(false);
    const late = continuationPay({ monthlyBasePay: 5000, yearsOfService: 14 });
    expect(late.eligible).toBe(false);
    expect(late.maxAmount).toBeGreaterThan(0);
  });
});
