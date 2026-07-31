// Tests for the career-aware projection: promotion schedule → grade → pay →
// contributions, service vs. horizon decoupling, post-service compounding.

import { describe, expect, it } from "vitest";
import {
  gradeAtTis,
  gradeNumber,
  projectCareerWealth,
  upcomingPromotions,
  type CareerProjectionInput,
} from "@/lib/projection/career";
import { type BasePayDataset } from "@/lib/pay/basepay-lookup";
import { TSP_ELECTIVE_DEFERRAL_LIMIT_2026 } from "@/lib/pay/tsp";
import basepay2026 from "@/data/basepay/2026.json";

const ds = basepay2026 as unknown as BasePayDataset;

describe("gradeNumber / gradeAtTis", () => {
  it("parses grade numbers", () => {
    expect(gradeNumber("E-5")).toBe(5);
    expect(gradeNumber("O-3")).toBe(3);
  });

  it("follows the Army enlisted schedule", () => {
    expect(gradeAtTis("army", "enlisted", "E-1", 0)).toBe("E-1");
    expect(gradeAtTis("army", "enlisted", "E-1", 6)).toBe("E-2");
    expect(gradeAtTis("army", "enlisted", "E-1", 36)).toBe("E-5");
    expect(gradeAtTis("army", "enlisted", "E-1", 144)).toBe("E-7");
  });

  it("floors at the member's current grade (never demotes)", () => {
    // Schedule says E-2 at 6 months, but the member is already an E-4.
    expect(gradeAtTis("army", "enlisted", "E-4", 6)).toBe("E-4");
    // Once the schedule passes the member, it takes over.
    expect(gradeAtTis("army", "enlisted", "E-4", 84)).toBe("E-6");
  });

  it("uses the DOPMA schedule for officers", () => {
    expect(gradeAtTis("navy", "officer", "O-1", 18)).toBe("O-2");
    expect(gradeAtTis("navy", "officer", "O-1", 120)).toBe("O-4");
  });
});

describe("upcomingPromotions", () => {
  it("lists promotions between now and separation only", () => {
    // Army E-4 at 4 YOS staying 5 more years: E-5's 36-month point is already
    // behind them, so it shows as due now rather than being dropped (the model
    // pays that grade either way); E-6 at 84mo TIS = 36 months from now.
    // E-7 (144mo) is beyond 9 YOS.
    const promos = upcomingPromotions("army", "enlisted", "E-4", 4, 5);
    expect(promos.map((p) => ({ monthIndex: p.monthIndex, toGrade: p.toGrade }))).toEqual([
      { monthIndex: 0, toGrade: "E-5" },
      { monthIndex: 36, toGrade: "E-6" },
    ]);
    expect(promos[0].behindSchedule).toBe(true);
    expect(promos[1].behindSchedule).toBe(false);
  });

  it("skips grades at or below the current grade", () => {
    const promos = upcomingPromotions("army", "enlisted", "E-6", 4, 10);
    expect(promos.map((p) => p.toGrade)).toEqual(["E-7"]);
  });

  it("returns nothing when staying 0 years", () => {
    expect(upcomingPromotions("army", "enlisted", "E-4", 4, 0)).toEqual([]);
  });
});

const BASE: CareerProjectionInput = {
  basepay: ds,
  branch: "army",
  track: "enlisted",
  currentGrade: "E-4",
  currentYosYears: 4,
  serviceYearsRemaining: 5,
  modelPromotions: true,
  annualPayRaise: 0,
  projectionYears: 5,
  currentAge: 22,
  tspBalance: 0,
  tspPct: 0.05,
  brs: true,
  tspReturn: 0,
  invBalance: 0,
  invMonthly: 0,
  invMonthlyAfter: 0,
  invReturn: 0,
  savBalance: 0,
  savMonthly: 0,
  savMonthlyAfter: 0,
  savReturn: 0,
  inflation: 0,
};

describe("projectCareerWealth", () => {
  it("promotes on schedule and pays the table rate for the new grade", () => {
    const r = projectCareerWealth(BASE);
    // Year 1–3 an E-5 (schedule floor passed E-5 at 36mo TIS; member is E-4
    // at 48mo → schedule already says E-5 at 48mo TIS).
    expect(r.years[0].grade).toBe("E-5");
    // E-6 pins at 84mo TIS = month 36 → year 4 ends as E-6.
    expect(r.years[3].grade).toBe("E-6");
    // Year-end base pay matches the DFAS table at that grade/YOS.
    // Year 1 end: E-5 at 5 YOS → over-4 column = 3,946.80.
    expect(r.years[0].basePayMonthly).toBeCloseTo(3946.8, 1);
  });

  it("with 0% returns, TSP equals summed contributions (employee + 5% BRS)", () => {
    const r = projectCareerWealth(BASE);
    // 10% of every month's base pay (5% employee + 5% agency at full match).
    const expected = r.payTimeline.reduce((a, p) => a + p.basePayMonthly * 0.1, 0);
    expect(r.final.balances.tsp).toBeCloseTo(expected, 6);
    expect(r.totals.agencyMatch).toBeCloseTo(expected / 2, 6);
  });

  it("stops TSP contributions at separation but keeps compounding to the horizon", () => {
    const r = projectCareerWealth({
      ...BASE,
      serviceYearsRemaining: 2,
      projectionYears: 10,
      tspReturn: 0.07,
    });
    const atSep = r.years[1];
    const after = r.years.slice(2);
    expect(atSep.serving).toBe(true);
    expect(after.every((y) => !y.serving)).toBe(true);
    // No contributions after separation → each later year grows by exactly 7%.
    for (let k = 0; k < after.length; k++) {
      const prev = k === 0 ? atSep : after[k - 1];
      expect(after[k].balances.tsp).toBeCloseTo(prev.balances.tsp * 1.07, 4);
      expect(after[k].yearContributions).toBe(0);
    }
    expect(r.final.age).toBe(32);
  });

  it("switches taxable contributions to the post-service pace", () => {
    const r = projectCareerWealth({
      ...BASE,
      serviceYearsRemaining: 1,
      projectionYears: 3,
      invMonthly: 100,
      invMonthlyAfter: 400,
    });
    expect(r.years[0].balances.invest).toBeCloseTo(1200, 6);
    expect(r.years[1].balances.invest).toBeCloseTo(1200 + 4800, 6);
  });

  it("clamps the horizon to at least the service window", () => {
    const r = projectCareerWealth({ ...BASE, serviceYearsRemaining: 8, projectionYears: 3 });
    expect(r.years).toHaveLength(8);
    expect(r.separationMonth).toBe(96);
  });

  it("applies the annual pay raise on top of table pay", () => {
    const flat = projectCareerWealth({ ...BASE, modelPromotions: false });
    const raised = projectCareerWealth({ ...BASE, modelPromotions: false, annualPayRaise: 0.03 });
    // Year-2 pay = table pay × 1.03 (raise applies from the second year).
    expect(raised.years[1].basePayMonthly).toBeCloseTo(flat.years[1].basePayMonthly * 1.03, 4);
    expect(raised.years[0].basePayMonthly).toBeCloseTo(flat.years[0].basePayMonthly, 4);
  });

  it("modelPromotions=false keeps the current grade but honors YOS pay steps", () => {
    const r = projectCareerWealth({ ...BASE, modelPromotions: false });
    expect(r.years.every((y) => y.grade === "E-4")).toBe(true);
    expect(r.promotions).toEqual([]);
    // E-4 pay still steps up at the 6-YOS column.
    expect(r.years[2].basePayMonthly).toBeGreaterThan(r.years[0].basePayMonthly);
  });

  it("reports the separation snapshot and ages", () => {
    const r = projectCareerWealth({ ...BASE, projectionYears: 38 }); // to age 60
    expect(r.atSeparation?.yearIndex).toBe(5);
    expect(r.atSeparation?.age).toBe(27);
    expect(r.final.age).toBe(60);
  });

  it("accumulates the employee TSP share alongside the agency match", () => {
    const r = projectCareerWealth(BASE);
    // 5% employee of every month's base pay; agency adds another 5% at full match.
    const expected = r.payTimeline.reduce((a, p) => a + p.basePayMonthly * 0.05, 0);
    expect(r.totals.employeeTsp).toBeCloseTo(expected, 6);
    expect(r.totals.employeeTsp + r.totals.agencyMatch).toBeCloseTo(
      r.final.balances.tsp,
      6
    );
  });

  it("caps 401(k) employee contributions at the elective-deferral limit; match rides on top", () => {
    const capMonthly = TSP_ELECTIVE_DEFERRAL_LIMIT_2026 / 12;
    const r = projectCareerWealth({
      ...BASE,
      serviceYearsRemaining: 0,
      projectionYears: 1,
      k401Monthly: capMonthly * 4, // hand-typed way over the IRS limit
      k401MatchMonthly: 300,
      k401UntilAge: 99,
      k401Return: 0,
    });
    expect(r.final.balances.k401).toBeCloseTo((capMonthly + 300) * 12, 6);
  });

  it("leaves under-limit 401(k) contributions (and the match) untouched", () => {
    const r = projectCareerWealth({
      ...BASE,
      serviceYearsRemaining: 0,
      projectionYears: 2,
      k401Monthly: 500,
      k401MatchMonthly: 200,
      k401UntilAge: 99,
      k401Return: 0,
    });
    expect(r.final.balances.k401).toBeCloseTo(700 * 24, 6);
  });
});
