// lib/promotion/compensation.ts
// Pure, client-safe projection of total military compensation over a career,
// binned into taxable (base pay) vs non-taxable (BAH + BAS) buckets. Mirrors the
// promotion timing used by buildPromotionTimeline so the two views stay in sync.
//
// Base pay is taxable. BAH and BAS are generally non-taxable allowances. The
// month-by-month accumulation captures within-grade longevity raises (the DFAS
// "over N years" pay-table columns), so the totals are more accurate than a flat
// monthly figure multiplied by the number of months.

import { BranchId, Track, stepsForTrack } from "@/data/promotion/timing";
import { BasePayDataset, basePayFor } from "@/lib/pay/basepay-lookup";
import { getBAS } from "@/lib/pay/bas";
import { getBahLookup } from "@/lib/pay/bah";

// Mirror of the PayGrade union accepted by the BAH lookup.
type BahGrade = Parameters<typeof getBahLookup>[1];

export type CompInputs = {
  branch: BranchId;
  track: Track;
  startGrade: string;
  contractYears: number;
  /** Date entered service (YYYY-MM-DD) — used only to flag which retirement system applies. */
  accessionDate?: string;
};

export type CompOptions = {
  zip?: string;
  withDependents: boolean;
};

type CompPhase = {
  grade: string;
  fromMonth: number;
  months: number;
  // Representative monthly figures at entry to the grade.
  monthlyBase: number;
  monthlyBas: number;
  monthlyBah: number;
  monthlyTotal: number;
  // Longevity-aware cumulative totals across the phase.
  taxable: number;
  untaxable: number;
};

type CompTotals = {
  taxable: number;
  untaxable: number;
  total: number;
  months: number;
  untaxablePct: number;
};

/** One military retirement system, valued at the 20-year point. */
type RetirementSystemValue = {
  key: "legacy" | "brs";
  label: string;
  /** Pension multiplier as a percent of High-3 (50 for Legacy, 40 for BRS at 20 yr). */
  multiplierPct: number;
  monthlyPension: number;
  annualPension: number;
  /** Pension collected over the illustrative payout horizon (no COLA). */
  pensionPayout: number;
  /** Government TSP contributions, principal only (BRS only; 0 for Legacy). */
  tspGovPrincipal: number;
  /** Government TSP contributions grown at the assumed rate (BRS only). */
  tspGovWithGrowth: number;
  /** Estimated continuation pay near the 12-year mark (BRS only). */
  continuationPay: number;
  /** pensionPayout + BRS extras. */
  lifetimeValue: number;
};

type RetirementComparison = {
  /** Average of the highest 36 months of base pay. */
  high3Monthly: number;
  payoutYears: number;
  tspGrowthPct: number;
  continuationMultiple: number;
  /** Which system applies given the entry date (BRS for entrants on/after 2018-01-01). */
  yourSystem: "legacy" | "brs";
  legacy: RetirementSystemValue;
  brs: RetirementSystemValue;
};

export type CompProjection = {
  /** True once at least one positive BAH rate was found for the entered ZIP. */
  hasBah: boolean;
  /** First non-"ok" BAH lookup status, if a ZIP was entered (for surfacing errors). */
  bahStatus: string | null;
  year: number;
  phases: CompPhase[];
  toETS: CompTotals;
  toRetire: CompTotals;
  etsMonths: number;
  horizonMonths: number;
  retirement: RetirementComparison;
};

const RETIREMENT_HORIZON_MONTHS = 240; // 20-year active-duty retirement

// Retirement assumptions (planning estimates; disclaimed in the UI).
const RETIREMENT_YEARS_OF_SERVICE = 20;
const LEGACY_MULTIPLIER_PER_YEAR = 0.025; // High-3 ("High Three"): 2.5%/yr -> 50% at 20 yr
const BRS_MULTIPLIER_PER_YEAR = 0.02; // Blended Retirement System: 2.0%/yr -> 40% at 20 yr
const TSP_ANNUAL_GROWTH = 0.07; // illustrative average annual return on the government match
const RETIREMENT_PAYOUT_YEARS = 30; // illustrative pension-collection horizon (no COLA)
const BRS_CONTINUATION_MULTIPLE = 2.5; // active-duty floor (varies 2.5x-13x by branch/year)
const HIGH3_MONTHS = 36;

function gradeRank(grade: string): number {
  const m = grade.match(/(\d+)/);
  return m ? Number(m[1]) : 0;
}

function makeTotals(taxable: number, untaxable: number, months: number): CompTotals {
  const total = taxable + untaxable;
  return {
    taxable,
    untaxable,
    total,
    months,
    untaxablePct: total > 0 ? (untaxable / total) * 100 : 0,
  };
}

export function buildCompensationProjection(
  inputs: CompInputs,
  dataset: BasePayDataset,
  opts: CompOptions
): CompProjection {
  const year = dataset.year;
  const startRank = gradeRank(inputs.startGrade);
  const steps = stepsForTrack(inputs.branch, inputs.track)
    .filter((s) => gradeRank(s.toGrade) > startRank)
    .slice()
    .sort((a, b) => a.tisMonths - b.tisMonths);

  // Grade held at a given month index (months since accession).
  function gradeAtMonth(m: number): string {
    let g = inputs.startGrade;
    for (const s of steps) {
      if (m >= s.tisMonths) g = s.toGrade;
      else break;
    }
    return g;
  }

  // BAH only when a ZIP is supplied; cache lookups by grade.
  const zip = (opts.zip ?? "").trim();
  const wantBah = zip.length > 0;
  let bahStatus: string | null = null;
  let hasBah = false;
  const bahByGrade = new Map<string, number>();
  function bahForGrade(grade: string): number {
    if (!wantBah) return 0;
    const cached = bahByGrade.get(grade);
    if (cached !== undefined) return cached;
    const res = getBahLookup(zip, grade as BahGrade, opts.withDependents);
    if (res.status !== "ok" && bahStatus === null) bahStatus = res.status;
    const rate = res.rate ?? 0;
    if (rate > 0) hasBah = true;
    bahByGrade.set(grade, rate);
    return rate;
  }

  const etsMonths = Math.min(
    RETIREMENT_HORIZON_MONTHS,
    Math.max(0, Math.round(inputs.contractYears * 12))
  );

  const phaseMap = new Map<string, CompPhase>();
  const phaseOrder: string[] = [];
  let etsTax = 0;
  let etsUntax = 0;
  let retTax = 0;
  let retUntax = 0;

  // For the retirement calc: base pay per month, plus the running government TSP
  // match balance (BRS) accumulated with growth.
  const baseByMonth: number[] = [];
  const tspMonthlyRate = TSP_ANNUAL_GROWTH / 12;
  let tspGovPrincipal = 0;
  let tspGovBalance = 0;

  for (let m = 0; m < RETIREMENT_HORIZON_MONTHS; m++) {
    const grade = gradeAtMonth(m);
    const years = m / 12;
    // Passing service months applies the reduced E-1 first-4-months rate.
    const base = basePayFor(dataset, grade, years, m) ?? 0;
    const bas = getBAS(year, grade) ?? 0;
    const bah = bahForGrade(grade);
    const untax = bas + bah;

    retTax += base;
    retUntax += untax;
    if (m < etsMonths) {
      etsTax += base;
      etsUntax += untax;
    }

    // Government TSP under BRS: auto 1% after ~60 days, +4% match after 2 years.
    baseByMonth.push(base);
    const govRate = m >= 24 ? 0.05 : m >= 2 ? 0.01 : 0;
    const govContrib = base * govRate;
    tspGovPrincipal += govContrib;
    tspGovBalance = tspGovBalance * (1 + tspMonthlyRate) + govContrib;

    let phase = phaseMap.get(grade);
    if (!phase) {
      phase = {
        grade,
        fromMonth: m,
        months: 0,
        monthlyBase: base,
        monthlyBas: bas,
        monthlyBah: bah,
        monthlyTotal: base + untax,
        taxable: 0,
        untaxable: 0,
      };
      phaseMap.set(grade, phase);
      phaseOrder.push(grade);
    }
    phase.months += 1;
    phase.taxable += base;
    phase.untaxable += untax;
  }

  const phases = phaseOrder.map((g) => phaseMap.get(g) as CompPhase);

  // ---- Retirement: Legacy High-3 vs Blended Retirement System (BRS) ----
  // Base pay is non-decreasing over a career, so the highest 36 months are the
  // last 36 -> a clean High-3 average.
  const last36 = baseByMonth.slice(-HIGH3_MONTHS);
  const high3Monthly =
    last36.length > 0 ? last36.reduce((a, b) => a + b, 0) / last36.length : 0;

  const continuationBase = baseByMonth[144] ?? high3Monthly; // ~12-year mark
  const continuationPay = continuationBase * BRS_CONTINUATION_MULTIPLE;

  const payoutMonths = RETIREMENT_PAYOUT_YEARS * 12;
  const legacyMonthly = high3Monthly * LEGACY_MULTIPLIER_PER_YEAR * RETIREMENT_YEARS_OF_SERVICE;
  const brsMonthly = high3Monthly * BRS_MULTIPLIER_PER_YEAR * RETIREMENT_YEARS_OF_SERVICE;

  const legacy: RetirementSystemValue = {
    key: "legacy",
    label: "Legacy (High-3)",
    multiplierPct: LEGACY_MULTIPLIER_PER_YEAR * RETIREMENT_YEARS_OF_SERVICE * 100,
    monthlyPension: legacyMonthly,
    annualPension: legacyMonthly * 12,
    pensionPayout: legacyMonthly * payoutMonths,
    tspGovPrincipal: 0,
    tspGovWithGrowth: 0,
    continuationPay: 0,
    lifetimeValue: legacyMonthly * payoutMonths,
  };

  const brs: RetirementSystemValue = {
    key: "brs",
    label: "Blended Retirement (BRS)",
    multiplierPct: BRS_MULTIPLIER_PER_YEAR * RETIREMENT_YEARS_OF_SERVICE * 100,
    monthlyPension: brsMonthly,
    annualPension: brsMonthly * 12,
    pensionPayout: brsMonthly * payoutMonths,
    tspGovPrincipal,
    tspGovWithGrowth: tspGovBalance,
    continuationPay,
    lifetimeValue: brsMonthly * payoutMonths + tspGovBalance + continuationPay,
  };

  const accessionYear = inputs.accessionDate ? Number(inputs.accessionDate.slice(0, 4)) : null;
  const yourSystem: "legacy" | "brs" =
    accessionYear !== null && Number.isFinite(accessionYear) && accessionYear < 2018
      ? "legacy"
      : "brs";

  const retirement: RetirementComparison = {
    high3Monthly,
    payoutYears: RETIREMENT_PAYOUT_YEARS,
    tspGrowthPct: TSP_ANNUAL_GROWTH * 100,
    continuationMultiple: BRS_CONTINUATION_MULTIPLE,
    yourSystem,
    legacy,
    brs,
  };

  return {
    hasBah,
    bahStatus: wantBah ? bahStatus : null,
    year,
    phases,
    toETS: makeTotals(etsTax, etsUntax, etsMonths),
    toRetire: makeTotals(retTax, retUntax, RETIREMENT_HORIZON_MONTHS),
    etsMonths,
    horizonMonths: RETIREMENT_HORIZON_MONTHS,
    retirement,
  };
}
