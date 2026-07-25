// Career-aware wealth projection.
//
// Extends the flat projection in lib/projection/wealth.ts with the service
// member's actual career arc: typical promotion timing (from the Career
// Timeline's per-branch schedules) drives the pay grade over time, the grade +
// years of service drive base pay from the DFAS tables, and base pay drives
// the TSP contribution and BRS match. Service length and projection horizon
// are independent — serve 5 more years, project to age 60 — so the tool can
// show what military-era savings compound into long after separation.
//
// Everything here is a pure function of its inputs. Planning estimates only.

import { stepsForTrack, type BranchId, type Track } from "@/data/promotion/timing";
import { basePayFor, type BasePayDataset } from "@/lib/pay/basepay-lookup";
import { TSP_ELECTIVE_DEFERRAL_LIMIT_2026 } from "@/lib/pay/tsp";
import { brsAgencyPct } from "@/lib/projection/wealth";

/** Numeric rank within a track ("E-5" → 5) for floor/ceiling comparisons. */
export function gradeNumber(grade: string): number {
  const n = Number(grade.split("-")[1]);
  return Number.isFinite(n) ? n : 1;
}

/**
 * Expected grade at a given time-in-service, per the branch's typical
 * schedule, floored at the member's current grade (people ahead of the
 * schedule don't get demoted by the model).
 */
export function gradeAtTis(
  branch: BranchId,
  track: Track,
  currentGrade: string,
  tisMonths: number
): string {
  const prefix = track === "officer" ? "O" : "E";
  let grade = `${prefix}-1`;
  for (const step of stepsForTrack(branch, track)) {
    if (tisMonths >= step.tisMonths) grade = step.toGrade;
  }
  return gradeNumber(grade) >= gradeNumber(currentGrade) ? grade : currentGrade;
}

export type PromotionEvent = {
  /** Months from "now" when the promotion pins on. */
  monthIndex: number;
  toGrade: string;
  competitive: boolean;
};

/** Typical promotions expected between now and separation. */
export function upcomingPromotions(
  branch: BranchId,
  track: Track,
  currentGrade: string,
  currentYosYears: number,
  serviceYearsRemaining: number
): PromotionEvent[] {
  const nowTis = currentYosYears * 12;
  const endTis = (currentYosYears + serviceYearsRemaining) * 12;
  return stepsForTrack(branch, track)
    .filter(
      (s) =>
        s.tisMonths > nowTis &&
        s.tisMonths <= endTis &&
        gradeNumber(s.toGrade) > gradeNumber(currentGrade)
    )
    .map((s) => ({
      monthIndex: Math.round(s.tisMonths - nowTis),
      toGrade: s.toGrade,
      competitive: !!s.competitive,
    }));
}

export type CareerProjectionInput = {
  basepay: BasePayDataset;

  // Career
  branch: BranchId;
  track: Track;
  currentGrade: string;
  currentYosYears: number;
  /** How many more years the member stays in. */
  serviceYearsRemaining: number;
  /** When false, pay stays at the current grade (YOS raises still apply). */
  modelPromotions: boolean;
  /** Assumed annual military pay raise, decimal (0.02 = 2%/yr). */
  annualPayRaise: number;

  // Horizon
  /** Total years to project; clamped to at least the remaining service. */
  projectionYears: number;
  currentAge: number;

  // TSP
  tspBalance: number;
  tspPct: number;
  brs: boolean;
  tspReturn: number;

  // Taxable investments & savings: during-service and after-service pace.
  invBalance: number;
  invMonthly: number;
  invMonthlyAfter: number;
  invReturn: number;
  savBalance: number;
  savMonthly: number;
  savMonthlyAfter: number;
  savReturn: number;

  inflation: number;
};

export type CareerYearSnapshot = {
  yearIndex: number; // 1-based
  age: number;
  serving: boolean;
  /** Grade at the end of the year (last served grade after separation). */
  grade: string;
  /** Monthly base pay at the end of the year; 0 after separation. */
  basePayMonthly: number;
  balances: { tsp: number; invest: number; savings: number };
  total: number;
  contributed: number;
  growth: number;
  realTotal: number;
  /** Contributions made during this year (all sources, incl. match). */
  yearContributions: number;
  /** Market growth earned during this year. */
  yearGrowth: number;
};

export type CareerProjection = {
  years: CareerYearSnapshot[];
  final: CareerYearSnapshot;
  atSeparation: CareerYearSnapshot | null;
  promotions: PromotionEvent[];
  /** Months from now until separation. */
  separationMonth: number;
  totals: { contributed: number; growth: number; agencyMatch: number; employeeTsp: number };
  /** Monthly series for the pay/rank chart: base pay + grade per month while serving. */
  payTimeline: { monthIndex: number; grade: string; basePayMonthly: number; tspMonthly: number }[];
};

const monthlyRate = (annual: number) => Math.pow(1 + annual, 1 / 12) - 1;

export function projectCareerWealth(i: CareerProjectionInput): CareerProjection {
  const serviceYears = Math.max(0, i.serviceYearsRemaining);
  const totalYears = Math.max(Math.max(1, Math.ceil(i.projectionYears)), Math.ceil(serviceYears));
  const separationMonth = Math.round(serviceYears * 12);
  const months = totalYears * 12;

  const rTsp = monthlyRate(i.tspReturn);
  const rInv = monthlyRate(i.invReturn);
  const rSav = monthlyRate(i.savReturn);

  let tsp = Math.max(0, i.tspBalance);
  let invest = Math.max(0, i.invBalance);
  let savings = Math.max(0, i.savBalance);
  let contributed = tsp + invest + savings;
  let agencyMatch = 0;
  let employeeTsp = 0;

  const promotions = i.modelPromotions
    ? upcomingPromotions(i.branch, i.track, i.currentGrade, i.currentYosYears, serviceYears)
    : [];

  const years: CareerYearSnapshot[] = [];
  const payTimeline: CareerProjection["payTimeline"] = [];

  let lastGrade = i.currentGrade;
  let lastBasePay = 0;
  let yearContributions = 0;
  let yearStartTotal = tsp + invest + savings;

  for (let m = 0; m < months; m++) {
    const serving = m < separationMonth;
    const yearIndex = Math.floor(m / 12); // 0-based during the loop

    let contribution = 0;

    if (serving) {
      const tisMonths = i.currentYosYears * 12 + m;
      const grade = i.modelPromotions
        ? gradeAtTis(i.branch, i.track, i.currentGrade, tisMonths)
        : i.currentGrade;
      // Base pay from the DFAS table at this grade/YOS, escalated by the
      // assumed annual military pay raise. Missing table cells (e.g. senior
      // grades at low YOS) fall back to the last known pay.
      const tablePay = basePayFor(i.basepay, grade, tisMonths / 12);
      const raiseFactor = Math.pow(1 + Math.max(0, i.annualPayRaise), yearIndex);
      const basePay = (tablePay ?? (lastBasePay > 0 ? lastBasePay / raiseFactor : 0)) * raiseFactor;
      lastGrade = grade;
      lastBasePay = basePay;

      const employee = Math.min(
        Math.max(0, i.tspPct) * basePay,
        TSP_ELECTIVE_DEFERRAL_LIMIT_2026 / 12
      );
      const agency = i.brs ? brsAgencyPct(Math.max(0, i.tspPct)) * basePay : 0;

      tsp = tsp * (1 + rTsp) + employee + agency;
      invest = invest * (1 + rInv) + Math.max(0, i.invMonthly);
      savings = savings * (1 + rSav) + Math.max(0, i.savMonthly);

      contribution = employee + agency + Math.max(0, i.invMonthly) + Math.max(0, i.savMonthly);
      agencyMatch += agency;
      employeeTsp += employee;
      payTimeline.push({
        monthIndex: m,
        grade,
        basePayMonthly: basePay,
        tspMonthly: employee + agency,
      });
    } else {
      lastBasePay = 0;
      tsp = tsp * (1 + rTsp);
      invest = invest * (1 + rInv) + Math.max(0, i.invMonthlyAfter);
      savings = savings * (1 + rSav) + Math.max(0, i.savMonthlyAfter);
      contribution = Math.max(0, i.invMonthlyAfter) + Math.max(0, i.savMonthlyAfter);
    }

    contributed += contribution;
    yearContributions += contribution;

    if ((m + 1) % 12 === 0) {
      const y = yearIndex + 1;
      const total = tsp + invest + savings;
      years.push({
        yearIndex: y,
        age: i.currentAge + y,
        serving: m < separationMonth,
        grade: lastGrade,
        basePayMonthly: lastBasePay,
        balances: { tsp, invest, savings },
        total,
        contributed,
        growth: total - contributed,
        realTotal: total / Math.pow(1 + Math.max(0, i.inflation), y),
        yearContributions,
        yearGrowth: total - yearStartTotal - yearContributions,
      });
      yearContributions = 0;
      yearStartTotal = total;
    }
  }

  const final = years[years.length - 1];
  const sepYearIndex = Math.ceil(separationMonth / 12);
  const atSeparation =
    separationMonth > 0 ? years.find((y) => y.yearIndex === sepYearIndex) ?? null : null;

  return {
    years,
    final,
    atSeparation,
    promotions,
    separationMonth,
    totals: {
      contributed,
      growth: final.total - contributed,
      agencyMatch,
      employeeTsp,
    },
    payTimeline,
  };
}
