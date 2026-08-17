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
import { IRA_CONTRIBUTION_LIMIT_2026 } from "@/lib/pay/ira";
import { TSP_ELECTIVE_DEFERRAL_LIMIT_2026 } from "@/lib/pay/tsp";
import { BRS_AUTOMATIC_PCT, brsMatchPct } from "@/lib/pay/tsp-pacing";

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
  /** The schedule's typical time-in-service point for this step, in months. */
  tisMonths: number;
  /**
   * True when the typical point is already behind the member: they hold a lower
   * grade than the schedule expects at their time in service, so the step is
   * shown as due now rather than dropped.
   */
  behindSchedule: boolean;
  /** Context note from the branch schedule ("Typically automatic at 18 months…"). */
  note?: string;
};

/**
 * Typical promotions between now and separation.
 *
 * Every grade above the member's current one is listed. A step whose typical
 * point has already passed (an O-1 at 2 YOS is past O-2's 18-month point) is
 * pinned at "now" and flagged rather than filtered out — dropping it made the
 * next grade appear to be a skip (O-1 straight to O-3) while gradeAtTis was
 * quietly paying the intermediate grade anyway. Pin dates never move backwards,
 * so the order always reads sensibly.
 */
export function upcomingPromotions(
  branch: BranchId,
  track: Track,
  currentGrade: string,
  currentYosYears: number,
  serviceYearsRemaining: number
): PromotionEvent[] {
  const nowTis = currentYosYears * 12;
  const endTis = (currentYosYears + serviceYearsRemaining) * 12;
  // No service window left: someone separating today gets no more promotions,
  // not even one that is already overdue.
  if (endTis <= nowTis) return [];

  const events: PromotionEvent[] = [];
  let cursor = nowTis;

  for (const step of stepsForTrack(branch, track)) {
    if (gradeNumber(step.toGrade) <= gradeNumber(currentGrade)) continue;
    const pinTis = Math.max(step.tisMonths, cursor);
    if (pinTis > endTis) break;
    events.push({
      monthIndex: Math.round(pinTis - nowTis),
      toGrade: step.toGrade,
      competitive: !!step.competitive,
      tisMonths: step.tisMonths,
      behindSchedule: step.tisMonths <= nowTis,
      note: step.note,
    });
    cursor = pinTis;
  }

  return events;
}

/** How a ladder step relates to where the member is today. */
export type LadderStatus = "held" | "due" | "upcoming" | "beyond";

export type LadderStep = {
  toGrade: string;
  tisMonths: number;
  competitive: boolean;
  note?: string;
  status: LadderStatus;
  /** Months from now, for the steps that are still ahead. */
  monthIndex: number | null;
};

/**
 * The full assumed promotion ladder for a track, annotated for display.
 *
 * The projection is only as good as this schedule, so the UI shows the whole
 * thing — including the steps treated as already earned — instead of only the
 * ones still ahead.
 */
export function promotionLadder(
  branch: BranchId,
  track: Track,
  currentGrade: string,
  currentYosYears: number,
  serviceYearsRemaining: number
): LadderStep[] {
  const ahead = new Map(
    upcomingPromotions(branch, track, currentGrade, currentYosYears, serviceYearsRemaining).map(
      (e) => [e.toGrade, e]
    )
  );

  return stepsForTrack(branch, track).map((step) => {
    const event = ahead.get(step.toGrade);
    const held = gradeNumber(step.toGrade) <= gradeNumber(currentGrade);
    const status: LadderStatus = held
      ? "held"
      : event
        ? event.behindSchedule
          ? "due"
          : "upcoming"
        : "beyond";
    return {
      toGrade: step.toGrade,
      tisMonths: step.tisMonths,
      competitive: !!step.competitive,
      note: step.note,
      status,
      monthIndex: event ? event.monthIndex : null,
    };
  });
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

  // Civilian IRA (optional). Contributions run during AND after service until
  // the member's chosen stop age — the "keep contributing to an IRA until X"
  // mechanic. Return should be net of fund fees (caller subtracts the expense
  // ratio). Monthly amounts are capped at the annual IRS limit.
  iraBalance?: number;
  iraMonthly?: number;
  iraMonthlyAfter?: number;
  iraUntilAge?: number;
  iraReturn?: number;

  // Civilian 401(k) (optional): contributions start at separation and run
  // until the chosen stop age. k401Monthly is the member's own (employee)
  // contribution and is capped at the IRS elective-deferral limit, exactly
  // like the TSP employee share. Employer match goes in k401MatchMonthly —
  // it does not count against the elective-deferral limit, so it rides on
  // top uncapped (mirroring the TSP agency contribution).
  k401Monthly?: number;
  k401MatchMonthly?: number;
  k401UntilAge?: number;
  k401Return?: number;

  inflation: number;
};

/** Account balances tracked by the projection. */
export type AccountBalances = {
  tsp: number;
  invest: number;
  savings: number;
  ira: number;
  k401: number;
};

export type CareerYearSnapshot = {
  yearIndex: number; // 1-based
  age: number;
  serving: boolean;
  /** Grade at the end of the year (last served grade after separation). */
  grade: string;
  /** Monthly base pay at the end of the year; 0 after separation. */
  basePayMonthly: number;
  balances: AccountBalances;
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
  totals: {
    contributed: number;
    growth: number;
    /** All agency dollars: Service Automatic 1% + Service Matching. */
    agencyMatch: number;
    employeeTsp: number;
    /**
     * Matching dollars forfeited because the election ran into the annual
     * elective-deferral limit before December, leaving months with nothing
     * contributed and therefore nothing matched. The automatic 1% is never
     * part of this — it keeps arriving. 0 when nothing is front-loaded.
     */
    matchForfeited: number;
  };
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
  const rIra = monthlyRate(i.iraReturn ?? 0);
  const rK401 = monthlyRate(i.k401Return ?? 0);

  // IRA contributions honor the annual IRS limit (monthly cap here).
  const iraCapMonthly = IRA_CONTRIBUTION_LIMIT_2026 / 12;
  const iraMonthly = Math.min(iraCapMonthly, Math.max(0, i.iraMonthly ?? 0));
  const iraMonthlyAfter = Math.min(iraCapMonthly, Math.max(0, i.iraMonthlyAfter ?? 0));
  const iraUntilAge = i.iraUntilAge ?? Infinity;
  // 401(k) employee contributions honor the IRS elective-deferral limit
  // (same cap the TSP employee share uses); the employer match rides on top.
  const k401Monthly = Math.min(
    TSP_ELECTIVE_DEFERRAL_LIMIT_2026 / 12,
    Math.max(0, i.k401Monthly ?? 0)
  );
  const k401MatchMonthly = Math.max(0, i.k401MatchMonthly ?? 0);
  const k401UntilAge = i.k401UntilAge ?? Infinity;

  let tsp = Math.max(0, i.tspBalance);
  let invest = Math.max(0, i.invBalance);
  let savings = Math.max(0, i.savBalance);
  let ira = Math.max(0, i.iraBalance ?? 0);
  let k401 = 0;
  let contributed = tsp + invest + savings + ira;
  let agencyMatch = 0;
  let employeeTsp = 0;
  let matchForfeited = 0;
  // Employee TSP deferrals inside the current calendar year. The sim treats
  // monthIndex 0 as January, so this resets every 12 months — the same
  // boundary the year snapshots use.
  let tspDeferredThisYear = 0;

  const promotions = i.modelPromotions
    ? upcomingPromotions(i.branch, i.track, i.currentGrade, i.currentYosYears, serviceYears)
    : [];

  const years: CareerYearSnapshot[] = [];
  const payTimeline: CareerProjection["payTimeline"] = [];

  let lastGrade = i.currentGrade;
  let lastBasePay = 0;
  let yearContributions = 0;
  let yearStartTotal = tsp + invest + savings + ira;

  for (let m = 0; m < months; m++) {
    const serving = m < separationMonth;
    const yearIndex = Math.floor(m / 12); // 0-based during the loop
    // Age during this month, for the IRA/401(k) contribution-stop ages.
    const ageNow = i.currentAge + m / 12;

    // January: the elective-deferral limit resets and the deferral stops that
    // ran to the end of December are lifted.
    if (m % 12 === 0) tspDeferredThisYear = 0;

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

      // Real year-to-date accounting, not an even monthly cap. TSP stops the
      // deferral the moment the calendar year's limit is reached, so a high
      // percent contributes the elected amount until the room runs out and
      // then nothing at all for the rest of that year.
      const electedPct = Number.isFinite(i.tspPct) ? Math.max(0, i.tspPct) : 0;
      const room = Math.max(0, TSP_ELECTIVE_DEFERRAL_LIMIT_2026 - tspDeferredThisYear);
      const employee = Math.min(electedPct * basePay, room);
      tspDeferredThisYear += employee;

      // The match follows what ACTUALLY went in this month, not the election:
      // a truncated final contribution still earns its tier, and a stopped
      // month earns nothing. The Service Automatic 1% continues either way.
      const actualPct = basePay > 0 ? employee / basePay : 0;
      const automatic = i.brs ? BRS_AUTOMATIC_PCT * basePay : 0;
      const match = i.brs ? brsMatchPct(actualPct) * basePay : 0;
      const agency = automatic + match;

      // What the same election would have matched had it been paced to last
      // the year. The gap is the front-loading loss, and it is permanent —
      // missed matching is not made up later.
      const matchIfPaced = i.brs ? brsMatchPct(electedPct) * basePay : 0;
      matchForfeited += Math.max(0, matchIfPaced - match);

      const iraContrib = ageNow < iraUntilAge ? iraMonthly : 0;

      tsp = tsp * (1 + rTsp) + employee + agency;
      invest = invest * (1 + rInv) + Math.max(0, i.invMonthly);
      savings = savings * (1 + rSav) + Math.max(0, i.savMonthly);
      ira = ira * (1 + rIra) + iraContrib;
      k401 = k401 * (1 + rK401);

      contribution =
        employee + agency + Math.max(0, i.invMonthly) + Math.max(0, i.savMonthly) + iraContrib;
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
      const iraContrib = ageNow < iraUntilAge ? iraMonthlyAfter : 0;
      const k401Contrib = ageNow < k401UntilAge ? k401Monthly + k401MatchMonthly : 0;
      tsp = tsp * (1 + rTsp);
      invest = invest * (1 + rInv) + Math.max(0, i.invMonthlyAfter);
      savings = savings * (1 + rSav) + Math.max(0, i.savMonthlyAfter);
      ira = ira * (1 + rIra) + iraContrib;
      k401 = k401 * (1 + rK401) + k401Contrib;
      contribution =
        Math.max(0, i.invMonthlyAfter) + Math.max(0, i.savMonthlyAfter) + iraContrib + k401Contrib;
    }

    contributed += contribution;
    yearContributions += contribution;

    if ((m + 1) % 12 === 0) {
      const y = yearIndex + 1;
      const total = tsp + invest + savings + ira + k401;
      years.push({
        yearIndex: y,
        age: i.currentAge + y,
        serving: m < separationMonth,
        grade: lastGrade,
        basePayMonthly: lastBasePay,
        balances: { tsp, invest, savings, ira, k401 },
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
      matchForfeited,
    },
    payTimeline,
  };
}
