// "I've been contributing too much" — the mid-year TSP reset.
//
// Setting a high contribution percent early in the year hits the IRS elective
// deferral limit before December. TSP/DFAS simply stops the deferral at the
// limit, and that is where the damage is: the BRS agency match is calculated
// per pay period, so every month you are stopped you forfeit that month's
// match. Front-loading does not get you more money — it gets you less.
//
// This works out the percent to run for the rest of the year so the last
// dollar lands on the last pay period, and says plainly when the required
// percent has dropped under the 5% that captures the full match.
//
// Pure functions; planning estimates only. Pay periods are modelled as months,
// which is how military pay and this whole site work.

import { TSP_ELECTIVE_DEFERRAL_LIMIT_2026 } from "@/lib/pay/tsp";

/** Contributing at least this share of base pay captures the full BRS match. */
export const FULL_MATCH_PCT = 0.05;

export const MONTHS_PER_YEAR = 12;

export type TspResetInput = {
  /** Monthly base pay — only base pay counts toward TSP contributions. */
  monthlyBasePay: number;
  /** Contribution percent currently elected, as a decimal (0.60 = 60%). */
  currentPct: number;
  /** Months of this calendar year already contributed at that percent. */
  monthsElapsed: number;
  /**
   * Dollars already deferred this year. Omit to estimate it from the current
   * percent and months elapsed.
   */
  contributedYtd?: number;
  /** Elective deferral limit; defaults to the 2026 figure. */
  annualLimit?: number;
};

export type TspResetResult = {
  limit: number;
  /** Dollars deferred so far this year (supplied or estimated). */
  contributedYtd: number;
  /** Room left before the limit, floored at zero. */
  remainingRoom: number;
  monthsRemaining: number;
  /** Percent to elect for the remaining months to land exactly on the limit. */
  suggestedPct: number;
  suggestedMonthly: number;
  /** The even percent that would have spread the limit across all 12 months. */
  evenPctForYear: number;
  /** Where the current election lands by 31 Dec if nothing changes. */
  projectedIfUnchanged: number;
  /** Dollars that would be cut off by the limit if nothing changes. */
  projectedOverage: number;
  /** Month of the year (1-12) the limit is reached at the current percent. */
  limitReachedInMonth: number | null;
  /** Months you would sit stopped, forfeiting the match, if nothing changes. */
  matchMonthsAtRisk: number;
  /** Already at or past the limit — nothing left to contribute this year. */
  alreadyAtLimit: boolean;
  /** Staying under the limit now requires dropping below the full-match point. */
  belowMatchFloor: boolean;
  warnings: string[];
};

function clampPct(pct: number): number {
  if (!Number.isFinite(pct) || pct < 0) return 0;
  return Math.min(1, pct);
}

/**
 * Month of the calendar year in which a steady election reaches the limit,
 * or null if it never does.
 */
export function monthLimitIsReached(
  monthlyBasePay: number,
  pct: number,
  limit: number
): number | null {
  const perMonth = monthlyBasePay * clampPct(pct);
  if (!(perMonth > 0)) return null;
  const month = Math.ceil(limit / perMonth);
  return month <= MONTHS_PER_YEAR ? month : null;
}

export function computeTspReset(input: TspResetInput): TspResetResult {
  const limit = input.annualLimit ?? TSP_ELECTIVE_DEFERRAL_LIMIT_2026;
  const pay = Math.max(0, input.monthlyBasePay);
  const currentPct = clampPct(input.currentPct);
  const monthsElapsed = Math.min(
    MONTHS_PER_YEAR,
    Math.max(0, Math.floor(input.monthsElapsed))
  );
  const monthsRemaining = MONTHS_PER_YEAR - monthsElapsed;

  // What has actually gone in: either the figure from their LES, or the
  // estimate from the election — capped, because TSP stops at the limit.
  const estimated = Math.min(limit, pay * currentPct * monthsElapsed);
  const contributedYtd = Math.min(
    limit,
    Math.max(0, input.contributedYtd ?? estimated)
  );

  const remainingRoom = Math.max(0, limit - contributedYtd);
  const alreadyAtLimit = remainingRoom <= 0;

  const suggestedPct =
    monthsRemaining > 0 && pay > 0
      ? clampPct(remainingRoom / (pay * monthsRemaining))
      : 0;
  const suggestedMonthly = pay * suggestedPct;

  const evenPctForYear = pay > 0 ? clampPct(limit / (pay * MONTHS_PER_YEAR)) : 0;

  const uncappedRestOfYear = pay * currentPct * monthsRemaining;
  const projectedIfUnchanged = contributedYtd + uncappedRestOfYear;
  const projectedOverage = Math.max(0, projectedIfUnchanged - limit);

  const limitReachedInMonth = monthLimitIsReached(pay, currentPct, limit);
  // Months spent stopped at the limit, where only the automatic 1% keeps
  // arriving and the up-to-4% match is forfeited.
  const matchMonthsAtRisk =
    limitReachedInMonth === null ? 0 : MONTHS_PER_YEAR - limitReachedInMonth;

  const belowMatchFloor =
    !alreadyAtLimit && monthsRemaining > 0 && suggestedPct < FULL_MATCH_PCT;

  const warnings: string[] = [];
  if (pay <= 0) {
    warnings.push("Enter your monthly base pay to work out a percentage.");
  }
  if (alreadyAtLimit) {
    warnings.push(
      "You have already reached this year's limit, so nothing more can go in until January. " +
        "The automatic 1% keeps arriving, but the match on your own contributions does not."
    );
  } else if (monthsRemaining === 0) {
    warnings.push("The year is over — set your January election instead.");
  }
  if (belowMatchFloor) {
    warnings.push(
      `Landing exactly on the limit needs ${(suggestedPct * 100).toFixed(1)}%, which is under the ` +
        "5% that earns the full match. Contributing 5% instead is usually worth more than the " +
        "small amount of limit headroom it costs — check with your finance office."
    );
  }
  if (!alreadyAtLimit && matchMonthsAtRisk > 0) {
    warnings.push(
      `At ${(currentPct * 100).toFixed(0)}% you reach the limit in month ${limitReachedInMonth}, ` +
        `then contribute nothing for the last ${matchMonthsAtRisk} month${
          matchMonthsAtRisk === 1 ? "" : "s"
        } — forfeiting the match in each of them.`
    );
  }

  return {
    limit,
    contributedYtd,
    remainingRoom,
    monthsRemaining,
    suggestedPct,
    suggestedMonthly,
    evenPctForYear,
    projectedIfUnchanged,
    projectedOverage,
    limitReachedInMonth,
    matchMonthsAtRisk,
    alreadyAtLimit,
    belowMatchFloor,
    warnings,
  };
}
