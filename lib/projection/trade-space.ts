// lib/projection/trade-space.ts
// The comprehensive trade-space analysis: stay in vs. get out, Roth vs.
// Traditional, and where an IRA fits alongside the TSP.
//
// Pure functions over the export payload. NOTHING here formats a string for a
// particular output — every result is a record carrying a number, a unit, and
// a plain-English explanation, so CSV, TXT, PDF and XLSX can each render it
// natively (a table row, a stat band, a chart series, a data bar) without
// re-deriving anything or parsing prose.
//
// Three rules this module holds to, because getting them wrong actively
// misleads a stay-or-go decision:
//
//   1. THE PENSION MUST BE IN THE COMPARISON. The projector's headline total
//      is identical whether you serve 19 years or 20, because the pension is
//      an income stream and not a balance. Left out, the entire economic case
//      for staying is invisible. It is capitalized here at the same
//      sustainable-withdrawal rate the tool already uses for its 4%-rule line,
//      so the two numbers sit on one scale.
//   2. ONE TAX BASIS, STATED. A fully-taxable pension, a pre-tax Traditional
//      balance and an after-tax Roth balance are not additive. Everything in
//      the stay-vs-leave comparison is PRE-TAX, and says so; the after-tax
//      view lives only in the Roth section, where the user supplied a
//      withdrawal-time tax rate.
//   3. COUNTERFACTUALS ARE LABELLED. Exactly one arm of the stay-vs-leave
//      comparison is the scenario the user actually modelled. The other is
//      built here from documented assumptions, and every one of them is
//      returned as data alongside the numbers.
//
// Planning estimates only.

import type { ProjectionExport, ProjectionYearLine } from "@/lib/export/projection";
import { computeRothTradeoff, ROTH_TRADEOFF_CAVEATS } from "@/lib/projection/roth-tradeoff";
import { BRS_AUTOMATIC_PCT, brsMatchPct } from "@/lib/pay/tsp-pacing";
import { IRA_CATCH_UP_LIMIT_50_PLUS_2026, IRA_CONTRIBUTION_LIMIT_2026 } from "@/lib/pay/ira";
import {
  TSP_ANNUAL_ADDITIONS_LIMIT_2026,
  TSP_CATCH_UP_LIMIT_50_PLUS_2026,
  TSP_ELECTIVE_DEFERRAL_LIMIT_2026,
} from "@/lib/pay/tsp";
import {
  BRS_LUMP_SUM_NOTES,
  CONTINUATION_PAY_WINDOW,
  DEFAULT_LIFE_EXPECTANCY_AGE,
  DEFAULT_SAFE_WITHDRAWAL_RATE_PCT,
  MILITARY_RETIREMENT_CAVEATS,
  REGULAR_RETIREMENT_YEARS,
  RETIRED_PAY_TAX_NOTES,
  RETIREMENT_MULTIPLIER_PCT,
  continuationPay,
  high3MonthlyBase,
  lifetimePensionTotal,
  monthlyPension,
  pensionAsNestEgg,
  pensionPresentValue,
  type High3Result,
  type PensionEstimate,
  type RetirementSystem,
} from "@/lib/projection/military-retirement";

// ------------------------------------------------------------ data shapes ---

/** How a numeric value should be read. Renderers map these to their own formats. */
export type MetricUnit =
  | "usd"
  | "usd-per-month"
  | "usd-per-year"
  | "percent"
  | "years"
  | "age"
  | "calendar-year"
  | "count"
  | "text";

/** One reported number, with what it is and what it means. Never pre-formatted. */
export type Metric = {
  key: string;
  label: string;
  value: number | string;
  unit: MetricUnit;
  explanation: string;
  /** The same figure deflated to today's dollars, where that is meaningful. */
  realValue?: number;
  /** Renderers may lead with headline metrics and tuck the rest into a table. */
  emphasis?: "headline" | "normal";
};

/** An input the analysis rests on — shown so the reader can disagree with it. */
export type Assumption = {
  key: string;
  label: string;
  value: number | string;
  unit: MetricUnit;
  explanation: string;
  /** "payload" came from the user's scenario; "default" is this module's. */
  source: "payload" | "default" | "caller" | "statute";
};

export type Caveat = {
  key: string;
  text: string;
  /** "cannot-quantify" marks something real that carries no number here. */
  severity: "info" | "caution" | "cannot-quantify";
};

export type ChartSeries = { key: string; label: string; points: { x: number; y: number }[] };

/** A chart described as data. PNG encoders, sparklines and REPT bars all read this. */
export type AnalysisChart = {
  key: string;
  title: string;
  kind: "line" | "bar" | "grouped-bar";
  xLabel: string;
  xUnit: MetricUnit;
  yLabel: string;
  yUnit: MetricUnit;
  series: ChartSeries[];
};

export type TableColumn = {
  key: string;
  label: string;
  unit: MetricUnit;
  /** Hint that this column reads well as a data bar / in-cell bar. */
  bar?: boolean;
};

export type AnalysisTable = {
  key: string;
  title: string;
  columns: TableColumn[];
  rows: Record<string, number | string>[];
  /**
   * Column keys that must share ONE numeric bar scale. Auto-scaling paired
   * columns independently makes the bars lie about the comparison.
   */
  sharedBarScale?: string[];
};

export type AnalysisSection = {
  id: string;
  title: string;
  /** A one-line verdict. Short by design; the detail is in metrics/tables. */
  headline: string;
  /** False when an input was missing and the section degraded. */
  complete: boolean;
  metrics: Metric[];
  tables: AnalysisTable[];
  charts: AnalysisChart[];
  assumptions: Assumption[];
  caveats: Caveat[];
};

// ------------------------------------------------------- section payloads ---

export type PensionDetail = {
  system: RetirementSystem;
  estimate: PensionEstimate;
  high3: High3Result;
  /** Age retired pay starts — immediately at separation for active duty. */
  startAge: number;
  startYear: number;
  nestEggEquivalent: number;
  presentValue: number;
  lifetimeNominal: number;
};

export type RetirementAnalysis = AnalysisSection & {
  /** The pension the modelled career actually earns, or null below 20 years. */
  pension: PensionDetail | null;
  /** Both systems side by side, for context only — this is not a choice. */
  systemComparison: { system: RetirementSystem; multiplierPct: number; monthlyPension: number }[];
};

export type ArmSummary = {
  key: "stay" | "leave";
  label: string;
  /** Whether this arm is the user's own scenario or a counterfactual. */
  source: "modelled" | "counterfactual";
  separationIndex: number;
  separationAge: number;
  separationYear: number;
  yosAtSeparation: number;
  reachesRetirement: boolean;
  pension: PensionDetail | null;
  balanceAtEnd: number;
  balanceAtEndReal: number;
  pensionNestEggAtEnd: number;
  totalPositionAtEnd: number;
  totalPositionAtEndReal: number;
};

export type TradeSpacePoint = {
  year: number;
  age: number;
  stayBalance: number;
  leaveBalance: number;
  /** Nominal annual retired pay being received that year (0 before retirement). */
  stayPensionAnnual: number;
  leavePensionAnnual: number;
  /** Balance + the pension's nest-egg equivalent. The comparable figure. */
  stayTotalPosition: number;
  leaveTotalPosition: number;
  stayTotalPositionReal: number;
  leaveTotalPositionReal: number;
};

export type BreakEven = {
  /** First age at which staying's total position overtakes leaving's. */
  age: number | null;
  year: number | null;
  /** True when staying never overtakes inside the projection horizon. */
  never: boolean;
  /** True when, once ahead, staying stays ahead through the horizon. */
  holdsThroughHorizon: boolean;
  gapAtEnd: number;
  gapAtEndReal: number;
};

export type StayVsLeaveAnalysis = AnalysisSection & {
  comparable: boolean;
  stay: ArmSummary | null;
  leave: ArmSummary | null;
  breakEven: BreakEven | null;
  series: TradeSpacePoint[];
};

export type RothAnalysis = AnalysisSection & {
  winner: "roth" | "traditional" | "even" | null;
  advantage: number;
  breakevenRatePct: number | null;
};

export type IraAnalysis = AnalysisSection & {
  annualIraLimit: number;
  annualTspLimit: number;
  combinedTaxAdvantagedRoom: number;
  /** Ranked ordering of where the next dollar should go. */
  ordering: { rank: number; step: string; why: string }[];
};

export type TradeSpaceAnalysis = {
  generatedOn: string;
  retirement: RetirementAnalysis | null;
  stayVsLeave: StayVsLeaveAnalysis | null;
  rothVsTraditional: RothAnalysis | null;
  ira: IraAnalysis | null;
  /** Every section present, in render order. Same objects as the fields above. */
  sections: AnalysisSection[];
  /** Assumptions that apply across the whole analysis. */
  assumptions: Assumption[];
  /** Things that matter and carry no number here. */
  caveats: Caveat[];
};

/** Every option with its default already applied. Internal to this module. */
type ResolvedOptions = {
  stayToYos: number;
  leaveAtYearIndex?: number;
  lifeExpectancyAge: number;
  withdrawalRatePct: number;
  colaPct: number;
  discountRatePct: number;
  civilianMonthlySavings?: number;
};

export type TradeSpaceOptions = {
  /** Total years of service the STAY arm serves to. Default max(20, modelled). */
  stayToYos?: number;
  /** Projected-year index at which the LEAVE counterfactual separates. */
  leaveAtYearIndex?: number;
  /** Age retired pay is assumed to run through. Default 85. */
  lifeExpectancyAge?: number;
  /** Rate used to capitalize the pension into a nest egg. Default 4%. */
  withdrawalRatePct?: number;
  /** Retired-pay COLA. Defaults to the scenario's inflation (full CPI). */
  colaPct?: number;
  /** Discount rate for present value. Defaults to the scenario's inflation. */
  discountRatePct?: number;
  /** Civilian saving per month once out. Defaults to the modelled civilian pace. */
  civilianMonthlySavings?: number;
};

// ------------------------------------------------------------- small utils ---

const m = (
  key: string,
  label: string,
  value: number | string,
  unit: MetricUnit,
  explanation: string,
  extra?: { realValue?: number; emphasis?: "headline" | "normal" }
): Metric => ({ key, label, value, unit, explanation, ...extra });

const a = (
  key: string,
  label: string,
  value: number | string,
  unit: MetricUnit,
  explanation: string,
  source: Assumption["source"]
): Assumption => ({ key, label, value, unit, explanation, source });

const c = (key: string, text: string, severity: Caveat["severity"] = "info"): Caveat => ({
  key,
  text,
  severity,
});

const notesToCaveats = (prefix: string, notes: string[], severity: Caveat["severity"]): Caveat[] =>
  notes.map((text, i) => c(`${prefix}-${i + 1}`, text, severity));

const finite = (n: number | undefined | null, fallback = 0): number =>
  typeof n === "number" && Number.isFinite(n) ? n : fallback;

/** Last index at which the member is still serving; -1 when never serving. */
function separationIndex(years: readonly ProjectionYearLine[]): number {
  let last = -1;
  for (let i = 0; i < years.length; i++) if (years[i].serving) last = i;
  return last;
}

/**
 * One blended portfolio return, weighted by the account mix at a point in time.
 *
 * The stay-vs-leave counterfactual has to compound a whole portfolio forward
 * without re-running the full per-account engine (which needs pay tables and
 * inputs the export payload does not carry). Weighting each account's assumed
 * return by its share of the balance at the divergence year is the honest
 * simplification: it is exact at that instant and drifts only as the mix does.
 */
function blendedReturnPct(line: ProjectionYearLine, s: ProjectionExport["scenario"]): number {
  const parts: [number, number][] = [
    [Math.max(0, line.tsp), s.tspReturnPct],
    [Math.max(0, line.ira), finite(s.iraReturnPct, s.tspReturnPct)],
    [Math.max(0, line.k401), finite(s.k401ReturnPct, s.invReturnPct)],
    [Math.max(0, line.invest), s.invReturnPct],
    [Math.max(0, line.savings), s.savApyPct],
  ];
  const weight = parts.reduce((acc, [w]) => acc + w, 0);
  if (weight <= 0) return s.tspReturnPct;
  return parts.reduce((acc, [w, r]) => acc + w * r, 0) / weight;
}

/** BRS agency share of base pay: automatic 1% plus the match earned at this election. */
function agencyPctOfBasePay(tspPct: number, brs: boolean): number {
  return brs ? BRS_AUTOMATIC_PCT + brsMatchPct(tspPct) : 0;
}

// ---------------------------------------------------------- retirement ---

function buildPensionDetail(args: {
  servingBasePayByYear: number[];
  yearsOfService: number;
  system: RetirementSystem;
  startAge: number;
  startYear: number;
  lifeExpectancyAge: number;
  withdrawalRatePct: number;
  colaPct: number;
  discountRatePct: number;
  valuationAge: number;
  finalMonthlyBasePayFallback?: number;
}): PensionDetail | null {
  const high3 = high3MonthlyBase({
    annualBasePay: args.servingBasePayByYear,
    finalMonthlyBasePay: args.finalMonthlyBasePayFallback,
  });
  const estimate = monthlyPension({
    high3: high3.monthlyBase,
    yearsOfService: args.yearsOfService,
    system: args.system,
  });
  if (!estimate.eligible || estimate.monthlyPension <= 0) return null;

  const nest = pensionAsNestEgg({
    annualPension: estimate.annualPension,
    withdrawalRatePct: args.withdrawalRatePct,
  });
  const pv = pensionPresentValue({
    monthlyPension: estimate.monthlyPension,
    startAge: args.startAge,
    endAge: args.lifeExpectancyAge,
    colaPct: args.colaPct,
    discountRatePct: args.discountRatePct,
    valuationAge: args.valuationAge,
  });
  const lifetime = lifetimePensionTotal({
    monthlyPension: estimate.monthlyPension,
    startAge: args.startAge,
    endAge: args.lifeExpectancyAge,
    colaPct: args.colaPct,
  });

  return {
    system: args.system,
    estimate,
    high3,
    startAge: args.startAge,
    startYear: args.startYear,
    nestEggEquivalent: nest.nestEggEquivalent,
    presentValue: pv.presentValue,
    lifetimeNominal: lifetime.nominalTotal,
  };
}

function retirementSection(p: ProjectionExport, o: ResolvedOptions): RetirementAnalysis | null {
  const s = p.scenario;
  if (p.years.length === 0) return null;

  const sepIdx = separationIndex(p.years);
  const system: RetirementSystem = s.brs ? "brs" : "high3";
  const yosTotal = s.yos + s.serviceYears;
  const servingPay = p.years.filter((y) => y.serving).map((y) => y.basePayMonthly);
  const sepLine = sepIdx >= 0 ? p.years[sepIdx] : null;

  const detail =
    sepLine === null
      ? null
      : buildPensionDetail({
          servingBasePayByYear: servingPay,
          yearsOfService: yosTotal,
          system,
          startAge: sepLine.age,
          startYear: sepLine.year,
          lifeExpectancyAge: o.lifeExpectancyAge,
          withdrawalRatePct: o.withdrawalRatePct,
          colaPct: o.colaPct,
          discountRatePct: o.discountRatePct,
          valuationAge: s.currentAge,
          finalMonthlyBasePayFallback: p.pension?.high3MonthlyBase,
        });

  // Both systems side by side at the SAME service length, for context only.
  const contextHigh3 = high3MonthlyBase({
    annualBasePay: servingPay,
    finalMonthlyBasePay: p.pension?.high3MonthlyBase,
  });
  const systemComparison = (["brs", "high3"] as RetirementSystem[]).map((sys) => {
    const est = monthlyPension({ high3: contextHigh3.monthlyBase, yearsOfService: yosTotal, system: sys });
    return { system: sys, multiplierPct: est.multiplierPct, monthlyPension: est.monthlyPension };
  });

  const metrics: Metric[] = [];
  const tables: AnalysisTable[] = [];
  const charts: AnalysisChart[] = [];
  const assumptions: Assumption[] = [
    a(
      "system",
      "Retirement system",
      system === "brs" ? "Blended Retirement System (BRS)" : "Legacy High-3",
      "text",
      "Taken from the BRS flag in your scenario. This is a fact about when you joined, not a choice — the opt-in window closed 31 December 2018.",
      "payload"
    ),
    a(
      "multiplier",
      "Retired-pay multiplier",
      RETIREMENT_MULTIPLIER_PCT[system],
      "percent",
      "Per year of creditable service (10 U.S.C. § 1409(b)). Fractional years count; there is no 75%/60% ceiling for anyone retiring after 2006.",
      "statute"
    ),
    a(
      "cola",
      "Retired-pay COLA",
      o.colaPct,
      "percent",
      "Retired pay tracks the FULL CPI (10 U.S.C. § 1401a(b)(2), and (b)(5) for BRS). CPI-minus-1% applies only to CSB/REDUX electees. Defaulted to your inflation assumption, so the pension holds its purchasing power for life.",
      "default"
    ),
    a(
      "life-expectancy",
      "Retired pay assumed through age",
      o.lifeExpectancyAge,
      "age",
      "A planning assumption, not a prediction. Living longer makes the pension worth proportionally more.",
      "default"
    ),
    a(
      "swr",
      "Rate used to capitalize the pension",
      o.withdrawalRatePct,
      "percent",
      "The pension is converted to a nest-egg equivalent at the same sustainable-withdrawal rate this tool uses for its 4%-rule income line, so the two figures sit on one scale.",
      "default"
    ),
    a(
      "high3-method",
      "High-3 source",
      contextHigh3.source,
      "text",
      contextHigh3.note,
      contextHigh3.source === "final-pay-proxy" ? "default" : "payload"
    ),
  ];

  const caveats: Caveat[] = [
    ...notesToCaveats("retire-tax", RETIRED_PAY_TAX_NOTES, "caution"),
    ...notesToCaveats("retire-caveat", MILITARY_RETIREMENT_CAVEATS, "cannot-quantify"),
    ...notesToCaveats("lump-sum", BRS_LUMP_SUM_NOTES, "cannot-quantify"),
  ];

  metrics.push(
    m(
      "years-of-service",
      "Years of service at separation",
      yosTotal,
      "years",
      `Your ${s.yos} years now plus the ${s.serviceYears} more this scenario serves.`
    ),
    m(
      "high3",
      "High-3 basic pay",
      contextHigh3.monthlyBase,
      "usd-per-month",
      contextHigh3.note
    )
  );

  if (detail) {
    metrics.push(
      m(
        "monthly-pension",
        "Monthly retired pay",
        detail.estimate.monthlyPension,
        "usd-per-month",
        `${detail.estimate.retiredPayPct.toFixed(1)}% of High-3 basic pay, starting the month you retire at age ${detail.startAge} — roughly 25 years before a 401(k) is penalty-free and before Social Security.`,
        { emphasis: "headline" }
      ),
      m(
        "annual-pension",
        "Annual retired pay",
        detail.estimate.annualPension,
        "usd-per-year",
        "Twelve months of retired pay in the first year of retirement, before tax."
      ),
      m(
        "pension-nest-egg",
        "Nest-egg equivalent of the pension",
        detail.nestEggEquivalent,
        "usd",
        `The savings balance it would take to draw this pension at ${o.withdrawalRatePct}%/yr. For most members this single figure is larger than their entire projected TSP.`,
        { emphasis: "headline" }
      ),
      m(
        "pension-pv",
        "Present value of the pension",
        detail.presentValue,
        "usd",
        `Every payment from age ${detail.startAge} to ${o.lifeExpectancyAge}, discounted at ${o.discountRatePct}%/yr back to today.`
      ),
      m(
        "pension-lifetime",
        "Lifetime retired pay (undiscounted)",
        detail.lifetimeNominal,
        "usd",
        `The raw sum of every payment to age ${o.lifeExpectancyAge}, in the dollars of each year — future dollars, not today's.`
      ),
      m(
        "pension-vs-portfolio",
        "Pension vs projected savings",
        detail.nestEggEquivalent - p.totals.final,
        "usd",
        "How much bigger (or smaller) the pension's nest-egg equivalent is than everything else you are projected to have saved. The projected total does NOT include the pension.",
        { emphasis: "headline" }
      )
    );

    // Real (today's-dollars) value of the pension across retirement. Because
    // the COLA tracks CPI, this line is deliberately flat — that IS the point.
    const realPoints: { x: number; y: number }[] = [];
    const nominalPoints: { x: number; y: number }[] = [];
    for (let age = detail.startAge; age <= o.lifeExpectancyAge; age++) {
      const k = age - detail.startAge;
      const nominal = detail.estimate.annualPension * Math.pow(1 + o.colaPct / 100, k);
      nominalPoints.push({ x: age, y: nominal });
      realPoints.push({
        x: age,
        y: nominal / Math.pow(1 + s.inflationPct / 100, age - s.currentAge),
      });
    }
    charts.push({
      key: "pension-stream",
      title: "Annual retired pay across retirement",
      kind: "line",
      xLabel: "Age",
      xUnit: "age",
      yLabel: "Annual retired pay",
      yUnit: "usd-per-year",
      series: [
        { key: "nominal", label: "Nominal dollars", points: nominalPoints },
        { key: "real", label: "Today's dollars", points: realPoints },
      ],
    });
  } else {
    metrics.push(
      m(
        "monthly-pension",
        "Monthly retired pay",
        0,
        "usd-per-month",
        `This scenario separates at ${yosTotal} years of service. A regular retirement needs ${REGULAR_RETIREMENT_YEARS} — below that the defined-benefit pension is $0. It is a cliff, not a gradient.`,
        { emphasis: "headline" }
      )
    );
    if (s.brs) {
      metrics.push(
        m(
          "brs-consolation",
          "TSP agency money you keep either way",
          p.totals.agencyMatch,
          "usd",
          "Under BRS the agency automatic 1% and match are yours regardless of whether you reach 20 years — matching vests immediately and the automatic 1% at 2 years of service. Under legacy High-3 there is no agency money at all."
        )
      );
    }
  }

  tables.push({
    key: "system-comparison",
    title: "Multiplier by retirement system (context only — not a choice)",
    columns: [
      { key: "system", label: "System", unit: "text" },
      { key: "multiplierPct", label: "Per year of service", unit: "percent" },
      { key: "retiredPayPct", label: `Share of High-3 at ${yosTotal} years`, unit: "percent" },
      { key: "monthlyPension", label: "Monthly retired pay", unit: "usd-per-month", bar: true },
    ],
    rows: systemComparison.map((r) => ({
      system: r.system === "brs" ? "Blended Retirement System" : "Legacy High-3",
      multiplierPct: r.multiplierPct,
      retiredPayPct: r.multiplierPct * yosTotal,
      monthlyPension: r.monthlyPension,
    })),
    sharedBarScale: ["monthlyPension"],
  });

  // Continuation pay: BRS only, 7-12 YOS, and only ever as a range.
  if (s.brs) {
    const cpIdx = p.years.findIndex((y, i) => y.serving && s.yos + i + 1 >= CONTINUATION_PAY_WINDOW.minYos);
    const cpYear = cpIdx >= 0 ? p.years[cpIdx] : null;
    const cpBasePay = cpYear?.basePayMonthly ?? contextHigh3.monthlyBase;
    const cpYos = cpYear ? s.yos + cpIdx + 1 : s.yos;
    const cp = continuationPay({ monthlyBasePay: cpBasePay, yearsOfService: cpYos, brs: true });
    tables.push({
      key: "continuation-pay",
      title: `BRS continuation pay range at ${Math.round(cpYos)} years of service`,
      columns: [
        { key: "multiple", label: "Multiple of monthly basic pay", unit: "count" },
        { key: "amount", label: "One-time payment", unit: "usd", bar: true },
      ],
      rows: cp.illustrative.map((x) => ({ multiple: x.multiple, amount: x.amount })),
      sharedBarScale: ["amount"],
    });
    caveats.push(...notesToCaveats("cp", cp.notes, cp.eligible ? "caution" : "info"));
    if (!cp.eligible) {
      caveats.push(
        c(
          "cp-window",
          `This scenario does not pass through the ${CONTINUATION_PAY_WINDOW.minYos}–${CONTINUATION_PAY_WINDOW.maxYos} year continuation-pay window inside the projection, so the table above is illustrative only.`,
          "info"
        )
      );
    }
  }

  const headline = detail
    ? `Retired pay of ${Math.round(detail.estimate.monthlyPension)}/mo from age ${detail.startAge} — a nest-egg equivalent of about ${Math.round(detail.nestEggEquivalent)}.`
    : `No defined-benefit pension: this scenario stops at ${yosTotal} years of service, short of the ${REGULAR_RETIREMENT_YEARS}-year cliff.`;

  return {
    id: "military-retirement",
    title: "Military retirement",
    headline,
    complete: contextHigh3.source !== "unavailable",
    metrics,
    tables,
    charts,
    assumptions,
    caveats,
    pension: detail,
    systemComparison,
  };
}

// -------------------------------------------------------- stay vs leave ---

type ArmPath = {
  /** Balance at the end of each projected year, index-aligned with p.years. */
  balances: number[];
  separationIndex: number;
  yosAtSeparation: number;
  /** Monthly basic pay in each serving year of this arm, chronological. */
  servingBasePay: number[];
  source: "modelled" | "counterfactual";
};

function modelledArm(p: ProjectionExport, sepIdx: number): ArmPath {
  return {
    balances: p.years.map((y) => y.total),
    separationIndex: sepIdx,
    yosAtSeparation: p.scenario.yos + p.scenario.serviceYears,
    servingBasePay: p.years.filter((y) => y.serving).map((y) => y.basePayMonthly),
    source: "modelled",
  };
}

/**
 * Build the arm the user did NOT model, sharing history with the modelled path
 * up to a divergence year and then compounding forward.
 *
 * Contributions are split into the part that scales with military basic pay
 * (the TSP election plus the BRS agency contribution) and a flat residual
 * carrying whatever else the modelled path was saving that year — investments,
 * savings, an IRA. The residual is read back OUT of the modelled path's own
 * balances rather than guessed, so the counterfactual is consistent with the
 * scenario it branches from even though the payload never states those flows.
 */
function counterfactualArm(args: {
  p: ProjectionExport;
  divergenceIndex: number;
  /** Last index this arm still serves. Equal to divergenceIndex = leaves now. */
  serveThroughIndex: number;
  blendReturn: number;
  civilianAnnualSaving: number;
  civilianStopAge: number | null;
  modelledSeparationIndex: number;
}): ArmPath {
  const { p, divergenceIndex, serveThroughIndex, blendReturn, modelledSeparationIndex } = args;
  const s = p.scenario;
  const years = p.years;
  /** The modelled path, kept read-only — the counterfactual is read OUT of it. */
  const modelled = years.map((y) => y.total);
  const out = modelled.slice();

  const payLinkedPct = s.tspPct + agencyPctOfBasePay(s.tspPct, s.brs);
  const raise = s.payRaisePct / 100;

  // Flat non-pay-linked saving while serving (investments, savings, an IRA),
  // implied by the modelled path's own balances rather than guessed.
  let servingResidual: number;
  if (divergenceIndex >= 1) {
    const implied = modelled[divergenceIndex] - modelled[divergenceIndex - 1] * (1 + blendReturn);
    const payLinked = payLinkedPct * years[divergenceIndex].basePayMonthly * 12;
    servingResidual = Math.max(0, implied - payLinked);
  } else {
    servingResidual = finite(s.iraMonthly) * 12;
  }

  const divergenceBasePay = years[divergenceIndex]?.basePayMonthly ?? 0;
  const servingBasePay: number[] = [];
  for (let i = 0; i <= divergenceIndex; i++) {
    if (years[i].serving) servingBasePay.push(years[i].basePayMonthly);
  }

  let balance = modelled[divergenceIndex] ?? 0;
  for (let i = divergenceIndex + 1; i < years.length; i++) {
    let contribution: number;
    if (i <= serveThroughIndex) {
      const basePay = divergenceBasePay * Math.pow(1 + raise, i - divergenceIndex);
      servingBasePay.push(basePay);
      contribution = payLinkedPct * basePay * 12 + servingResidual;
    } else if (i <= modelledSeparationIndex) {
      // This arm is already out while the modelled path is still serving:
      // substitute the civilian saving pace for the military one.
      contribution =
        args.civilianStopAge !== null && years[i].age >= args.civilianStopAge ? 0 : args.civilianAnnualSaving;
    } else {
      // Past the modelled separation both paths are civilian, so the modelled
      // path's own implied contribution for this year is the best available.
      contribution = Math.max(0, modelled[i] - modelled[i - 1] * (1 + blendReturn));
    }
    balance = balance * (1 + blendReturn) + contribution;
    out[i] = balance;
  }

  return {
    balances: out,
    separationIndex: serveThroughIndex,
    yosAtSeparation: s.yos + serveThroughIndex + 1,
    servingBasePay,
    source: "counterfactual",
  };
}

function armSummary(args: {
  key: "stay" | "leave";
  label: string;
  path: ArmPath;
  p: ProjectionExport;
  pension: PensionDetail | null;
  colaPct: number;
  withdrawalRatePct: number;
  inflationPct: number;
}): ArmSummary {
  const { p, path, pension } = args;
  const lastIdx = p.years.length - 1;
  const endLine = p.years[lastIdx];
  const deflator = Math.pow(1 + args.inflationPct / 100, lastIdx + 1);
  const balanceAtEnd = path.balances[lastIdx] ?? 0;

  let nestEgg = 0;
  if (pension) {
    const grown =
      pension.estimate.annualPension * Math.pow(1 + args.colaPct / 100, Math.max(0, endLine.age - pension.startAge));
    nestEgg = grown / (args.withdrawalRatePct / 100);
  }
  const totalPosition = balanceAtEnd + nestEgg;
  const sepLine = p.years[path.separationIndex];

  return {
    key: args.key,
    label: args.label,
    source: path.source,
    separationIndex: path.separationIndex,
    separationAge: sepLine?.age ?? p.scenario.currentAge,
    separationYear: sepLine?.year ?? p.years[0]?.year ?? 0,
    yosAtSeparation: path.yosAtSeparation,
    reachesRetirement: path.yosAtSeparation >= REGULAR_RETIREMENT_YEARS,
    pension,
    balanceAtEnd,
    balanceAtEndReal: balanceAtEnd / deflator,
    pensionNestEggAtEnd: nestEgg,
    totalPositionAtEnd: totalPosition,
    totalPositionAtEndReal: totalPosition / deflator,
  };
}

function stayVsLeaveSection(p: ProjectionExport, o: ResolvedOptions): StayVsLeaveAnalysis {
  const s = p.scenario;
  const years = p.years;
  const system: RetirementSystem = s.brs ? "brs" : "high3";
  const yosTotal = s.yos + s.serviceYears;
  const sepIdx = separationIndex(years);
  const lastIdx = years.length - 1;

  const assumptions: Assumption[] = [];
  const caveats: Caveat[] = [];

  const incomplete = (headline: string, why: string): StayVsLeaveAnalysis => ({
    id: "stay-vs-leave",
    title: "Staying in vs getting out",
    headline,
    complete: false,
    comparable: false,
    metrics: [],
    tables: [],
    charts: [],
    assumptions,
    caveats: [...caveats, c("not-comparable", why, "cannot-quantify")],
    stay: null,
    leave: null,
    breakEven: null,
    series: [],
  });

  if (years.length < 2 || sepIdx < 0) {
    return incomplete(
      "Not enough projected years to compare staying against getting out.",
      "This comparison needs at least two projected years with military service in them. Extend the projection horizon or add service years."
    );
  }

  // Which arm is the counterfactual? Exactly one of them, always labelled.
  const extendsService = yosTotal < o.stayToYos;
  const divergenceIndex = extendsService ? sepIdx : Math.min(Math.max(0, o.leaveAtYearIndex ?? 0), sepIdx - 1);
  if (!extendsService && divergenceIndex < 0) {
    return incomplete(
      "This scenario already serves a full career, and there is no earlier year to compare against.",
      "Getting out earlier can only be modelled from a projected year boundary while you are still serving; this scenario has none before separation."
    );
  }
  if (extendsService && sepIdx >= lastIdx) {
    return incomplete(
      "The projection horizon ends at separation, so there is no room to model staying longer.",
      `Staying to ${o.stayToYos} years needs projected years beyond the modelled separation. Extend the projection horizon and run again.`
    );
  }

  const blendReturn = blendedReturnPct(years[divergenceIndex], s) / 100;
  const civilianStopAge =
    typeof s.k401UntilAge === "number" || typeof s.iraUntilAge === "number"
      ? Math.max(finite(s.k401UntilAge), finite(s.iraUntilAge))
      : null;

  // Civilian saving pace once out: the caller's figure, else the pace the
  // modelled path actually uses in its first civilian year, else the stated
  // 401(k) + IRA contributions.
  let civilianAnnualSaving = finite(o.civilianMonthlySavings) * 12;
  let civilianSource: Assumption["source"] = "caller";
  if (!(civilianAnnualSaving > 0)) {
    const firstCiv = sepIdx + 1;
    if (firstCiv <= lastIdx) {
      const implied = years[firstCiv].total - years[firstCiv - 1].total * (1 + blendReturn);
      if (implied > 0) {
        civilianAnnualSaving = implied;
        civilianSource = "payload";
      }
    }
  }
  if (!(civilianAnnualSaving > 0)) {
    civilianAnnualSaving = (finite(s.k401Monthly) + finite(s.iraMonthly)) * 12;
    civilianSource = "payload";
  }

  let stayPath: ArmPath;
  let leavePath: ArmPath;
  if (extendsService) {
    const extraYears = Math.min(Math.ceil(o.stayToYos - yosTotal), lastIdx - sepIdx);
    stayPath = counterfactualArm({
      p,
      divergenceIndex: sepIdx,
      serveThroughIndex: sepIdx + extraYears,
      blendReturn,
      civilianAnnualSaving,
      civilianStopAge,
      modelledSeparationIndex: sepIdx,
    });
    leavePath = modelledArm(p, sepIdx);
  } else {
    stayPath = modelledArm(p, sepIdx);
    leavePath = counterfactualArm({
      p,
      divergenceIndex,
      serveThroughIndex: divergenceIndex,
      blendReturn,
      civilianAnnualSaving,
      civilianStopAge,
      modelledSeparationIndex: sepIdx,
    });
  }

  const pensionFor = (path: ArmPath): PensionDetail | null => {
    const sepLine = years[path.separationIndex];
    if (!sepLine) return null;
    return buildPensionDetail({
      servingBasePayByYear: path.servingBasePay,
      yearsOfService: path.yosAtSeparation,
      system,
      startAge: sepLine.age,
      startYear: sepLine.year,
      lifeExpectancyAge: o.lifeExpectancyAge,
      withdrawalRatePct: o.withdrawalRatePct,
      colaPct: o.colaPct,
      discountRatePct: o.discountRatePct,
      valuationAge: s.currentAge,
    });
  };

  const stayPension = pensionFor(stayPath);
  const leavePension = pensionFor(leavePath);

  const stay = armSummary({
    key: "stay",
    label: `Serve to ${Math.round(stayPath.yosAtSeparation)} years`,
    path: stayPath,
    p,
    pension: stayPension,
    colaPct: o.colaPct,
    withdrawalRatePct: o.withdrawalRatePct,
    inflationPct: s.inflationPct,
  });
  const leave = armSummary({
    key: "leave",
    label: `Separate at ${Math.round(leavePath.yosAtSeparation)} years`,
    path: leavePath,
    p,
    pension: leavePension,
    colaPct: o.colaPct,
    withdrawalRatePct: o.withdrawalRatePct,
    inflationPct: s.inflationPct,
  });

  // ---- the comparable series -------------------------------------------
  const nestEggAt = (pension: PensionDetail | null, age: number): { annual: number; nestEgg: number } => {
    if (!pension || age < pension.startAge) return { annual: 0, nestEgg: 0 };
    const annual = pension.estimate.annualPension * Math.pow(1 + o.colaPct / 100, age - pension.startAge);
    return { annual, nestEgg: annual / (o.withdrawalRatePct / 100) };
  };

  const series: TradeSpacePoint[] = years.map((y, i) => {
    const deflator = Math.pow(1 + s.inflationPct / 100, i + 1);
    const sp = nestEggAt(stayPension, y.age);
    const lp = nestEggAt(leavePension, y.age);
    const stayBalance = stayPath.balances[i] ?? 0;
    const leaveBalance = leavePath.balances[i] ?? 0;
    const stayTotal = stayBalance + sp.nestEgg;
    const leaveTotal = leaveBalance + lp.nestEgg;
    return {
      year: y.year,
      age: y.age,
      stayBalance,
      leaveBalance,
      stayPensionAnnual: sp.annual,
      leavePensionAnnual: lp.annual,
      stayTotalPosition: stayTotal,
      leaveTotalPosition: leaveTotal,
      stayTotalPositionReal: stayTotal / deflator,
      leaveTotalPositionReal: leaveTotal / deflator,
    };
  });

  // Break-even is only meaningful AFTER the two paths diverge — before that
  // they are the same career and the comparison is trivially a tie.
  let crossIdx = -1;
  for (let i = divergenceIndex + 1; i < series.length; i++) {
    if (series[i].stayTotalPosition >= series[i].leaveTotalPosition) {
      crossIdx = i;
      break;
    }
  }
  const holds =
    crossIdx >= 0 && series.slice(crossIdx).every((pt) => pt.stayTotalPosition >= pt.leaveTotalPosition);
  const gapAtEnd = stay.totalPositionAtEnd - leave.totalPositionAtEnd;
  const breakEven: BreakEven = {
    age: crossIdx >= 0 ? series[crossIdx].age : null,
    year: crossIdx >= 0 ? series[crossIdx].year : null,
    never: crossIdx < 0,
    holdsThroughHorizon: holds,
    gapAtEnd,
    gapAtEndReal: stay.totalPositionAtEndReal - leave.totalPositionAtEndReal,
  };

  // ---- assumptions ------------------------------------------------------
  assumptions.push(
    a(
      "arms",
      "Which path you actually modelled",
      stayPath.source === "modelled" ? "Staying in" : "Getting out",
      "text",
      stayPath.source === "modelled"
        ? `Your scenario serves ${yosTotal} years, so that is the STAY arm. The GET OUT arm is built here by separating at year ${years[divergenceIndex].year} instead.`
        : `Your scenario separates at ${yosTotal} years, so that is the GET OUT arm. The STAY arm is built here by serving on to ${Math.round(stayPath.yosAtSeparation)} years.`,
      "payload"
    ),
    a(
      "blend-return",
      "Blended portfolio return used for the counterfactual",
      Math.round(blendReturn * 1000) / 10,
      "percent",
      "Your per-account return assumptions weighted by the balance mix at the year the two paths split. Exact at that moment, drifting only as the mix changes.",
      "payload"
    ),
    a(
      "civilian-saving",
      "Civilian saving once out",
      civilianAnnualSaving,
      "usd-per-year",
      civilianSource === "caller"
        ? "Supplied by the caller."
        : "Read back out of your own projection's first civilian year, so the counterfactual saves at exactly the pace you modelled. Held flat in nominal terms.",
      civilianSource
    ),
    a(
      "extra-pay",
      "Basic pay while serving on",
      s.payRaisePct,
      "percent",
      "Extra service years grow basic pay at your annual pay-raise assumption only. Promotions and longevity steps past the modelled window are NOT added, so the staying arm is deliberately conservative.",
      "default"
    ),
    a(
      "tax-basis",
      "Tax basis of every figure here",
      "pre-tax",
      "text",
      "Retired pay, Traditional balances and the pension's nest-egg equivalent are all pre-tax. Roth dollars are after-tax and are NOT adjusted — see the Roth section for the after-tax view.",
      "default"
    ),
    a(
      "pension-in-total",
      "Pension included in the comparison",
      "yes",
      "text",
      `The pension is capitalized at ${o.withdrawalRatePct}%/yr and added to the balance. The projector's own headline total excludes it, which is why that number looks the same whether you serve 19 years or 20.`,
      "default"
    )
  );

  // ---- caveats ----------------------------------------------------------
  caveats.push(
    c(
      "civilian-salary",
      "This tool never asks for a civilian salary, so the getting-out path is expressed as a saving rate, not a paycheck. A higher-paying civilian job that you save more from would narrow or close the gap.",
      "cannot-quantify"
    ),
    c(
      "no-severance",
      "Separation pay, unemployment compensation, GI Bill benefits, VA disability and TRICARE are not valued on either side.",
      "cannot-quantify"
    ),
    c(
      "not-your-choice",
      "Staying to 20 is not unilaterally your decision — promotion boards, up-or-out rules, medical separation and force shaping all intervene.",
      "caution"
    ),
    c(
      "cliff",
      `The pension is a cliff, not a gradient: ${REGULAR_RETIREMENT_YEARS} years pays ${
        RETIREMENT_MULTIPLIER_PCT[system] * REGULAR_RETIREMENT_YEARS
      }% of High-3 for life; 19 years and 11 months pays nothing.`,
      "caution"
    ),
    ...notesToCaveats("sl-tax", RETIRED_PAY_TAX_NOTES, "caution")
  );
  if (!(civilianAnnualSaving > 0)) {
    caveats.push(
      c(
        "no-civilian-saving",
        "No civilian saving was modelled, so the getting-out path contributes nothing after separation. That flatters staying in — add a civilian 401(k) or IRA figure for a fair comparison.",
        "caution"
      )
    );
  }

  // ---- metrics ----------------------------------------------------------
  const endAge = years[lastIdx].age;
  const metrics: Metric[] = [
    m(
      "verdict-gap",
      `Advantage of staying at age ${endAge}`,
      gapAtEnd,
      "usd",
      "Balance plus the pension's nest-egg equivalent, staying minus getting out, at the end of the projection. Negative means getting out comes out ahead.",
      { realValue: breakEven.gapAtEndReal, emphasis: "headline" }
    ),
    m(
      "retirement-age",
      "Age retired pay would start",
      stay.pension?.startAge ?? 0,
      stay.pension ? "age" : "count",
      stay.pension
        ? `Serving to ${Math.round(stay.yosAtSeparation)} years means retired pay begins at this age and never stops. That step — not the year-to-year saving difference — is what decides this comparison.`
        : "Neither path reaches 20 years of service, so no retired pay starts on either side."
    ),
    m(
      "break-even-age",
      "Break-even age",
      breakEven.age ?? "never inside this horizon",
      breakEven.age === null ? "text" : "age",
      breakEven.never
        ? "Staying in never overtakes getting out inside this projection horizon."
        : `The first age at which staying in is worth more than getting out${
            breakEven.holdsThroughHorizon ? " — and it stays ahead from there." : ", though the lead does not hold every year after."
          }`,
      { emphasis: "headline" }
    ),
    m("stay-balance-end", `${stay.label}: savings at age ${endAge}`, stay.balanceAtEnd, "usd", "Investable balances only — no pension.", {
      realValue: stay.balanceAtEndReal,
    }),
    m("leave-balance-end", `${leave.label}: savings at age ${endAge}`, leave.balanceAtEnd, "usd", "Investable balances only — no pension.", {
      realValue: leave.balanceAtEndReal,
    }),
    m(
      "stay-pension",
      `${stay.label}: monthly retired pay`,
      stay.pension?.estimate.monthlyPension ?? 0,
      "usd-per-month",
      stay.pension
        ? `Starts at age ${stay.pension.startAge}, indexed to CPI for life.`
        : `Below ${REGULAR_RETIREMENT_YEARS} years of service there is no defined-benefit pension.`
    ),
    m(
      "leave-pension",
      `${leave.label}: monthly retired pay`,
      leave.pension?.estimate.monthlyPension ?? 0,
      "usd-per-month",
      leave.pension
        ? `Starts at age ${leave.pension.startAge}, indexed to CPI for life.`
        : `Below ${REGULAR_RETIREMENT_YEARS} years of service there is no defined-benefit pension.`
    ),
    m(
      "stay-total-position",
      `${stay.label}: total position at age ${endAge}`,
      stay.totalPositionAtEnd,
      "usd",
      "Savings plus the pension's nest-egg equivalent — the only figure the two paths can be compared on.",
      { realValue: stay.totalPositionAtEndReal }
    ),
    m(
      "leave-total-position",
      `${leave.label}: total position at age ${endAge}`,
      leave.totalPositionAtEnd,
      "usd",
      "Savings plus the pension's nest-egg equivalent — the only figure the two paths can be compared on.",
      { realValue: leave.totalPositionAtEndReal }
    ),
    m(
      "stay-lifetime-pension",
      `${stay.label}: lifetime retired pay`,
      stay.pension?.lifetimeNominal ?? 0,
      "usd",
      `Undiscounted sum of every payment to age ${o.lifeExpectancyAge}, in the dollars of each year.`
    ),
  ];

  // ---- table + charts ---------------------------------------------------
  const tables: AnalysisTable[] = [
    {
      key: "stay-vs-leave-by-year",
      title: "Total position year by year",
      columns: [
        { key: "year", label: "Year", unit: "calendar-year" },
        { key: "age", label: "Age", unit: "age" },
        { key: "stay", label: stay.label, unit: "usd", bar: true },
        { key: "leave", label: leave.label, unit: "usd", bar: true },
        { key: "difference", label: "Staying advantage", unit: "usd" },
        { key: "stayReal", label: `${stay.label} (today's $)`, unit: "usd" },
        { key: "leaveReal", label: `${leave.label} (today's $)`, unit: "usd" },
      ],
      rows: series.map((pt) => ({
        year: pt.year,
        age: pt.age,
        stay: pt.stayTotalPosition,
        leave: pt.leaveTotalPosition,
        difference: pt.stayTotalPosition - pt.leaveTotalPosition,
        stayReal: pt.stayTotalPositionReal,
        leaveReal: pt.leaveTotalPositionReal,
      })),
      // One scale across both columns: auto-scaling each independently would
      // make two very different numbers draw identical bars.
      sharedBarScale: ["stay", "leave"],
    },
  ];

  const charts: AnalysisChart[] = [
    {
      key: "total-position",
      title: "Total position: staying in vs getting out (nominal)",
      kind: "line",
      xLabel: "Age",
      xUnit: "age",
      yLabel: "Savings + pension nest-egg equivalent",
      yUnit: "usd",
      series: [
        { key: "stay", label: stay.label, points: series.map((pt) => ({ x: pt.age, y: pt.stayTotalPosition })) },
        { key: "leave", label: leave.label, points: series.map((pt) => ({ x: pt.age, y: pt.leaveTotalPosition })) },
      ],
    },
    {
      key: "total-position-real",
      title: "Total position in today's dollars",
      kind: "line",
      xLabel: "Age",
      xUnit: "age",
      yLabel: "Today's dollars",
      yUnit: "usd",
      series: [
        { key: "stay", label: stay.label, points: series.map((pt) => ({ x: pt.age, y: pt.stayTotalPositionReal })) },
        { key: "leave", label: leave.label, points: series.map((pt) => ({ x: pt.age, y: pt.leaveTotalPositionReal })) },
      ],
    },
    {
      key: "savings-only",
      title: "Investable savings only (pension excluded)",
      kind: "line",
      xLabel: "Age",
      xUnit: "age",
      yLabel: "Balance",
      yUnit: "usd",
      series: [
        { key: "stay", label: stay.label, points: series.map((pt) => ({ x: pt.age, y: pt.stayBalance })) },
        { key: "leave", label: leave.label, points: series.map((pt) => ({ x: pt.age, y: pt.leaveBalance })) },
      ],
    },
  ];

  const headline =
    gapAtEnd > 0
      ? `Staying in is ahead by about ${Math.round(gapAtEnd)} at age ${endAge}${
          breakEven.age !== null ? `, overtaking at age ${breakEven.age}` : ""
        }.`
      : `Getting out is ahead by about ${Math.round(-gapAtEnd)} at age ${endAge} — staying in never overtakes inside this horizon.`;

  return {
    id: "stay-vs-leave",
    title: "Staying in vs getting out",
    headline,
    complete: true,
    comparable: true,
    metrics,
    tables,
    charts,
    assumptions,
    caveats,
    stay,
    leave,
    breakEven,
    series,
  };
}

// ---------------------------------------------------- roth vs traditional ---

const CZTE_CAVEATS: string[] = [
  "Combat-zone (CZTE) pay is excluded from income altogether. Roth contributions made from it go in untaxed AND come out untaxed — a genuinely untaxed round trip, and the strongest Roth argument in military finance.",
  "Traditional contributions of tax-exempt combat pay keep the basis tax-free, but the EARNINGS on it are taxable at withdrawal — strictly worse than Roth for the same dollars.",
  "TSP cannot accept traditional tax-exempt catch-up contributions at all; catch-up from combat-zone pay must be Roth.",
  "Officers' combat-zone exclusion is capped at the highest enlisted basic pay plus imminent-danger pay; enlisted and warrant officers are fully excluded.",
  "Tax-exempt combat-zone contributions count against the annual-additions limit rather than the elective-deferral limit, so a deployment year has more room than a normal one.",
];

function rothSection(p: ProjectionExport): RothAnalysis | null {
  const r = p.rothTradeoff;
  const baseCaveats: Caveat[] = [
    ...notesToCaveats("roth", ROTH_TRADEOFF_CAVEATS, "info"),
    ...notesToCaveats("czte", CZTE_CAVEATS, "info"),
  ];

  if (!r) {
    return {
      id: "roth-vs-traditional",
      title: "Roth vs Traditional",
      headline:
        "No Roth/Traditional comparison was set up in this scenario — the rule still holds: Roth wins when your retirement tax rate is higher than today's.",
      complete: false,
      metrics: [],
      tables: [],
      charts: [],
      assumptions: [],
      caveats: [
        c(
          "roth-missing",
          "This projection carried no Roth vs Traditional inputs (contribution, horizon and the two tax rates), so no numbers could be computed.",
          "cannot-quantify"
        ),
        ...baseCaveats,
      ],
      winner: null,
      advantage: 0,
      breakevenRatePct: null,
    };
  }

  // Re-run the SAME engine the tool already uses, purely to recover the
  // per-year series the summary payload does not carry. No second maths.
  const detail = computeRothTradeoff({
    monthlyContribution: r.monthlyContribution,
    yearsContributing: r.yearsContributing,
    yearsToWithdrawal: r.yearsToWithdrawal,
    annualReturn: r.annualReturnPct / 100,
    taxRateNow: r.taxRateNowPct / 100,
    taxRateAtWithdrawal: r.taxRateAtWithdrawalPct / 100,
  });

  const metrics: Metric[] = [
    m(
      "winner",
      "Verdict",
      r.winner === "even" ? "Effectively even" : r.winner === "roth" ? "Roth" : "Traditional",
      "text",
      "Both paths put the same dollars in, so the pre-tax balance is identical. The winner is decided entirely by which marginal tax rate is higher — today's or retirement's.",
      { emphasis: "headline" }
    ),
    m("advantage", "Advantage of the winner", r.advantage, "usd", "After-tax difference at the horizon, netting the Roth path's up-front tax at the same compounded return.", {
      emphasis: "headline",
    }),
    m(
      "breakeven-rate",
      "Break-even retirement tax rate",
      detail.breakevenRatePct,
      "percent",
      "Above this retirement-time rate Roth wins; below it Traditional wins; at it they tie. It is simply your marginal rate today.",
      { emphasis: "headline" }
    ),
    m("pretax-balance", "Pre-tax balance at the horizon", r.preTaxBalance, "usd", "Identical on both paths — the same dollars went in."),
    m("roth-tax-up-front", "Roth: tax paid up front", r.taxPaidUpFront, "usd", "Tax paid on the income before it ever reached the account."),
    m("roth-after-tax", "Roth: after-tax value", r.rothAfterTax, "usd", "Qualified Roth withdrawals are tax-free, so this equals the balance."),
    m("trad-deferred-tax", "Traditional: deferred tax bill", r.deferredTaxBill, "usd", "Tax due on the WHOLE balance — contributions and every dollar of growth — at withdrawal."),
    m("trad-after-tax", "Traditional: after-tax value", r.tradAfterTax, "usd", "Balance less the deferred tax bill."),
    m("contributed", "Total contributed", detail.contributed, "usd", "Same on both paths, by construction."),
  ];

  const tables: AnalysisTable[] = [
    {
      key: "roth-by-year",
      title: "Roth vs Traditional year by year",
      columns: [
        { key: "year", label: "Year", unit: "count" },
        { key: "balance", label: "Pre-tax balance", unit: "usd", bar: true },
        { key: "taxPaidUpFront", label: "Roth: tax paid so far", unit: "usd", bar: true },
        { key: "deferredTaxBill", label: "Traditional: tax if withdrawn now", unit: "usd", bar: true },
        { key: "rothAfterTax", label: "Roth after tax", unit: "usd" },
        { key: "tradAfterTax", label: "Traditional after tax", unit: "usd" },
      ],
      rows: detail.years.map((y) => ({
        year: y.year,
        balance: y.balance,
        taxPaidUpFront: y.taxPaidUpFront,
        deferredTaxBill: y.deferredTaxBill,
        rothAfterTax: y.rothAfterTax,
        tradAfterTax: y.tradAfterTax,
      })),
      // The whole point of the picture is that the deferred bill grows with
      // the balance while the up-front tax does not — so they share a scale.
      sharedBarScale: ["taxPaidUpFront", "deferredTaxBill"],
    },
  ];

  const charts: AnalysisChart[] = [
    {
      key: "tax-wedge",
      title: "The tax wedge over time",
      kind: "line",
      xLabel: "Year",
      xUnit: "count",
      yLabel: "Dollars",
      yUnit: "usd",
      series: [
        { key: "balance", label: "Pre-tax balance (both paths)", points: detail.years.map((y) => ({ x: y.year, y: y.balance })) },
        { key: "roth-tax", label: "Roth: tax paid up front", points: detail.years.map((y) => ({ x: y.year, y: y.taxPaidUpFront })) },
        { key: "trad-tax", label: "Traditional: deferred tax bill", points: detail.years.map((y) => ({ x: y.year, y: y.deferredTaxBill })) },
      ],
    },
    {
      key: "after-tax",
      title: "After-tax value if withdrawn each year",
      kind: "line",
      xLabel: "Year",
      xUnit: "count",
      yLabel: "After-tax dollars",
      yUnit: "usd",
      series: [
        { key: "roth", label: "Roth", points: detail.years.map((y) => ({ x: y.year, y: y.rothAfterTax })) },
        { key: "traditional", label: "Traditional", points: detail.years.map((y) => ({ x: y.year, y: y.tradAfterTax })) },
      ],
    },
  ];

  const assumptions: Assumption[] = [
    a("contribution", "Monthly contribution", r.monthlyContribution, "usd-per-month", "The same dollars go in on both paths — that is what makes the comparison fair.", "payload"),
    a("years-contributing", "Years contributing", r.yearsContributing, "years", "How long contributions keep arriving.", "payload"),
    a("years-to-withdrawal", "Years to withdrawal", r.yearsToWithdrawal, "years", "The balance keeps compounding after contributions stop.", "payload"),
    a("return", "Assumed return", r.annualReturnPct, "percent", "Nominal annual return, identical on both paths.", "payload"),
    a("rate-now", "Marginal tax rate today", r.taxRateNowPct, "percent", "What you would pay on the next dollar of income now — federal plus state on the margin.", "payload"),
    a("rate-later", "Marginal tax rate at withdrawal", r.taxRateAtWithdrawalPct, "percent", "The single most important and least knowable input. Under whatever tax law exists then.", "payload"),
    a(
      "netting",
      "How the up-front tax is netted",
      "compounded at the account return",
      "text",
      "On the Roth path you also part with the up-front tax — money the Traditional path keeps invested. Compounding it at the same return is what makes equal rates tie exactly.",
      "default"
    ),
  ];

  return {
    id: "roth-vs-traditional",
    title: "Roth vs Traditional",
    headline:
      r.winner === "even"
        ? `Effectively even: your assumed retirement rate (${r.taxRateAtWithdrawalPct}%) matches today's (${r.taxRateNowPct}%).`
        : `${r.winner === "roth" ? "Roth" : "Traditional"} ahead by about ${Math.round(r.advantage)} — because your retirement tax rate (${r.taxRateAtWithdrawalPct}%) is ${
            r.winner === "roth" ? "higher" : "lower"
          } than today's (${r.taxRateNowPct}%).`,
    complete: true,
    metrics,
    tables,
    charts,
    assumptions,
    caveats: baseCaveats,
    winner: r.winner,
    advantage: r.advantage,
    breakevenRatePct: detail.breakevenRatePct,
  };
}

// ------------------------------------------------------------------- IRA ---

function iraSection(p: ProjectionExport): IraAnalysis {
  const s = p.scenario;
  const iraAnnual = finite(s.iraMonthly) * 12;
  const iraHeadroom = IRA_CONTRIBUTION_LIMIT_2026 - iraAnnual;
  const combined = TSP_ELECTIVE_DEFERRAL_LIMIT_2026 + IRA_CONTRIBUTION_LIMIT_2026;
  const fullMatchPct = 5;

  const ordering = [
    {
      rank: 1,
      step: `Contribute at least ${fullMatchPct}% of basic pay to the TSP`,
      why: s.brs
        ? "Under BRS the service adds an automatic 1% and matches the first 3% dollar-for-dollar plus the next 2% at 50 cents. Contribute 5% and 5% more arrives. Nothing else in this list returns 80–100% on day one."
        : "Legacy High-3 gets no agency contributions, so there is no match to capture — but the TSP's expense ratios are the lowest available anywhere, which makes it the natural first home for retirement dollars.",
    },
    {
      rank: 2,
      step: "Fill the IRA",
      why: `An IRA's limit is entirely separate from the TSP's — maxing one has no effect on the other. It also gives you fund choices the TSP does not have, and (for a Roth IRA) contributions you can withdraw without penalty.`,
    },
    {
      rank: 3,
      step: "Go back and fill the rest of the TSP elective-deferral limit",
      why: "Once the match is captured and the IRA is full, the TSP's remaining room is the cheapest tax-advantaged space left.",
    },
    {
      rank: 4,
      step: "Taxable investing",
      why: "After both tax-advantaged buckets are full, a plain brokerage account is next. No contribution limit, no withdrawal rules, but growth is taxed along the way.",
    },
  ];

  const metrics: Metric[] = [
    m("tsp-limit", "TSP elective-deferral limit (2026)", TSP_ELECTIVE_DEFERRAL_LIMIT_2026, "usd-per-year", "The most of your OWN pay you can defer into the TSP in a calendar year, traditional and Roth combined."),
    m("ira-limit", "IRA contribution limit (2026)", IRA_CONTRIBUTION_LIMIT_2026, "usd-per-year", "Across all your IRAs, traditional and Roth combined. Entirely separate from the TSP limit."),
    m("combined-room", "Combined tax-advantaged room", combined, "usd-per-year", "TSP plus IRA, under age 50 — the total shelter available before catch-up contributions.", {
      emphasis: "headline",
    }),
    m("tsp-catchup", "TSP catch-up at 50+", TSP_CATCH_UP_LIMIT_50_PLUS_2026, "usd-per-year", "Extra TSP room on top of the deferral limit, starting the year you turn 50."),
    m("ira-catchup", "IRA catch-up at 50+", IRA_CATCH_UP_LIMIT_50_PLUS_2026, "usd-per-year", "Extra IRA room on top of the IRA limit, starting the year you turn 50."),
    m("annual-additions", "TSP annual-additions limit", TSP_ANNUAL_ADDITIONS_LIMIT_2026, "usd-per-year", "The ceiling on EVERYTHING landing in the TSP for one employer in a year, including the agency match and combat-zone tax-exempt contributions."),
    m("ira-modelled", "IRA contributions in this scenario", iraAnnual, "usd-per-year", iraAnnual > 0 ? "What your projection puts into an IRA each year." : "This projection contributes nothing to an IRA."),
    m(
      "ira-headroom",
      "Unused IRA room",
      Math.max(0, iraHeadroom),
      "usd-per-year",
      iraHeadroom > 0
        ? "Tax-advantaged space this scenario leaves on the table each year. It does not carry forward — an unused year is gone."
        : "This scenario already fills the IRA limit.",
      { emphasis: iraHeadroom > 0 ? "headline" : "normal" }
    ),
  ];

  const tables: AnalysisTable[] = [
    {
      key: "ira-ordering",
      title: "Where the next dollar should go",
      columns: [
        { key: "rank", label: "Order", unit: "count" },
        { key: "step", label: "Step", unit: "text" },
        { key: "why", label: "Why here", unit: "text" },
      ],
      rows: ordering.map((o) => ({ rank: o.rank, step: o.step, why: o.why })),
    },
    {
      key: "ira-vs-tsp-room",
      title: "Annual tax-advantaged room, 2026",
      columns: [
        { key: "account", label: "Account", unit: "text" },
        { key: "limit", label: "Limit", unit: "usd-per-year", bar: true },
        { key: "used", label: "Used in this scenario", unit: "usd-per-year", bar: true },
      ],
      rows: [
        { account: "TSP (your own contributions)", limit: TSP_ELECTIVE_DEFERRAL_LIMIT_2026, used: finite(p.totals.employeeTsp) > 0 && s.serviceYears > 0 ? finite(p.totals.employeeTsp) / s.serviceYears : 0 },
        { account: "IRA (traditional + Roth combined)", limit: IRA_CONTRIBUTION_LIMIT_2026, used: iraAnnual },
      ],
      // Both columns are dollars per year against the same ceiling: one scale
      // or the bars misrepresent how much room is left.
      sharedBarScale: ["limit", "used"],
    },
  ];

  const charts: AnalysisChart[] = [
    {
      key: "ira-room",
      title: "Tax-advantaged room used vs available",
      kind: "grouped-bar",
      xLabel: "Account",
      xUnit: "text",
      yLabel: "Dollars per year",
      yUnit: "usd-per-year",
      series: [
        {
          key: "limit",
          label: "Annual limit",
          points: [
            { x: 0, y: TSP_ELECTIVE_DEFERRAL_LIMIT_2026 },
            { x: 1, y: IRA_CONTRIBUTION_LIMIT_2026 },
          ],
        },
        {
          key: "used",
          label: "Used in this scenario",
          points: [
            { x: 0, y: finite(p.totals.employeeTsp) > 0 && s.serviceYears > 0 ? finite(p.totals.employeeTsp) / s.serviceYears : 0 },
            { x: 1, y: iraAnnual },
          ],
        },
      ],
    },
  ];

  const assumptions: Assumption[] = [
    a("limits-year", "Contribution limits", 2026, "calendar-year", "IRS figures for 2026 (Notice 2025-67 / TSP Bulletin 25-3). They are indexed and change most years.", "statute"),
    a("under-50", "Age band assumed", "under 50", "text", "The headline limits are the under-50 figures; catch-up amounts are listed separately.", "default"),
    a(
      "tsp-used",
      "TSP contributions per year",
      finite(p.totals.employeeTsp) > 0 && s.serviceYears > 0 ? finite(p.totals.employeeTsp) / s.serviceYears : 0,
      "usd-per-year",
      "Your own TSP contributions over the service window, averaged per year. Averaging smooths out pay raises and promotions.",
      "payload"
    ),
  ];

  const caveats: Caveat[] = [
    c(
      "ira-type-unknown",
      "This tool does not ask whether your IRA is Roth or Traditional, so the Roth vs Traditional section is framed as a general rule rather than a reading of your actual election.",
      "cannot-quantify"
    ),
    c(
      "no-magi",
      "Roth IRA eligibility phases out at high income, and the deductibility of a Traditional IRA depends on income and whether a workplace plan covers you. This tool has no income or filing-status field, so neither test can be run.",
      "cannot-quantify"
    ),
    c(
      "separate-limits",
      "The IRA limit and the TSP limit are separate ceilings. Filling one does nothing to the other — a common and expensive misunderstanding.",
      "info"
    ),
    c(
      "match-is-traditional",
      "Under BRS the agency automatic 1% and all matching go into the TRADITIONAL balance no matter what you elect, so a 100%-Roth member still ends up with two buckets and two tax treatments.",
      "info"
    ),
    c(
      "spousal-ira",
      "A non-working spouse can usually have an IRA of their own on a joint return, doubling the household's IRA room. Not modelled here.",
      "info"
    ),
  ];

  return {
    id: "ira-placement",
    title: "Where an IRA fits",
    headline:
      iraHeadroom > 0
        ? `An IRA adds ${IRA_CONTRIBUTION_LIMIT_2026} of tax-advantaged room on top of the TSP; this scenario leaves ${Math.max(0, Math.round(iraHeadroom))} of it unused each year.`
        : `An IRA adds ${IRA_CONTRIBUTION_LIMIT_2026} of tax-advantaged room on top of the TSP, and this scenario fills it.`,
    complete: true,
    metrics,
    tables,
    charts,
    assumptions,
    caveats,
    annualIraLimit: IRA_CONTRIBUTION_LIMIT_2026,
    annualTspLimit: TSP_ELECTIVE_DEFERRAL_LIMIT_2026,
    combinedTaxAdvantagedRoom: combined,
    ordering,
  };
}

// ------------------------------------------------------------ entry point ---

/**
 * The single entry point every export format calls.
 *
 * Returns data only — numbers, units, explanations, chart series and table
 * rows. Nothing here knows what a CSV row, a PDF stat band or an Excel data
 * bar looks like, so all four formats can render the same analysis natively.
 *
 * Degrades rather than throws: a section whose inputs are missing comes back
 * with complete:false, an honest headline, and a caveat naming what was
 * absent — never a fabricated number.
 */
export function analyzeTradeSpace(p: ProjectionExport, opts: TradeSpaceOptions = {}): TradeSpaceAnalysis {
  const s = p.scenario;
  const yosTotal = s.yos + s.serviceYears;
  const resolved: ResolvedOptions = {
    stayToYos: opts.stayToYos ?? Math.max(REGULAR_RETIREMENT_YEARS, yosTotal),
    leaveAtYearIndex: opts.leaveAtYearIndex,
    lifeExpectancyAge: opts.lifeExpectancyAge ?? DEFAULT_LIFE_EXPECTANCY_AGE,
    withdrawalRatePct: opts.withdrawalRatePct ?? DEFAULT_SAFE_WITHDRAWAL_RATE_PCT,
    // Retired pay tracks the FULL CPI, so the inflation assumption is the COLA.
    colaPct: opts.colaPct ?? s.inflationPct,
    discountRatePct: opts.discountRatePct ?? s.inflationPct,
    civilianMonthlySavings: opts.civilianMonthlySavings,
  };

  const retirement = retirementSection(p, resolved);
  const stayVsLeave = p.years.length > 0 ? stayVsLeaveSection(p, resolved) : null;
  const rothVsTraditional = rothSection(p);
  const ira = iraSection(p);

  const sections: AnalysisSection[] = [];
  if (stayVsLeave) sections.push(stayVsLeave);
  if (retirement) sections.push(retirement);
  if (rothVsTraditional) sections.push(rothVsTraditional);
  sections.push(ira);

  return {
    generatedOn: p.generatedOn,
    retirement,
    stayVsLeave,
    rothVsTraditional,
    ira,
    sections,
    assumptions: [
      a("inflation", "Inflation", s.inflationPct, "percent", "Used to deflate every nominal figure into today's dollars, and as the retired-pay COLA.", "payload"),
      a("horizon", "Projection horizon", s.projectionYears, "years", `Everything is compared at the same end age (${s.currentAge + s.projectionYears}) so the two paths are measured on equal ground.`, "payload"),
      a("life-expectancy", "Retired pay assumed through age", resolved.lifeExpectancyAge, "age", "A planning assumption. Living longer makes the pension worth proportionally more.", opts.lifeExpectancyAge ? "caller" : "default"),
      a("withdrawal-rate", "Sustainable withdrawal rate", resolved.withdrawalRatePct, "percent", "Used both to capitalize the pension into a nest-egg equivalent and, in the projector, to turn a balance into income.", opts.withdrawalRatePct ? "caller" : "default"),
      a("tax-basis", "Tax basis", "pre-tax unless stated", "text", "Balances and the pension are compared pre-tax. Only the Roth section applies tax rates, because only it has one to apply.", "default"),
    ],
    caveats: [
      c("estimate", "Every figure here is a planning estimate built on assumed returns and assumed tax rates. None of it is a guarantee, and none of it is individual financial advice.", "caution"),
      c("verify", "Verify pay tables at DFAS and contribution limits at tsp.gov and irs.gov before acting on any of it.", "info"),
    ],
  };
}
