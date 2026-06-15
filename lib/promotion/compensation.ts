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
};

export type CompOptions = {
  zip?: string;
  withDependents: boolean;
};

export type CompPhase = {
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

export type CompTotals = {
  taxable: number;
  untaxable: number;
  total: number;
  months: number;
  untaxablePct: number;
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
};

const RETIREMENT_HORIZON_MONTHS = 240; // 20-year active-duty retirement

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

  for (let m = 0; m < RETIREMENT_HORIZON_MONTHS; m++) {
    const grade = gradeAtMonth(m);
    const years = m / 12;
    const base = basePayFor(dataset, grade, years) ?? 0;
    const bas = getBAS(year, grade) ?? 0;
    const bah = bahForGrade(grade);
    const untax = bas + bah;

    retTax += base;
    retUntax += untax;
    if (m < etsMonths) {
      etsTax += base;
      etsUntax += untax;
    }

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

  return {
    hasBah,
    bahStatus: wantBah ? bahStatus : null,
    year,
    phases,
    toETS: makeTotals(etsTax, etsUntax, etsMonths),
    toRetire: makeTotals(retTax, retUntax, RETIREMENT_HORIZON_MONTHS),
    etsMonths,
    horizonMonths: RETIREMENT_HORIZON_MONTHS,
  };
}
