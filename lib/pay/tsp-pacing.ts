// TSP pacing — what a contribution percent does across a calendar year.
//
// TSP stops your contributions at the annual elective-deferral limit, so a high
// percent does not put in more; it puts the same amount in sooner. The damage
// is the BRS match: the service matches the money you actually put in each pay
// period, so every month you sit stopped at the limit is a month with no match.
// There is no year-end make-up — a month that goes by with nothing going in has
// its match gone for good (TSP Bulletin 25-3; tsp.gov "Contribution types").
//
// The Service Automatic 1% is NOT affected: it keeps arriving whether or not
// the member contributes. Only the matching portion (up to 4%) can be lost.
//
// One shared calculation so the projection engine and the UI agree on the
// numbers. The month-of-limit maths lives in lib/pay/tsp-reset.ts and is
// imported rather than repeated.
//
// Pure functions; planning estimates only. Pay periods are modelled as months,
// which is how military pay and this whole site work.

import { TSP_ELECTIVE_DEFERRAL_LIMIT_2026 } from "@/lib/pay/tsp";
import { FULL_MATCH_PCT, MONTHS_PER_YEAR, monthLimitIsReached } from "@/lib/pay/tsp-reset";

/**
 * Service Automatic contribution: 1% of base pay, paid whether or not the
 * member contributes anything. It continues through months where the member is
 * stopped at the limit, so it is never part of a front-loading loss.
 */
export const BRS_AUTOMATIC_PCT = 0.01;

/** Most the service will match: 3% dollar-for-dollar + 2% at 50 cents = 4%. */
export const BRS_MAX_MATCH_PCT = 0.04;

/** Month-of-service gates from the DoD BRS policy (month 1 is service month 0). */
export const BRS_AUTOMATIC_START_MONTH = 2; // after 60 days
export const BRS_MATCH_START_MONTH = 24; // beginning of the 25th month
export const BRS_GOVERNMENT_END_MONTH = 312; // through the pay period reaching 26 YOS

export type BrsEligibility = { automatic: boolean; matching: boolean };

/** Whether BRS government contributions apply at the start of a modeled month. */
export function brsEligibilityAtServiceMonth(serviceMonth: number): BrsEligibility {
  const month = Number.isFinite(serviceMonth) ? Math.max(0, Math.floor(serviceMonth)) : 0;
  return {
    automatic: month >= BRS_AUTOMATIC_START_MONTH && month <= BRS_GOVERNMENT_END_MONTH,
    matching: month >= BRS_MATCH_START_MONTH && month <= BRS_GOVERNMENT_END_MONTH,
  };
}

/**
 * Service Matching only (no automatic 1%), for a given share of base pay
 * actually contributed that month: 100% on the first 3%, 50% on the next 2%,
 * nothing above 5%. Contribute nothing in a month and the match is nothing.
 */
export function brsMatchPct(memberContribPct: number): number {
  if (!Number.isFinite(memberContribPct)) return 0;
  const c = Math.min(Math.max(0, memberContribPct), FULL_MATCH_PCT);
  return Math.min(c, 0.03) + Math.max(0, c - 0.03) * 0.5;
}

export type TspPacing = {
  /** Elected contribution per month (percent × monthly base pay). */
  perMonth: number;
  /** Month of the year (1-12) the limit is reached; null if it never is. */
  limitReachedInMonth: number | null;
  /** Months spent contributing nothing because the limit was already hit. */
  monthsStopped: number;
  /** Match dollars forfeited in each stopped month (the automatic 1% is not lost). */
  matchLostMonthly: number;
  /** matchLostMonthly × monthsStopped — the year's forfeited match. */
  matchLostTotal: number;
  /** The percent whose last dollar lands on the December pay date. */
  evenPct: number;
  /** Monthly dollars at that even percent. */
  evenMonthly: number;
  /** True when the election stops before December, i.e. match is being lost. */
  frontLoading: boolean;
  /** The limit these figures were worked out against. */
  limit: number;
};

export type TspPacingOptions = {
  /** Under BRS (matched). Defaults to true; false means there is no match to lose. */
  brs?: boolean;
  /** Elective deferral limit; defaults to the 2026 figure. */
  limit?: number;
};

function clampPct(pct: number): number {
  if (!Number.isFinite(pct) || pct < 0) return 0;
  return Math.min(1, pct);
}

/**
 * Binary-float dust guard for the December boundary. An election paced to land
 * exactly on the limit in month 12 computes as 12.000000000000002 months for
 * roughly half of all pay figures, which would read as "never reaches the
 * limit". A relative tolerance far smaller than a cent keeps the recommended
 * percent reporting December instead of flickering.
 */
const BOUNDARY_TOLERANCE = 1e-9;

/**
 * Where a steady contribution percent lands across the year, and what the
 * pacing costs in forfeited match.
 *
 * Deliberately does NOT gate on age or years of service — a member under 2 YOS
 * or over 26 YOS has no match to lose, and a member 50 or over spills into
 * catch-up instead of stopping. Callers own those gates; pass `brs: false` to
 * zero the loss.
 */
export function computeTspPacing(
  monthlyBasePay: number,
  pct: number,
  opts?: TspPacingOptions
): TspPacing {
  const rawLimit = opts?.limit ?? TSP_ELECTIVE_DEFERRAL_LIMIT_2026;
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : 0;
  const pay =
    Number.isFinite(monthlyBasePay) && monthlyBasePay > 0 ? monthlyBasePay : 0;
  const p = clampPct(pct);
  const brs = opts?.brs ?? true;

  const perMonth = pay * p;
  const limitReachedInMonth =
    limit > 0 ? monthLimitIsReached(pay, p, limit * (1 - BOUNDARY_TOLERANCE)) : null;
  const monthsStopped =
    limitReachedInMonth === null ? 0 : MONTHS_PER_YEAR - limitReachedInMonth;

  // What the match would have been in a month that got nothing: the whole of
  // it. The automatic 1% is excluded — it keeps arriving regardless. Zero when
  // no month is stopped, so the UI can print this figure without re-checking.
  const matchLostMonthly = brs && monthsStopped > 0 ? brsMatchPct(p) * pay : 0;
  const matchLostTotal = matchLostMonthly * monthsStopped;

  const evenPct = pay > 0 && limit > 0 ? clampPct(limit / (pay * MONTHS_PER_YEAR)) : 0;

  return {
    perMonth,
    limitReachedInMonth,
    monthsStopped,
    matchLostMonthly,
    matchLostTotal,
    evenPct,
    evenMonthly: pay * evenPct,
    frontLoading: monthsStopped > 0,
    limit,
  };
}
