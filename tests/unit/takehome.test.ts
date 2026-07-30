// Golden-value tests for the take-home estimate.
//
// Federal tax expectations are hand-computed from the 2026 brackets and
// standard deduction in lib/pay/takehome.ts (verify those constants against
// IRS Rev. Proc. 2025-32 / Pub. 15-T — these tests lock in the math, the
// audit scripts lock in the data).

import { describe, expect, it } from "vitest";
import {
  ADDL_MEDICARE_RATE,
  FEDERAL_BRACKETS_2026,
  MEDICARE_RATE,
  SS_RATE,
  SS_WAGE_BASE_2026,
  STANDARD_DEDUCTION_2026,
  TSP_ELECTIVE_DEFERRAL_LIMIT_2026,
  computeTakeHome,
  federalMarginalRate,
  federalTaxAnnual,
  type TakeHomeInput,
} from "@/lib/pay/takehome";
import { TSP_ELECTIVE_DEFERRAL_LIMIT_2026 as TSP_LIMIT_FROM_TSP_MODULE } from "@/lib/pay/tsp";

describe("federalTaxAnnual", () => {
  it("returns 0 for non-positive taxable income", () => {
    expect(federalTaxAnnual(0, "single")).toBe(0);
    expect(federalTaxAnnual(-5000, "single")).toBe(0);
  });

  it("taxes the whole first bracket at 10% (single)", () => {
    // Exactly at the top of the 10% bracket.
    expect(federalTaxAnnual(12400, "single")).toBeCloseTo(1240, 6);
  });

  it("stacks brackets correctly at the 12% boundary (single)", () => {
    // 12,400 * 10% + (50,400 - 12,400) * 12% = 1,240 + 4,560 = 5,800
    expect(federalTaxAnnual(50400, "single")).toBeCloseTo(5800, 6);
  });

  it("computes a mid-22%-bracket amount (single)", () => {
    // 5,800 (through 50,400) + (60,000 - 50,400) * 22% = 5,800 + 2,112 = 7,912
    expect(federalTaxAnnual(60000, "single")).toBeCloseTo(7912, 6);
  });

  it("computes married brackets independently", () => {
    // 24,800 * 10% + (30,000 - 24,800) * 12% = 2,480 + 624 = 3,104
    expect(federalTaxAnnual(30000, "married")).toBeCloseTo(3104, 6);
  });

  it("reaches the 37% top bracket (single)", () => {
    // Through 640,600:
    // 1,240 + 4,560 + 12,166 + 23,058 + 17,424 + 134,531.25 = 192,979.25
    // Plus (700,000 - 640,600) * 37% = 21,978 → 214,957.25
    expect(federalTaxAnnual(700000, "single")).toBeCloseTo(214957.25, 2);
  });
});

describe("federalMarginalRate", () => {
  it("returns 0 for non-positive income", () => {
    expect(federalMarginalRate(0, "single")).toBe(0);
  });

  it("returns the bracket rate at and above each boundary", () => {
    expect(federalMarginalRate(12400, "single")).toBe(0.1);
    expect(federalMarginalRate(12401, "single")).toBe(0.12);
    expect(federalMarginalRate(1000000, "single")).toBe(0.37);
  });
});

// A representative E-5-like scenario (base 4,299.90 = 2026 E-5 @ 8 YOS).
const E5_INPUT: TakeHomeInput = {
  basePayMonthly: 4299.9,
  bahMonthly: 3615,
  basMonthly: 476.95,
  filingStatus: "single",
  tspPct: 0.05,
  tspType: "traditional",
  sgliMonthly: 26,
  stateTaxRatePct: 0,
};

describe("computeTakeHome", () => {
  it("splits taxable vs non-taxable and sums gross", () => {
    const r = computeTakeHome(E5_INPUT);
    expect(r.taxableMonthly).toBeCloseTo(4299.9, 6);
    expect(r.nonTaxableMonthly).toBeCloseTo(3615 + 476.95, 6);
    expect(r.grossMonthly).toBeCloseTo(4299.9 + 3615 + 476.95, 6);
  });

  it("matches a hand-computed federal tax for the E-5 scenario", () => {
    const r = computeTakeHome(E5_INPUT);
    // Annual wages 51,598.80 − trad TSP 2,579.94 − std deduction 16,100
    // = 32,918.86 taxable → 1,240 + (32,918.86 − 12,400) × 12% = 3,702.2632/yr
    expect(r.federalTaxMonthly).toBeCloseTo(3702.2632 / 12, 4);
    expect(r.federalMarginalRate).toBe(0.12);
  });

  it("computes FICA on wages without a TSP reduction", () => {
    const r = computeTakeHome(E5_INPUT);
    expect(r.socialSecurityMonthly).toBeCloseTo(4299.9 * SS_RATE, 6);
    expect(r.medicareMonthly).toBeCloseTo(4299.9 * MEDICARE_RATE, 6);
    expect(r.ficaMonthly).toBeCloseTo(r.socialSecurityMonthly + r.medicareMonthly, 6);
  });

  it("take-home equals gross minus all deductions", () => {
    const r = computeTakeHome(E5_INPUT);
    expect(r.takeHomeMonthly).toBeCloseTo(r.grossMonthly - r.totalDeductionsMonthly, 6);
    expect(r.totalDeductionsMonthly).toBeCloseTo(
      r.federalTaxMonthly + r.stateTaxMonthly + r.ficaMonthly + r.tspMonthly + r.sgliMonthly,
      6
    );
  });

  it("Roth TSP does not reduce federal taxable income (traditional does)", () => {
    const trad = computeTakeHome(E5_INPUT);
    const roth = computeTakeHome({ ...E5_INPUT, tspType: "roth" });
    expect(roth.tspMonthly).toBeCloseTo(trad.tspMonthly, 6);
    expect(roth.federalTaxMonthly).toBeGreaterThan(trad.federalTaxMonthly);
    // Roth federal tax uses full wages: 51,598.80 − 16,100 = 35,498.80
    // → 1,240 + 23,098.80 × 12% = 4,011.856/yr
    expect(roth.federalTaxMonthly).toBeCloseTo(4011.856 / 12, 4);
  });

  it("caps TSP at the annual elective-deferral limit", () => {
    const r = computeTakeHome({ ...E5_INPUT, basePayMonthly: 20000, tspPct: 0.15 });
    // 15% of 20,000 = 3,000 > 24,500 / 12
    expect(r.tspMonthly).toBeCloseTo(TSP_ELECTIVE_DEFERRAL_LIMIT_2026 / 12, 6);
  });

  it("caps Social Security wages at the 2026 wage base", () => {
    const r = computeTakeHome({ ...E5_INPUT, basePayMonthly: 20000, tspPct: 0 });
    expect(r.socialSecurityMonthly).toBeCloseTo((SS_WAGE_BASE_2026 / 12) * SS_RATE, 6);
  });

  it("adds Additional Medicare above $200k/yr in wages", () => {
    const r = computeTakeHome({ ...E5_INPUT, basePayMonthly: 20000, tspPct: 0 });
    const excessMonthly = 20000 - 200000 / 12;
    expect(r.medicareMonthly).toBeCloseTo(
      20000 * MEDICARE_RATE + excessMonthly * ADDL_MEDICARE_RATE,
      6
    );
  });

  it("applies a flat state rate to wages minus traditional TSP", () => {
    const r = computeTakeHome({ ...E5_INPUT, stateTaxRatePct: 0.05 });
    expect(r.stateTaxMonthly).toBeCloseTo(0.05 * (4299.9 - 4299.9 * 0.05), 6);
  });

  it("clamps pathological inputs (negative pay, >100% TSP, >20% state rate)", () => {
    const r = computeTakeHome({
      ...E5_INPUT,
      basePayMonthly: -100,
      bahMonthly: -1,
      basMonthly: -1,
      tspPct: 5,
      stateTaxRatePct: 0.9,
      sgliMonthly: -3,
    });
    expect(r.grossMonthly).toBe(0);
    expect(r.tspMonthly).toBe(0);
    expect(r.stateTaxMonthly).toBe(0);
    expect(r.sgliMonthly).toBe(0);
    expect(r.federalTaxMonthly).toBe(0);
  });

  it("zero income yields a 0 effective tax rate (no divide-by-zero)", () => {
    const r = computeTakeHome({
      ...E5_INPUT,
      basePayMonthly: 0,
      bahMonthly: 0,
      basMonthly: 0,
      sgliMonthly: 0,
    });
    expect(r.effectiveTaxRate).toBe(0);
    expect(r.takeHomeMonthly).toBe(0);
  });

  it("standard deduction constants match the documented 2026 figures", () => {
    expect(STANDARD_DEDUCTION_2026.single).toBe(16100);
    expect(STANDARD_DEDUCTION_2026.married).toBe(32200);
  });

  // Literal pins (not derived from the exported constants) so a bad annual
  // update fails here even in tests that reuse the constants for expectations.
  it("2026 SSA/IRS constants match the documented figures", () => {
    expect(SS_WAGE_BASE_2026).toBe(184500);
    expect(TSP_ELECTIVE_DEFERRAL_LIMIT_2026).toBe(24500);
    // Both import paths must serve the same single definition.
    expect(TSP_LIMIT_FROM_TSP_MODULE).toBe(TSP_ELECTIVE_DEFERRAL_LIMIT_2026);
  });

  it("2026 single federal bracket boundaries match IRS Rev. Proc. 2025-32", () => {
    const singleBounds = FEDERAL_BRACKETS_2026.single.map((b) => b.upTo);
    expect(singleBounds.slice(0, 4)).toEqual([12400, 50400, 105700, 201775]);
  });
});
