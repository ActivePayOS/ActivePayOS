// Military retirement mechanics — pure functions, no UI, no I/O.
//
// Everything here is traceable to statute or to a primary DoD/IRS source, and
// every judgement call is exported as a documented assumption rather than
// buried in a magic number. Citations (verified 2026-08):
//
//   10 U.S.C. § 1409(b)   retired-pay multiplier: 2.5%/yr legacy High-3,
//                         2.0%/yr under the modernized system (BRS).
//   10 U.S.C. § 1409(b)(3) the old 75% ceiling binds only members who retired
//                         before 1 Jan 2007 — do NOT cap a modern projection.
//   10 U.S.C. § 1409(c)   creditable service counts 1/12 of a year per full
//                         month, so fractional years are legitimate.
//   10 U.S.C. § 1407      High-3 = average of the HIGHEST 36 MONTHS of BASIC
//                         PAY (allowances and special pays excluded) for
//                         anyone who first became a member after 8 Sep 1980.
//   10 U.S.C. § 1401a(b)(2),(b)(5)
//                         retired pay is adjusted by the FULL CPI. The
//                         CPI-minus-1% reduction in (b)(3) applies only to
//                         CSB/REDUX electees, and § 1410 restores even those
//                         at age 62. Applying CPI-1 to BRS or legacy High-3
//                         retired pay understates it by ~1%/yr compounding.
//   10 U.S.C. § 1409(a)   regular (20-year active-duty) retired pay begins
//                         IMMEDIATELY at retirement, at any age. The age-60
//                         rule is 10 U.S.C. § 12731 non-regular (Guard/
//                         Reserve) retirement only, and § 12731(f) reduces it
//                         to as low as age 50.
//   10 U.S.C. § 1415      the BRS lump-sum election still exists; its discount
//                         rate is republished by DoD every June, so it is
//                         described here and deliberately NOT modelled.
//   37 U.S.C. § 356       BRS continuation pay: 7–12 years of service (the
//                         window was widened from 8–12 by Pub. L. 118-31),
//                         a multiple of MONTHLY BASIC PAY, service-specific
//                         multipliers republished annually.
//
// Planning estimates only.

/** Which retirement system the member is in. This is a FACT, not a choice: the
 *  BRS opt-in window closed 31 Dec 2018 and cannot be reopened. */
export type RetirementSystem = "brs" | "high3";

/** 10 U.S.C. § 1409(b): 2.5%/yr legacy, 2.0%/yr modernized (BRS). */
export const RETIREMENT_MULTIPLIER_PCT: Record<RetirementSystem, number> = {
  brs: 2.0,
  high3: 2.5,
};

/** Years of creditable service that unlock a regular (active-duty) retirement. */
export const REGULAR_RETIREMENT_YEARS = 20;

/** Statutory window for BRS continuation pay (37 U.S.C. § 356, as amended). */
export const CONTINUATION_PAY_WINDOW = { minYos: 7, maxYos: 12 } as const;

/**
 * Continuation-pay multiples of MONTHLY basic pay. Services publish their own
 * multipliers by specialty every year, so only the statutory bounds are safe
 * to state — never a point estimate.
 */
export const CONTINUATION_PAY_MULTIPLE = {
  active: { min: 2.5, max: 13 },
  reserve: { min: 0.5, max: 6 },
} as const;

/** Age the pension is assumed to be paid through when the caller gives none. */
export const DEFAULT_LIFE_EXPECTANCY_AGE = 85;

/** Sustainable-withdrawal rate used to capitalize a pension into a nest egg. */
export const DEFAULT_SAFE_WITHDRAWAL_RATE_PCT = 4;

// --------------------------------------------------------------- High-3 ---

export type High3Source =
  /** Statutory: the highest 36 months of a monthly basic-pay series. */
  | "monthly-basic-pay"
  /** Approximation: the highest 3 annual basic-pay snapshots. */
  | "annual-basic-pay"
  /** Weakest: final basic pay standing in for the 36-month average. */
  | "final-pay-proxy"
  /** Nothing usable was supplied. */
  | "unavailable";

export type High3Input = {
  /** Monthly basic pay while serving, any order. The statutory source. */
  monthlyBasePay?: readonly number[];
  /** Annual snapshots of monthly basic pay while serving (one per year). */
  annualBasePay?: readonly number[];
  /** Last resort — the final month of basic pay. */
  finalMonthlyBasePay?: number;
};

export type High3Result = {
  /** The High-3 monthly basic-pay figure the multiplier is applied to. */
  monthlyBase: number;
  source: High3Source;
  /** How many data points went into the average (months, or years). */
  periodsAveraged: number;
  /** True only when the statutory highest-36-months average was computable. */
  exact: boolean;
  /** Plain-English statement of which method was used and what it costs. */
  note: string;
};

const usable = (xs: readonly number[] | undefined): number[] =>
  (xs ?? []).filter((n) => Number.isFinite(n) && n > 0);

const mean = (xs: number[]): number => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);

/**
 * High-3: the average of the highest 36 months of basic pay.
 *
 * Takes the best source available and SAYS WHICH ONE IT USED, because the
 * three methods do not agree:
 *   - monthly series  → the statutory figure.
 *   - annual series   → the highest 3 annual snapshots. Each snapshot is one
 *                       month standing in for a year, so this is close but not
 *                       the true 36-month mean.
 *   - final pay only  → overstates High-3 by roughly 3% on a quiet pay curve
 *                       and 8–12% when a promotion lands inside the last three
 *                       years. Always the wrong direction (it flatters the
 *                       pension), so it is flagged, never silently used.
 */
export function high3MonthlyBase(input: High3Input): High3Result {
  const monthly = usable(input.monthlyBasePay);
  if (monthly.length > 0) {
    const top = [...monthly].sort((a, b) => b - a).slice(0, 36);
    const complete = monthly.length >= 36;
    return {
      monthlyBase: mean(top),
      source: "monthly-basic-pay",
      periodsAveraged: top.length,
      exact: complete,
      note: complete
        ? "High-3 is the average of the highest 36 months of basic pay (10 U.S.C. § 1407). Allowances (BAH/BAS), special and incentive pays are excluded."
        : `Only ${top.length} month(s) of basic pay were available, so the average covers less than the statutory 36 months.`,
    };
  }

  const annual = usable(input.annualBasePay);
  if (annual.length > 0) {
    const top = [...annual].sort((a, b) => b - a).slice(0, 3);
    return {
      monthlyBase: mean(top),
      source: "annual-basic-pay",
      periodsAveraged: top.length,
      exact: false,
      note:
        top.length >= 3
          ? "High-3 approximated from the highest 3 annual basic-pay snapshots. The statutory figure averages 36 monthly values, so this runs slightly high or low depending on when raises land."
          : `High-3 approximated from the only ${top.length} annual basic-pay snapshot(s) available — treat it as a rough floor.`,
    };
  }

  const final = input.finalMonthlyBasePay;
  if (Number.isFinite(final) && (final as number) > 0) {
    return {
      monthlyBase: final as number,
      source: "final-pay-proxy",
      periodsAveraged: 1,
      exact: false,
      note: "No pay history was available, so FINAL basic pay stands in for the 36-month High-3 average. This OVERSTATES the pension — by roughly 3% on a steady pay curve, and 8–12% if a promotion landed in the last three years.",
    };
  }

  return {
    monthlyBase: 0,
    source: "unavailable",
    periodsAveraged: 0,
    exact: false,
    note: "No basic-pay data was available, so no High-3 could be computed.",
  };
}

// -------------------------------------------------------------- pension ---

export type MonthlyPensionInput = {
  /** High-3 monthly basic pay (see high3MonthlyBase). */
  high3: number;
  /** Total creditable years of service at retirement; fractions are valid. */
  yearsOfService: number;
  system: RetirementSystem;
};

export type PensionEstimate = {
  system: RetirementSystem;
  /** 2.0 (BRS) or 2.5 (legacy High-3) percent per year of service. */
  multiplierPct: number;
  yearsOfService: number;
  /** multiplierPct × yearsOfService — the share of High-3 the pension pays. */
  retiredPayPct: number;
  high3MonthlyBase: number;
  monthlyPension: number;
  annualPension: number;
  /** False below 20 years: a regular retirement pays nothing at all. */
  eligible: boolean;
  notes: string[];
};

/**
 * Monthly retired pay = multiplier × years of service × High-3.
 *
 * No 75%/60% ceiling: 10 U.S.C. § 1409(b)(3)'s cap binds only members who
 * retired before 2007, and this tool projects careers past 30 years.
 * Fractional years are honoured per § 1409(c).
 */
export function monthlyPension(i: MonthlyPensionInput): PensionEstimate {
  const system = i.system;
  const multiplierPct = RETIREMENT_MULTIPLIER_PCT[system];
  const yearsOfService = Math.max(0, i.yearsOfService);
  const high3 = Math.max(0, i.high3);
  const eligible = yearsOfService >= REGULAR_RETIREMENT_YEARS;
  const retiredPayPct = multiplierPct * yearsOfService;
  const monthly = eligible ? (retiredPayPct / 100) * high3 : 0;

  const notes: string[] = [
    system === "brs"
      ? "Blended Retirement System: 2.0% of High-3 per year of service (10 U.S.C. § 1409(b)(4)), plus the TSP agency automatic 1% and match you keep either way."
      : "Legacy High-3: 2.5% of High-3 per year of service (10 U.S.C. § 1409(b)(1)), with no agency TSP contributions.",
    "Which system you are in is a fact, not a choice — the BRS opt-in window closed 31 December 2018.",
  ];
  if (!eligible) {
    notes.push(
      `A regular retirement needs ${REGULAR_RETIREMENT_YEARS} years of creditable service. At ${
        Math.round(yearsOfService * 10) / 10
      } years the defined-benefit pension is $0 — this is a cliff, not a gradient.`
    );
  } else {
    notes.push(
      "Active-duty regular retired pay starts the month you retire, at any age (10 U.S.C. § 1409(a)). The age-60 rule applies to Guard/Reserve non-regular retirements only."
    );
    if (yearsOfService > 30) {
      notes.push(
        "No 75%/60% ceiling applies: the multiplier cap was removed for everyone retiring after 31 December 2006."
      );
    }
  }

  return {
    system,
    multiplierPct,
    yearsOfService,
    retiredPayPct,
    high3MonthlyBase: high3,
    monthlyPension: monthly,
    annualPension: monthly * 12,
    eligible,
    notes,
  };
}

// ----------------------------------------------------- value of the stream ---

export type PensionStreamInput = {
  /** Monthly retired pay in the dollars of the year payments START. */
  monthlyPension: number;
  /** Age retired pay begins (immediately at retirement for active duty). */
  startAge: number;
  /** Age payments are assumed to stop — a life-expectancy assumption. */
  endAge: number;
  /**
   * Annual cost-of-living adjustment, percent. Retired pay tracks the FULL CPI
   * (10 U.S.C. § 1401a(b)(2), and (b)(5) for BRS) — do not pass CPI-1 here
   * unless you are explicitly modelling a CSB/REDUX retiree.
   */
  colaPct: number;
};

export type PensionPresentValueInput = PensionStreamInput & {
  /** Discount rate, percent. Pass the inflation assumption for a real (today's
   *  purchasing power) valuation; pass a higher rate for an opportunity-cost
   *  valuation. */
  discountRatePct: number;
  /** Age the valuation is struck at. Defaults to startAge (no deferral). */
  valuationAge?: number;
};

export type PensionPresentValueResult = {
  presentValue: number;
  /** Number of annual payments valued. */
  payments: number;
  /** Annual retired pay in the first year of retirement. */
  annualPensionAtStart: number;
  /** Years the first payment is discounted back (startAge − valuationAge). */
  deferralYears: number;
  discountRatePct: number;
  colaPct: number;
  notes: string[];
};

/**
 * Present value of the retired-pay annuity.
 *
 * Payments are treated as one lump per retirement year, made at the start of
 * that year (annuity-due), growing at the COLA and discounted at the discount
 * rate. Because retired pay is indexed to the full CPI, discounting at the
 * inflation assumption makes COLA and discount rate cancel: the present value
 * is simply (annual pension) × (years of payments) in today's dollars, which
 * is exactly the point — a CPI-indexed pension holds its purchasing power for
 * life. That identity is the sanity check this function is pinned against.
 */
export function pensionPresentValue(i: PensionPresentValueInput): PensionPresentValueResult {
  const annual = Math.max(0, i.monthlyPension) * 12;
  const payments = Math.max(0, Math.round(i.endAge - i.startAge));
  const g = i.colaPct / 100;
  const d = i.discountRatePct / 100;
  const valuationAge = i.valuationAge ?? i.startAge;
  const deferralYears = Math.max(0, i.startAge - valuationAge);

  // Summed rather than closed-form so the COLA == discount-rate case (where
  // the geometric series degenerates) needs no special case.
  let pv = 0;
  for (let k = 0; k < payments; k++) {
    pv += (annual * Math.pow(1 + g, k)) / Math.pow(1 + d, deferralYears + k);
  }

  return {
    presentValue: pv,
    payments,
    annualPensionAtStart: annual,
    deferralYears,
    discountRatePct: i.discountRatePct,
    colaPct: i.colaPct,
    notes: [
      `Values ${payments} annual payment(s) from age ${i.startAge} to ${i.endAge}, grown at a ${i.colaPct}% COLA and discounted at ${i.discountRatePct}%.`,
      "Military retired pay gets the FULL CPI adjustment (10 U.S.C. § 1401a(b)(2); (b)(5) confirms it for BRS). The CPI-minus-1% rule applies only to CSB/REDUX electees, and § 1410 restores even those at age 62.",
      "The end age is a life-expectancy assumption, not a fact — live longer and the pension is worth proportionally more.",
    ],
  };
}

export type LifetimePensionResult = {
  /** Undiscounted sum of every payment, in the nominal dollars of each year. */
  nominalTotal: number;
  payments: number;
  firstYearAnnual: number;
  finalYearAnnual: number;
  notes: string[];
};

/**
 * Undiscounted lifetime total. Members think in both — "what's it worth today"
 * (present value) and "how much will it pay me over my life" (this). Reporting
 * only the discounted figure reads as if the tool is hiding the big number;
 * reporting only this one ignores that later dollars buy less.
 */
export function lifetimePensionTotal(i: PensionStreamInput): LifetimePensionResult {
  const annual = Math.max(0, i.monthlyPension) * 12;
  const payments = Math.max(0, Math.round(i.endAge - i.startAge));
  const g = i.colaPct / 100;

  let total = 0;
  for (let k = 0; k < payments; k++) total += annual * Math.pow(1 + g, k);

  return {
    nominalTotal: total,
    payments,
    firstYearAnnual: annual,
    finalYearAnnual: payments > 0 ? annual * Math.pow(1 + g, payments - 1) : 0,
    notes: [
      `Undiscounted sum of ${payments} annual payment(s) from age ${i.startAge} to ${i.endAge} at a ${i.colaPct}% COLA — future dollars, not today's.`,
      "In today's purchasing power the payment is effectively flat, because the COLA tracks CPI.",
    ],
  };
}

export type PensionNestEggResult = {
  nestEggEquivalent: number;
  annualPension: number;
  withdrawalRatePct: number;
  note: string;
};

/**
 * The pension expressed as the portfolio you would need to buy it.
 *
 * Inverts the same sustainable-withdrawal rule the projector already uses for
 * its 4%-rule income line, so the two numbers are on one scale. Defensible
 * precisely because the 4% rule is designed to deliver an INFLATION-ADJUSTED
 * income — which is exactly what a full-CPI-indexed pension is.
 */
export function pensionAsNestEgg(i: {
  annualPension: number;
  withdrawalRatePct?: number;
}): PensionNestEggResult {
  const rate = i.withdrawalRatePct ?? DEFAULT_SAFE_WITHDRAWAL_RATE_PCT;
  const annual = Math.max(0, i.annualPension);
  const safeRate = rate > 0 ? rate : DEFAULT_SAFE_WITHDRAWAL_RATE_PCT;
  return {
    nestEggEquivalent: annual / (safeRate / 100),
    annualPension: annual,
    withdrawalRatePct: safeRate,
    note: `The savings balance it would take to draw this pension at ${safeRate}%/yr — the pension's rough nest-egg equivalent. It is a lifetime, CPI-indexed, government-backed stream, so if anything this understates it.`,
  };
}

// ----------------------------------------------------- continuation pay ---

export type ContinuationPayInput = {
  /** Monthly BASIC pay at the year continuation pay is taken. */
  monthlyBasePay: number;
  /** Years of service when it would be taken. */
  yearsOfService: number;
  /** Regular/active component, or a drilling reserve component. */
  component?: "active" | "reserve";
  /** Only BRS members are eligible. Defaults to true. */
  brs?: boolean;
};

export type ContinuationPayResult = {
  eligible: boolean;
  component: "active" | "reserve";
  minMultiple: number;
  maxMultiple: number;
  minAmount: number;
  maxAmount: number;
  /** A spread of multiples, because a point estimate can be 5x wrong. */
  illustrative: { multiple: number; amount: number }[];
  notes: string[];
};

/** True inside the statutory 7–12 years-of-service window. */
export function continuationPayEligibleAtYos(yearsOfService: number): boolean {
  return (
    yearsOfService >= CONTINUATION_PAY_WINDOW.minYos && yearsOfService <= CONTINUATION_PAY_WINDOW.maxYos
  );
}

/**
 * BRS continuation pay as a RANGE, never a point estimate.
 *
 * The mechanics are statutory and verifiable (37 U.S.C. § 356): a multiple of
 * monthly basic pay, taken between 7 and 12 years of service, in exchange for
 * at least 3 more years of obligated service. The multiplier itself is set by
 * each service by specialty and republished every year — a single number would
 * be wrong by up to a factor of five, so the spread is the honest output.
 */
export function continuationPay(i: ContinuationPayInput): ContinuationPayResult {
  const component = i.component ?? "active";
  const bounds = CONTINUATION_PAY_MULTIPLE[component];
  const pay = Math.max(0, i.monthlyBasePay);
  const brs = i.brs ?? true;
  const eligible = brs && continuationPayEligibleAtYos(i.yearsOfService);

  const spread =
    component === "active" ? [bounds.min, 4, 6, 8, 10, bounds.max] : [bounds.min, 1.5, 3, 4.5, bounds.max];

  return {
    eligible,
    component,
    minMultiple: bounds.min,
    maxMultiple: bounds.max,
    minAmount: pay * bounds.min,
    maxAmount: pay * bounds.max,
    illustrative: spread.map((multiple) => ({ multiple, amount: pay * multiple })),
    notes: CONTINUATION_PAY_NOTES,
  };
}

export const CONTINUATION_PAY_NOTES: string[] = [
  `Continuation pay is a BRS-only mid-career bonus, taken between ${CONTINUATION_PAY_WINDOW.minYos} and ${CONTINUATION_PAY_WINDOW.maxYos} years of service (37 U.S.C. § 356 — the window was widened from 8–12 years, so most secondary sources are out of date).`,
  `It is a multiple of MONTHLY BASIC PAY only: ${CONTINUATION_PAY_MULTIPLE.active.min}x–${CONTINUATION_PAY_MULTIPLE.active.max}x for the regular component, ${CONTINUATION_PAY_MULTIPLE.reserve.min}x–${CONTINUATION_PAY_MULTIPLE.reserve.max}x for a drilling reserve component. Allowances do not count.`,
  "Each service sets its own multipliers by specialty and republishes them annually, so the range above is the only honest figure — no single number is right for everyone.",
  "Accepting it obligates at least 3 more years of service; not completing that obligation can trigger recoupment.",
  "It can be contributed to the TSP, subject to the IRS annual limits.",
];

// --------------------------------------------------------- documented notes ---

/** Kept as a note, not a model — the discount rate changes every June. */
export const BRS_LUMP_SUM_NOTES: string[] = [
  "BRS members can elect 25% or 50% of retired pay as a discounted lump sum (10 U.S.C. § 1415), covering the period from retirement to full Social Security retirement age (67 for most). Monthly retired pay is cut to 75% or 50% during that window, then reverts to full.",
  "The lump sum is discounted using a Department of Defense rate republished every June, so its value swings year to year. This tool deliberately does not model it — a stale discount rate would produce a confidently wrong answer.",
  "DoD's own guidance is that a lifetime of equal, non-discounted monthly payments may be worth more, and that for most members a guaranteed income for life is likely the better choice.",
  "The lump sum is earned income for tax purposes and can push you into a higher bracket in the year you take it.",
];

export const RETIRED_PAY_TAX_NOTES: string[] = [
  "Military retired pay is fully taxable as ordinary income at the federal level; DFAS issues a Form 1099-R each January. It is a pre-tax income stream, like a Traditional TSP balance — not like a Roth one.",
  "State treatment varies widely and changes often: roughly 37 states fully exempt military retired pay and about a dozen more exempt part of it. This tool has no state field, so no state tax is applied.",
  "Retired pay waived to receive VA disability compensation is not taxable, and chapter 61 disability retirement can be partly or wholly excludable. Both are individual-specific and are not modelled.",
];

/** Everything that materially affects retired pay and cannot be quantified here. */
export const MILITARY_RETIREMENT_CAVEATS: string[] = [
  "Reaching 20 years is not entirely your choice — up-or-out rules, promotion boards, medical separation and force shaping all intervene. Treat 'stay to 20' as a plan, not a guarantee.",
  "Survivor Benefit Plan (SBP) premiums reduce net retired pay and are not modelled here.",
  "VA disability offset, CRDP and CRSC change what actually lands in the bank and are individual-specific.",
  "TRICARE for retirees, commissary/exchange access and other retiree benefits are real value that carries no dollar figure in this model.",
  "TERA (early retirement at 15–19 years with a reduced multiplier) is offered only when a service is authorized to use it, and is not modelled.",
  "Guard/Reserve non-regular retirements pay from age 60 (10 U.S.C. § 12731), reduced by 3 months per 90 days of qualifying active service after 28 Jan 2008 but never below age 50. This model assumes an active-duty regular retirement.",
];
