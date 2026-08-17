// Tests for the comprehensive trade-space analysis.
//
// Two things matter most here. First, DIRECTION: a member who reaches 20 years
// by staying must come out ahead, because the pension is the single largest
// asset in the comparison and the projector's own headline total leaves it out
// entirely. The exact dollar gap is a function of a dozen assumptions and is
// deliberately not pinned. Second, DEGRADATION: the analysis is fed an export
// payload that legitimately arrives with optional sections missing, and it must
// come back honest and incomplete rather than confident and wrong.

import { describe, expect, it } from "vitest";
import type { ProjectionExport, ProjectionYearLine } from "@/lib/export/projection";
import { analyzeTradeSpace, type AnalysisSection } from "@/lib/projection/trade-space";
import { IRA_CONTRIBUTION_LIMIT_2026 } from "@/lib/pay/ira";
import { TSP_ELECTIVE_DEFERRAL_LIMIT_2026 } from "@/lib/pay/tsp";

// --------------------------------------------------------------- fixtures ---

const RETURN_PCT = 7;
const INFLATION_PCT = 2.5;
const RAISE_PCT = 3;
/** tspPct 5% + BRS automatic 1% + 4% match = 10% of basic pay into the TSP. */
const MILITARY_PCT_OF_BASE = 0.1;
const SERVING_RESIDUAL_ANNUAL = 3000;
const CIVILIAN_ANNUAL = 9600;

function makeYears(o: {
  currentAge: number;
  startYear: number;
  projectionYears: number;
  serviceYears: number;
  startBalance: number;
  baseMonthly: number;
}): ProjectionYearLine[] {
  const rows: ProjectionYearLine[] = [];
  let balance = o.startBalance;
  for (let i = 0; i < o.projectionYears; i++) {
    const serving = i < o.serviceYears;
    const basePayMonthly = serving ? o.baseMonthly * Math.pow(1 + RAISE_PCT / 100, i) : 0;
    const contribution = serving
      ? MILITARY_PCT_OF_BASE * basePayMonthly * 12 + SERVING_RESIDUAL_ANNUAL
      : CIVILIAN_ANNUAL;
    balance = balance * (1 + RETURN_PCT / 100) + contribution;
    rows.push({
      year: o.startYear + i + 1,
      age: o.currentAge + i + 1,
      serving,
      grade: "E-6",
      basePayMonthly,
      tsp: balance,
      ira: 0,
      k401: 0,
      invest: 0,
      savings: 0,
      total: balance,
      realTotal: balance / Math.pow(1 + INFLATION_PCT / 100, i + 1),
    });
  }
  return rows;
}

function makeExport(over: {
  yos?: number;
  serviceYears?: number;
  currentAge?: number;
  projectionYears?: number;
  brs?: boolean;
  withRoth?: boolean;
  withPension?: boolean;
  years?: ProjectionYearLine[];
} = {}): ProjectionExport {
  const yos = over.yos ?? 12;
  const serviceYears = over.serviceYears ?? 4;
  const currentAge = over.currentAge ?? 32;
  const projectionYears = over.projectionYears ?? 25;
  const startYear = 2026;
  const years =
    over.years ??
    makeYears({
      currentAge,
      startYear,
      projectionYears,
      serviceYears,
      startBalance: 50000,
      baseMonthly: 5000,
    });
  const last = years[years.length - 1];

  return {
    generatedOn: "2026-08-17",
    scenario: {
      branchLabel: "Army",
      track: "enlisted",
      grade: "E-6",
      yos,
      currentAge,
      serviceYears,
      projectionYears,
      endYear: startYear + projectionYears,
      tspPct: 0.05,
      brs: over.brs ?? true,
      tspReturnPct: RETURN_PCT,
      invReturnPct: RETURN_PCT,
      savApyPct: RETURN_PCT,
      iraReturnPct: RETURN_PCT,
      k401Monthly: CIVILIAN_ANNUAL / 12,
      k401ReturnPct: RETURN_PCT,
      inflationPct: INFLATION_PCT,
      payRaisePct: RAISE_PCT,
      modelPromotions: true,
    },
    promotions: [],
    years,
    totals: {
      final: last?.total ?? 0,
      finalReal: last?.realTotal ?? 0,
      atSeparation: years[serviceYears - 1]?.total ?? null,
      separationYear: years[serviceYears - 1]?.year ?? null,
      contributed: 200000,
      growth: (last?.total ?? 0) - 200000,
      agencyMatch: 40000,
      employeeTsp: 60000,
    },
    ...(over.withPension
      ? {
          pension: {
            multiplierPct: 2.0,
            serviceYearsTotal: yos + serviceYears,
            high3MonthlyBase: 6000,
            monthlyPension: 2400,
            note: "Ballpark.",
          },
        }
      : {}),
    ...(over.withRoth === false
      ? {}
      : {
          rothTradeoff: {
            monthlyContribution: 500,
            yearsContributing: 20,
            yearsToWithdrawal: 30,
            annualReturnPct: 7,
            taxRateNowPct: 12,
            taxRateAtWithdrawalPct: 22,
            preTaxBalance: 400000,
            taxPaidUpFront: 14400,
            deferredTaxBill: 88000,
            rothAfterTax: 400000,
            tradAfterTax: 312000,
            winner: "roth",
            advantage: 40000,
          },
        }),
  };
}

// -------------------------------------------------------- shared invariants ---

/** Every section must be renderable by a format that knows nothing about it. */
function assertRenderable(section: AnalysisSection) {
  expect(section.id).toBeTruthy();
  expect(section.title).toBeTruthy();
  expect(section.headline).toBeTruthy();

  for (const metric of section.metrics) {
    expect(metric.key, `${section.id} metric key`).toBeTruthy();
    expect(metric.label, `${section.id}/${metric.key} label`).toBeTruthy();
    expect(metric.explanation, `${section.id}/${metric.key} explanation`).toBeTruthy();
    if (metric.unit !== "text") {
      expect(typeof metric.value, `${section.id}/${metric.key} value type`).toBe("number");
      expect(Number.isFinite(metric.value as number), `${section.id}/${metric.key} finite`).toBe(true);
    }
    if (metric.realValue !== undefined) expect(Number.isFinite(metric.realValue)).toBe(true);
  }

  for (const assumption of section.assumptions) {
    expect(assumption.key).toBeTruthy();
    expect(assumption.label).toBeTruthy();
    expect(assumption.explanation).toBeTruthy();
    if (assumption.unit !== "text") expect(typeof assumption.value).toBe("number");
  }

  for (const caveat of section.caveats) {
    expect(caveat.key).toBeTruthy();
    expect(caveat.text.length).toBeGreaterThan(10);
  }

  for (const table of section.tables) {
    const keys = table.columns.map((col) => col.key);
    expect(keys.length).toBeGreaterThan(0);
    for (const col of table.columns) expect(col.label).toBeTruthy();
    for (const row of table.rows) {
      for (const key of keys) {
        expect(row[key], `${section.id}/${table.key} row missing ${key}`).not.toBeUndefined();
      }
    }
    // A bar scale that names a column the table does not have would silently
    // render nothing in Excel.
    for (const key of table.sharedBarScale ?? []) expect(keys).toContain(key);
  }

  for (const chart of section.charts) {
    expect(chart.series.length).toBeGreaterThan(0);
    for (const s of chart.series) {
      expect(s.label).toBeTruthy();
      expect(s.points.length).toBeGreaterThan(0);
      for (const pt of s.points) {
        expect(Number.isFinite(pt.x)).toBe(true);
        expect(Number.isFinite(pt.y)).toBe(true);
      }
    }
  }
}

// ------------------------------------------------------------------ tests ---

describe("analyzeTradeSpace — structure", () => {
  it("returns every section, and sections[] holds the same objects as the fields", () => {
    const r = analyzeTradeSpace(makeExport());
    expect(r.generatedOn).toBe("2026-08-17");
    expect(r.sections.map((s) => s.id)).toEqual([
      "stay-vs-leave",
      "military-retirement",
      "roth-vs-traditional",
      "ira-placement",
    ]);
    expect(r.sections).toContain(r.stayVsLeave);
    expect(r.sections).toContain(r.retirement);
    expect(r.sections).toContain(r.rothVsTraditional);
    expect(r.sections).toContain(r.ira);
  });

  it("emits data every format can render without parsing prose", () => {
    const r = analyzeTradeSpace(makeExport());
    for (const section of r.sections) assertRenderable(section);
    expect(r.assumptions.length).toBeGreaterThan(0);
    expect(r.caveats.length).toBeGreaterThan(0);
  });

  it("pairs columns that must share one bar scale", () => {
    const r = analyzeTradeSpace(makeExport());
    const byYear = r.stayVsLeave?.tables.find((t) => t.key === "stay-vs-leave-by-year");
    expect(byYear?.sharedBarScale).toEqual(["stay", "leave"]);
  });
});

describe("stay vs leave — a member who reaches 20 by staying", () => {
  const r = analyzeTradeSpace(makeExport({ yos: 12, serviceYears: 4 }));
  const sl = r.stayVsLeave!;

  it("builds the staying arm as the counterfactual and keeps the modelled path as leaving", () => {
    expect(sl.comparable).toBe(true);
    expect(sl.stay?.source).toBe("counterfactual");
    expect(sl.leave?.source).toBe("modelled");
    expect(sl.stay?.yosAtSeparation).toBe(20);
    expect(sl.leave?.yosAtSeparation).toBe(16);
  });

  it("gives the pension only to the arm that reaches 20 years", () => {
    expect(sl.stay?.reachesRetirement).toBe(true);
    expect(sl.stay?.pension).not.toBeNull();
    expect(sl.leave?.reachesRetirement).toBe(false);
    expect(sl.leave?.pension).toBeNull();
    expect(sl.stay!.pension!.estimate.retiredPayPct).toBeCloseTo(40, 10);
  });

  it("starts retired pay immediately at separation, not at 60", () => {
    const pension = sl.stay!.pension!;
    expect(pension.startAge).toBe(sl.stay!.separationAge);
    expect(pension.startAge).toBeLessThan(60);
  });

  it("puts staying ahead, and it stays ahead", () => {
    expect(sl.breakEven?.never).toBe(false);
    expect(sl.breakEven?.holdsThroughHorizon).toBe(true);
    expect(sl.breakEven?.age).not.toBeNull();
    expect(sl.breakEven!.gapAtEnd).toBeGreaterThan(0);
    expect(sl.breakEven!.gapAtEndReal).toBeGreaterThan(0);
    expect(sl.stay!.totalPositionAtEnd).toBeGreaterThan(sl.leave!.totalPositionAtEnd);
  });

  it("surfaces the age retired pay starts, which is the real discontinuity", () => {
    const retirementAge = sl.metrics.find((mt) => mt.key === "retirement-age");
    expect(retirementAge?.value).toBe(sl.stay!.pension!.startAge);
    expect(retirementAge?.unit).toBe("age");
  });

  it("does not look for a break-even before the two paths diverge", () => {
    const divergenceAge = r.stayVsLeave!.leave!.separationAge;
    expect(sl.breakEven!.age!).toBeGreaterThan(divergenceAge);
  });

  it("keeps both arms identical up to the divergence year", () => {
    const sepIdx = sl.leave!.separationIndex;
    for (let i = 0; i <= sepIdx; i++) {
      expect(sl.series[i].stayBalance).toBeCloseTo(sl.series[i].leaveBalance, 6);
    }
    expect(sl.series[sepIdx + 1].stayBalance).not.toBeCloseTo(sl.series[sepIdx + 1].leaveBalance, 2);
  });

  it("reports the comparison in both nominal and today's dollars", () => {
    const end = sl.series[sl.series.length - 1];
    expect(end.stayTotalPositionReal).toBeLessThan(end.stayTotalPosition);
    expect(sl.stay!.totalPositionAtEndReal).toBeLessThan(sl.stay!.totalPositionAtEnd);
    const gap = sl.metrics.find((m) => m.key === "verdict-gap");
    expect(gap?.realValue).toBeDefined();
  });

  it("separates the pension from the balance so the two are never conflated", () => {
    const end = sl.series[sl.series.length - 1];
    expect(end.stayTotalPosition).toBeCloseTo(end.stayBalance + sl.stay!.pensionNestEggAtEnd, 4);
    expect(end.leaveTotalPosition).toBeCloseTo(end.leaveBalance, 6);
    expect(sl.leave!.pensionNestEggAtEnd).toBe(0);
  });

  it("says which arm the user actually modelled, and holds one tax basis", () => {
    const keys = sl.assumptions.map((a) => a.key);
    expect(keys).toContain("arms");
    expect(keys).toContain("tax-basis");
    expect(keys).toContain("civilian-saving");
    expect(sl.assumptions.find((a) => a.key === "tax-basis")?.value).toBe("pre-tax");
  });

  it("carries the caveats that cannot be quantified", () => {
    const keys = sl.caveats.map((cav) => cav.key);
    expect(keys).toContain("civilian-salary");
    expect(keys).toContain("not-your-choice");
    expect(keys).toContain("cliff");
    expect(sl.caveats.some((cav) => cav.severity === "cannot-quantify")).toBe(true);
  });
});

describe("stay vs leave — a scenario that already serves a full career", () => {
  const r = analyzeTradeSpace(makeExport({ yos: 16, serviceYears: 4 }));
  const sl = r.stayVsLeave!;

  it("flips the arms: the modelled path is staying, the counterfactual leaves early", () => {
    expect(sl.comparable).toBe(true);
    expect(sl.stay?.source).toBe("modelled");
    expect(sl.leave?.source).toBe("counterfactual");
    expect(sl.stay?.yosAtSeparation).toBe(20);
    expect(sl.leave?.yosAtSeparation).toBe(17);
    expect(sl.leave?.pension).toBeNull();
  });

  it("still puts staying ahead — the 20-year cliff is the whole comparison", () => {
    expect(sl.breakEven!.gapAtEnd).toBeGreaterThan(0);
    expect(sl.breakEven?.never).toBe(false);
  });
});

describe("stay vs leave — extra service is modelled conservatively", () => {
  it("grows basic pay by the pay raise only, adding no promotions past the modelled window", () => {
    const p = makeExport({ yos: 12, serviceYears: 4 });
    const sl = analyzeTradeSpace(p).stayVsLeave!;
    const pension = sl.stay!.pension!;
    const lastModelledPay = p.years[3].basePayMonthly;
    // Four more years at 3%/yr: the High-3 must land between the last modelled
    // pay and that pay compounded over the whole extension.
    expect(pension.high3.monthlyBase).toBeGreaterThan(lastModelledPay);
    expect(pension.high3.monthlyBase).toBeLessThan(lastModelledPay * Math.pow(1.03, 4));
  });

  it("uses the annual-snapshot High-3, not a final-pay proxy, when pay history exists", () => {
    const sl = analyzeTradeSpace(makeExport()).stayVsLeave!;
    expect(sl.stay!.pension!.high3.source).toBe("annual-basic-pay");
    expect(sl.stay!.pension!.high3.exact).toBe(false);
  });

  it("comes out below a final-pay proxy, which is the point of correcting it", () => {
    const p = makeExport({ yos: 12, serviceYears: 4 });
    const sl = analyzeTradeSpace(p).stayVsLeave!;
    const finalServingPay = p.years[3].basePayMonthly * Math.pow(1.03, 4);
    expect(sl.stay!.pension!.high3.monthlyBase).toBeLessThan(finalServingPay);
  });
});

describe("military retirement section", () => {
  it("prices the modelled career's own pension and bridges it to a nest egg", () => {
    const r = analyzeTradeSpace(makeExport({ yos: 16, serviceYears: 4 }));
    const pension = r.retirement!.pension!;
    expect(pension.estimate.eligible).toBe(true);
    expect(pension.estimate.retiredPayPct).toBeCloseTo(40, 10);
    expect(pension.nestEggEquivalent).toBeCloseTo(pension.estimate.annualPension / 0.04, 4);
    expect(pension.presentValue).toBeGreaterThan(0);
    expect(pension.lifetimeNominal).toBeGreaterThan(pension.presentValue);
  });

  it("uses the full CPI as the COLA, never CPI minus 1%", () => {
    const p = makeExport({ yos: 16, serviceYears: 4 });
    const cola = analyzeTradeSpace(p).retirement!.assumptions.find((a) => a.key === "cola");
    expect(cola?.value).toBe(p.scenario.inflationPct);
    expect(cola?.explanation).toMatch(/FULL CPI/);
  });

  it("keeps the pension's real value flat across retirement", () => {
    const r = analyzeTradeSpace(makeExport({ yos: 16, serviceYears: 4 }));
    const real = r.retirement!.charts.find((ch) => ch.key === "pension-stream")!.series.find(
      (s) => s.key === "real"
    )!;
    const first = real.points[0].y;
    const last = real.points[real.points.length - 1].y;
    // Discounted from today rather than from retirement, so it steps down once
    // and then holds — the ratio between consecutive retirement years is 1.
    const midA = real.points[5].y;
    const midB = real.points[6].y;
    expect(midB / midA).toBeCloseTo(1, 6);
    expect(last).toBeLessThan(first * 1.0001);
    expect(last).toBeGreaterThan(first * 0.9999);
  });

  it("shows both systems side by side but never as a choice", () => {
    const r = analyzeTradeSpace(makeExport({ yos: 16, serviceYears: 4 }));
    const rows = r.retirement!.systemComparison;
    expect(rows.map((x) => x.multiplierPct)).toEqual([2.0, 2.5]);
    expect(rows[1].monthlyPension).toBeCloseTo(rows[0].monthlyPension * 1.25, 6);
    const systemNote = r.retirement!.assumptions.find((a) => a.key === "system");
    expect(systemNote?.explanation).toMatch(/not a choice/i);
  });

  it("reports a zero pension and names the cliff when the career stops short", () => {
    const r = analyzeTradeSpace(makeExport({ yos: 12, serviceYears: 4 }));
    expect(r.retirement!.pension).toBeNull();
    const headlineMetric = r.retirement!.metrics.find((mt) => mt.key === "monthly-pension");
    expect(headlineMetric?.value).toBe(0);
    expect(headlineMetric?.explanation).toMatch(/cliff/i);
    expect(r.retirement!.headline).toMatch(/No defined-benefit pension/i);
  });

  it("offers continuation pay as a range for BRS members only", () => {
    const brs = analyzeTradeSpace(makeExport({ brs: true }));
    expect(brs.retirement!.tables.some((t) => t.key === "continuation-pay")).toBe(true);
    const legacy = analyzeTradeSpace(makeExport({ brs: false }));
    expect(legacy.retirement!.tables.some((t) => t.key === "continuation-pay")).toBe(false);
  });

  it("prefers real pay history over the payload's final-pay pension proxy", () => {
    const withProxy = analyzeTradeSpace(makeExport({ yos: 16, serviceYears: 4, withPension: true }));
    expect(withProxy.retirement!.pension!.high3.source).toBe("annual-basic-pay");
    expect(withProxy.retirement!.pension!.high3.monthlyBase).not.toBe(6000);
  });
});

describe("roth vs traditional", () => {
  it("reuses the shipping engine and recovers the per-year series", () => {
    const r = analyzeTradeSpace(makeExport()).rothVsTraditional!;
    expect(r.complete).toBe(true);
    expect(r.winner).toBe("roth");
    expect(r.breakevenRatePct).toBe(12); // today's marginal rate
    const table = r.tables.find((t) => t.key === "roth-by-year")!;
    expect(table.rows.length).toBe(30);
    expect(table.sharedBarScale).toEqual(["taxPaidUpFront", "deferredTaxBill"]);
  });

  it("shows the deferred tax bill outgrowing the up-front tax", () => {
    const r = analyzeTradeSpace(makeExport()).rothVsTraditional!;
    const chart = r.charts.find((ch) => ch.key === "tax-wedge")!;
    const upFront = chart.series.find((s) => s.key === "roth-tax")!.points;
    const deferred = chart.series.find((s) => s.key === "trad-tax")!.points;
    expect(deferred[deferred.length - 1].y).toBeGreaterThan(upFront[upFront.length - 1].y);
  });

  it("carries the combat-zone angle a civilian calculator would miss", () => {
    const r = analyzeTradeSpace(makeExport()).rothVsTraditional!;
    const text = r.caveats.map((cav) => cav.text).join(" ");
    expect(text).toMatch(/combat/i);
    expect(text).toMatch(/CZTE/);
    expect(text).toMatch(/match/i);
  });
});

describe("IRA placement", () => {
  const r = analyzeTradeSpace(makeExport()).ira!;

  it("states the two separate limits and the combined room", () => {
    expect(r.annualIraLimit).toBe(IRA_CONTRIBUTION_LIMIT_2026);
    expect(r.annualTspLimit).toBe(TSP_ELECTIVE_DEFERRAL_LIMIT_2026);
    expect(r.combinedTaxAdvantagedRoom).toBe(IRA_CONTRIBUTION_LIMIT_2026 + TSP_ELECTIVE_DEFERRAL_LIMIT_2026);
  });

  it("orders the match ahead of everything else", () => {
    expect(r.ordering[0].rank).toBe(1);
    expect(r.ordering[0].step).toMatch(/TSP/);
    expect(r.ordering[0].why).toMatch(/match/i);
    expect(r.ordering[1].step).toMatch(/IRA/);
    expect(r.ordering.map((o) => o.rank)).toEqual([1, 2, 3, 4]);
  });

  it("adapts the ordering rationale for a legacy High-3 member with no match", () => {
    const legacy = analyzeTradeSpace(makeExport({ brs: false })).ira!;
    expect(legacy.ordering[0].why).toMatch(/no agency contributions|no match/i);
  });

  it("says what it cannot know about the user's IRA", () => {
    const keys = r.caveats.map((cav) => cav.key);
    expect(keys).toContain("ira-type-unknown");
    expect(keys).toContain("no-magi");
    expect(keys).toContain("separate-limits");
  });
});

describe("graceful degradation", () => {
  it("returns an incomplete Roth section rather than inventing inputs", () => {
    const r = analyzeTradeSpace(makeExport({ withRoth: false }));
    const roth = r.rothVsTraditional!;
    expect(roth.complete).toBe(false);
    expect(roth.winner).toBeNull();
    expect(roth.breakevenRatePct).toBeNull();
    expect(roth.metrics).toEqual([]);
    expect(roth.caveats.some((cav) => cav.key === "roth-missing")).toBe(true);
    assertRenderable(roth);
  });

  it("survives a payload with no projected years at all", () => {
    const p = makeExport({ years: [] });
    const r = analyzeTradeSpace(p);
    expect(r.stayVsLeave).toBeNull();
    expect(r.retirement).toBeNull();
    expect(r.ira).not.toBeNull();
    for (const section of r.sections) assertRenderable(section);
  });

  it("declines the comparison when the horizon leaves no room to serve on", () => {
    const p = makeExport({ yos: 12, serviceYears: 3, projectionYears: 3 });
    const sl = analyzeTradeSpace(p).stayVsLeave!;
    expect(sl.comparable).toBe(false);
    expect(sl.complete).toBe(false);
    expect(sl.stay).toBeNull();
    expect(sl.series).toEqual([]);
    expect(sl.caveats.some((cav) => cav.severity === "cannot-quantify")).toBe(true);
    assertRenderable(sl);
  });

  it("declines the comparison when the member is already out", () => {
    const p = makeExport({ yos: 12, serviceYears: 0 });
    const sl = analyzeTradeSpace(p).stayVsLeave!;
    expect(sl.comparable).toBe(false);
    expect(sl.headline).toBeTruthy();
  });

  it("works without the optional pension, fees and long-term sections", () => {
    const p = makeExport({ yos: 16, serviceYears: 4, withPension: false });
    expect(p.pension).toBeUndefined();
    expect(p.fees).toBeUndefined();
    expect(p.longTerm).toBeUndefined();
    const r = analyzeTradeSpace(p);
    expect(r.retirement!.pension).not.toBeNull();
    for (const section of r.sections) assertRenderable(section);
  });

  it("flags a missing civilian saving rate instead of silently flattering staying", () => {
    const p = makeExport({ yos: 12, serviceYears: 4 });
    // Strip every civilian cash flow: balances just compound after separation.
    delete p.scenario.k401Monthly;
    delete p.scenario.iraMonthly;
    let balance = p.years[3].total;
    for (let i = 4; i < p.years.length; i++) {
      balance *= 1 + RETURN_PCT / 100;
      p.years[i] = { ...p.years[i], tsp: balance, total: balance };
    }
    const sl = analyzeTradeSpace(p).stayVsLeave!;
    expect(sl.caveats.some((cav) => cav.key === "no-civilian-saving")).toBe(true);
  });

  it("honours caller overrides for the life-expectancy and withdrawal assumptions", () => {
    const p = makeExport({ yos: 16, serviceYears: 4 });
    const base = analyzeTradeSpace(p);
    const longer = analyzeTradeSpace(p, { lifeExpectancyAge: 95, withdrawalRatePct: 3 });
    expect(longer.retirement!.pension!.lifetimeNominal).toBeGreaterThan(
      base.retirement!.pension!.lifetimeNominal
    );
    // A lower safe withdrawal rate means the pension is worth MORE capital.
    expect(longer.retirement!.pension!.nestEggEquivalent).toBeGreaterThan(
      base.retirement!.pension!.nestEggEquivalent
    );
    expect(longer.assumptions.find((a) => a.key === "life-expectancy")?.source).toBe("caller");
  });

  it("lets the caller pick a different stay target", () => {
    const p = makeExport({ yos: 16, serviceYears: 4, projectionYears: 30 });
    const sl = analyzeTradeSpace(p, { stayToYos: 24 }).stayVsLeave!;
    expect(sl.stay?.source).toBe("counterfactual");
    expect(sl.stay?.yosAtSeparation).toBe(24);
    expect(sl.stay!.pension!.estimate.retiredPayPct).toBeCloseTo(48, 10);
  });
});

