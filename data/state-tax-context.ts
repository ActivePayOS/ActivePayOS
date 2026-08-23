type StateTaxCategory =
  | "no_broad_wage_income_tax"
  | "active_duty_pay_generally_exempt"
  | "state_income_tax_review_required";

export type StationedOutsideRelief = {
  /**
   * How the home state relieves tax on active-duty pay when the member is
   * stationed outside it:
   * - "nonresident_treatment": the state treats you as a nonresident while
   *   stationed elsewhere on PCS orders (military pay not state-source).
   * - "pay_exempt": the pay itself is exempt/deductible when earned while
   *   stationed outside the state.
   * - "conditional_nonresident": nonresident treatment only if abode/day-count
   *   tests are met (e.g., no permanent home in-state, ≤30 days there).
   * - "partial": a capped or situational subtraction, not a full exemption.
   */
  kind: "nonresident_treatment" | "pay_exempt" | "conditional_nonresident" | "partial";
  /** Relief applies only when stationed outside the 50 states (OCONUS). */
  oconusOnly?: boolean;
  /** Planning rate (percent) when the relief applies. */
  reliefRatePct: number;
  headline: string;
  conditions: string;
};

export type StateTaxContext = {
  state: string;
  abbreviation: string;
  category: StateTaxCategory;
  headline: string;
  summary: string;
  planningNotes: string[];
  stateTaxAgencyUrl: string;
  militaryTaxUrl?: string;
  reviewedTaxYear: number;
  /**
   * Rough planning-level effective rate (percent) the Pay Calculator suggests
   * for the take-home estimate when this state is picked. 0 for no-tax states
   * and states that broadly exempt active-duty pay. ALWAYS an estimate — the
   * UI pairs it with rateBlurb and a "verify" instruction.
   */
  suggestedRatePct: number;
  rateBlurb: string;
  /** How this state treats a resident's pay when stationed outside it. */
  stationedOutsideRelief?: StationedOutsideRelief;
};

// States that (as of the 2025 tax year) broadly exempt or fully deduct
// active-duty military pay for resident service members. Planning-level list
// — details and effective dates vary, so the UI always says to verify.
const activeDutyPayGenerallyExempt = new Set([
  "Arizona",
  "Arkansas",
  "Illinois",
  "Indiana",
  "Iowa",
  "Kentucky",
  "Michigan",
  "Minnesota",
  "Missouri",
  "Montana",
  "New Mexico",
  "North Dakota",
  "Oklahoma",
  "Wisconsin",
]);

// Rough effective rates (percent of taxable military wages) for the remaining
// states, at a typical military income. Deliberately coarse: flat-tax states
// use the statutory rate; progressive states use a mid-band effective rate.
// Several of these states still exempt pay in specific situations (e.g.
// stationed out of state) — the blurb says so.
const approxEffectiveRatePct: Record<string, number> = {
  Alabama: 4.0,
  California: 3.5,
  Colorado: 4.4,
  Connecticut: 4.5,
  Delaware: 4.8,
  "District of Columbia": 5.0,
  Georgia: 5.2,
  Hawaii: 6.0,
  Idaho: 5.3,
  Kansas: 5.2,
  Louisiana: 3.0,
  Maine: 5.0,
  Maryland: 4.75,
  Massachusetts: 5.0,
  Mississippi: 4.0,
  Nebraska: 4.5,
  "New Jersey": 3.5,
  "New York": 5.0,
  "North Carolina": 3.99,
  Ohio: 2.75,
  Oregon: 8.0,
  Pennsylvania: 3.07,
  "Rhode Island": 3.75,
  "South Carolina": 5.5,
  Utah: 4.55,
  Vermont: 4.5,
  Virginia: 5.0,
  "West Virginia": 4.5,
};

// States that relieve tax on a RESIDENT's active-duty pay when the member is
// stationed outside the state. Planning-level, sourced from the Air Force
// Benefits fact sheets ("Which states tax my Active Duty or Reserve military
// pay?") and each state's guidance (e.g., CA FTB Pub 1032). Verified 2026-07.
const stationedOutsideReliefByState: Record<string, StationedOutsideRelief> = {
  California: {
    kind: "nonresident_treatment",
    reliefRatePct: 0,
    headline: "Treated as a nonresident while stationed outside California",
    conditions:
      "Leave California on PCS orders and you become a nonresident for income tax; military pay is no longer California-source income (FTB Pub 1032). If CA tax is being withheld anyway, file Form 540NR to recover it. TDYs from a California station don't count — only PCS moves.",
  },
  Connecticut: {
    kind: "conditional_nonresident",
    reliefRatePct: 0,
    headline: "Nonresident treatment if you meet all three tests",
    conditions:
      "Applies only if you kept no permanent home in Connecticut, maintained one outside the state all year, and spent under 30 days in Connecticut during the tax year.",
  },
  Idaho: {
    kind: "pay_exempt",
    reliefRatePct: 0,
    headline: "Pay earned while stationed outside Idaho is exempt",
    conditions:
      "Requires being stationed outside Idaho for 120 or more consecutive days. Pay earned before departure remains taxable.",
  },
  Louisiana: {
    kind: "partial",
    reliefRatePct: 0,
    headline: "Up to $50,000 of military income exempt when stationed out of state",
    conditions:
      "Requires active-duty station outside Louisiana for more than 120 consecutive days. Up to $50,000 of military income may be exempted — most junior/mid-career pay fits entirely under the cap.",
  },
  Maine: {
    kind: "pay_exempt",
    reliefRatePct: 0,
    headline: "Active-duty pay earned outside Maine is not taxed",
    conditions:
      "Applies to a Maine resident's military pay earned for service performed outside the state.",
  },
  Maryland: {
    kind: "partial",
    oconusOnly: true,
    reliefRatePct: 3.0,
    headline: "Overseas-only subtraction, capped",
    conditions:
      "Only pay earned outside the U.S. qualifies, and only up to $15,000 — and the subtraction phases out unless total military pay is under $30,000. Being stationed in another U.S. state gives no relief.",
  },
  "New Jersey": {
    kind: "conditional_nonresident",
    reliefRatePct: 0,
    headline: "Nonresident treatment if you meet all three tests",
    conditions:
      "Applies only if you kept no permanent home in New Jersey, maintained one outside the state, and spent 30 days or less in New Jersey during the tax year (NJ GIT-7).",
  },
  "New York": {
    kind: "conditional_nonresident",
    reliefRatePct: 0,
    headline: "Nonresident treatment if you meet all three tests",
    conditions:
      "Applies only if you kept no permanent place of abode in New York, maintained one outside the state all year, and spent 30 days or less in New York during the tax year.",
  },
  Ohio: {
    kind: "pay_exempt",
    reliefRatePct: 0,
    headline: "Pay earned while stationed outside Ohio is deductible",
    conditions:
      "Ohio residents on active duty stationed outside Ohio deduct that military pay on the Ohio return (it must be in federal AGI).",
  },
  Oregon: {
    kind: "pay_exempt",
    reliefRatePct: 0,
    headline: "Residents stationed outside Oregon are not taxed on military pay",
    conditions:
      "Applies when stationed outside Oregon (a full year outside qualifies in full; partial years are prorated). Up to $6,000 of pay may also be subtracted when stationed in-state.",
  },
  Pennsylvania: {
    kind: "pay_exempt",
    reliefRatePct: 0,
    headline: "Active-duty pay earned outside Pennsylvania is exempt",
    conditions:
      "A Pennsylvania resident's military pay for active-duty service outside the state is not taxable; pay for duty inside Pennsylvania is.",
  },
  Vermont: {
    kind: "pay_exempt",
    reliefRatePct: 0,
    headline: "Full-time active duty outside Vermont is exempt",
    conditions:
      "Applies to Vermont residents living outside the state on full-time active duty.",
  },
  Colorado: {
    kind: "partial",
    oconusOnly: true,
    reliefRatePct: 0,
    headline: "Nonresident filing only after ~305 days outside the U.S.",
    conditions:
      "A Colorado-domiciled member stationed outside the 50 states for at least 305 days of the year may elect to file as a nonresident. Being stationed in another U.S. state gives no relief.",
  },
  "West Virginia": {
    kind: "conditional_nonresident",
    reliefRatePct: 0,
    headline: "Nonresident treatment may apply under the 30-day test",
    conditions:
      "A West Virginia domiciliary on active duty may qualify for nonresident treatment when present in West Virginia for no more than 30 days during the tax year. Confirm the current domicile and filing requirements before using 0%.",
  },
};

const militaryTaxUrls: Record<string, string> = {
  Alabama: "https://www.revenue.alabama.gov/faqs/i-am-in-the-military-and-a-legal-resident-of-alabama-but-i-do-not-live-in-alabama-do-i-have-to-pay-alabama-income-tax/",
  Massachusetts: "https://www.mass.gov/info-details/ma-tax-information-for-military-personnel-and-their-spouses",
  Mississippi: "https://www.dor.ms.gov/general-information",
  "North Carolina": "https://www.ncdor.gov/taxes-forms/individual-income-tax/tax-rate-schedules",
  Virginia: "https://www.tax.virginia.gov/subtractions",
  "West Virginia": "https://tax.wv.gov/Individuals/FrequentlyAskedQuestions/Pages/IndividualsFrequentlyAskedQuestions.aspx",
  Wisconsin: "https://www.revenue.wi.gov/pages/faqs/pcs-military.aspx",
};

const noBroadWageIncomeTax = new Set([
  "Alaska",
  "Florida",
  "Nevada",
  "New Hampshire",
  "South Dakota",
  "Tennessee",
  "Texas",
  "Washington",
  "Wyoming",
]);

const stateTaxAgencyUrls: Record<string, string> = {
  Alabama: "https://www.revenue.alabama.gov/",
  Alaska: "https://tax.alaska.gov/",
  Arizona: "https://azdor.gov/",
  Arkansas: "https://www.dfa.arkansas.gov/income-tax/",
  California: "https://www.ftb.ca.gov/",
  Colorado: "https://tax.colorado.gov/",
  Connecticut: "https://portal.ct.gov/drs",
  Delaware: "https://revenue.delaware.gov/",
  "District of Columbia": "https://otr.cfo.dc.gov/",
  Florida: "https://floridarevenue.com/",
  Georgia: "https://dor.georgia.gov/",
  Hawaii: "https://tax.hawaii.gov/",
  Idaho: "https://tax.idaho.gov/",
  Illinois: "https://tax.illinois.gov/",
  Indiana: "https://www.in.gov/dor/",
  Iowa: "https://revenue.iowa.gov/",
  Kansas: "https://www.ksrevenue.gov/",
  Kentucky: "https://revenue.ky.gov/",
  Louisiana: "https://revenue.louisiana.gov/",
  Maine: "https://www.maine.gov/revenue/",
  Maryland: "https://www.marylandtaxes.gov/",
  Massachusetts: "https://www.mass.gov/orgs/massachusetts-department-of-revenue",
  Michigan: "https://www.michigan.gov/taxes",
  Minnesota: "https://www.revenue.state.mn.us/",
  Mississippi: "https://www.dor.ms.gov/",
  Missouri: "https://dor.mo.gov/",
  Montana: "https://mtrevenue.gov/",
  Nebraska: "https://revenue.nebraska.gov/",
  Nevada: "https://tax.nv.gov/",
  "New Hampshire": "https://www.revenue.nh.gov/",
  "New Jersey": "https://www.nj.gov/treasury/taxation/",
  "New Mexico": "https://www.tax.newmexico.gov/",
  "New York": "https://www.tax.ny.gov/",
  "North Carolina": "https://www.ncdor.gov/",
  "North Dakota": "https://www.tax.nd.gov/",
  Ohio: "https://tax.ohio.gov/",
  Oklahoma: "https://oklahoma.gov/tax.html",
  Oregon: "https://www.oregon.gov/dor/",
  Pennsylvania: "https://www.revenue.pa.gov/",
  "Rhode Island": "https://tax.ri.gov/",
  "South Carolina": "https://dor.sc.gov/",
  "South Dakota": "https://dor.sd.gov/",
  Tennessee: "https://www.tn.gov/revenue.html",
  Texas: "https://comptroller.texas.gov/taxes/",
  Utah: "https://tax.utah.gov/",
  Vermont: "https://tax.vermont.gov/",
  Virginia: "https://www.tax.virginia.gov/",
  Washington: "https://dor.wa.gov/",
  "West Virginia": "https://tax.wv.gov/",
  Wisconsin: "https://www.revenue.wi.gov/",
  Wyoming: "https://revenue.wyo.gov/",
};

export const stateTaxReferenceLinks = [
  {
    label: "Military OneSource: military tax preparation",
    href: "https://www.militaryonesource.mil/resources/millife-guides/tax-preparation-services/",
  },
  {
    label: "Military OneSource: tax terms for military life",
    href: "https://www.militaryonesource.mil/financial-legal/taxes/tax-terms-defined-for-the-military/",
  },
  {
    label: "IRS: military tax information",
    href: "https://www.irs.gov/individuals/military",
  },
];

export const stateTaxContexts: StateTaxContext[] = [
  ["Alabama", "AL"],
  ["Alaska", "AK"],
  ["Arizona", "AZ"],
  ["Arkansas", "AR"],
  ["California", "CA"],
  ["Colorado", "CO"],
  ["Connecticut", "CT"],
  ["Delaware", "DE"],
  ["District of Columbia", "DC"],
  ["Florida", "FL"],
  ["Georgia", "GA"],
  ["Hawaii", "HI"],
  ["Idaho", "ID"],
  ["Illinois", "IL"],
  ["Indiana", "IN"],
  ["Iowa", "IA"],
  ["Kansas", "KS"],
  ["Kentucky", "KY"],
  ["Louisiana", "LA"],
  ["Maine", "ME"],
  ["Maryland", "MD"],
  ["Massachusetts", "MA"],
  ["Michigan", "MI"],
  ["Minnesota", "MN"],
  ["Mississippi", "MS"],
  ["Missouri", "MO"],
  ["Montana", "MT"],
  ["Nebraska", "NE"],
  ["Nevada", "NV"],
  ["New Hampshire", "NH"],
  ["New Jersey", "NJ"],
  ["New Mexico", "NM"],
  ["New York", "NY"],
  ["North Carolina", "NC"],
  ["North Dakota", "ND"],
  ["Ohio", "OH"],
  ["Oklahoma", "OK"],
  ["Oregon", "OR"],
  ["Pennsylvania", "PA"],
  ["Rhode Island", "RI"],
  ["South Carolina", "SC"],
  ["South Dakota", "SD"],
  ["Tennessee", "TN"],
  ["Texas", "TX"],
  ["Utah", "UT"],
  ["Vermont", "VT"],
  ["Virginia", "VA"],
  ["Washington", "WA"],
  ["West Virginia", "WV"],
  ["Wisconsin", "WI"],
  ["Wyoming", "WY"],
].map(([state, abbreviation]) => {
  const hasNoBroadWageIncomeTax = noBroadWageIncomeTax.has(state);
  const adExempt = activeDutyPayGenerallyExempt.has(state);
  const category: StateTaxCategory = hasNoBroadWageIncomeTax
    ? "no_broad_wage_income_tax"
    : adExempt
    ? "active_duty_pay_generally_exempt"
    : "state_income_tax_review_required";
  const suggestedRatePct = hasNoBroadWageIncomeTax || adExempt ? 0 : approxEffectiveRatePct[state] ?? 4.0;

  return {
    state,
    abbreviation,
    category,
    headline: hasNoBroadWageIncomeTax
      ? "No broad state wage income tax"
      : adExempt
      ? "Active-duty pay generally exempt"
      : "State rules need review",
    summary: hasNoBroadWageIncomeTax
      ? `${state} does not have a broad state wage income tax. ActivePayOS does not subtract state withholding from this estimate.`
      : adExempt
      ? `${state} broadly exempts or fully deducts active-duty military pay for residents, so many members owe little or no ${state} tax on military wages. Confirm the current rules and your situation — effective dates and conditions vary.`
      : `${state} has state-specific income tax rules. Military pay treatment can depend on legal residence, duty location, spouse choices, other income, and state instructions — treat any rate here as a rough planning number.`,
    planningNotes: state === "Virginia"
      ? [
          "Virginia may allow an active-duty basic-pay subtraction of up to $15,000 after 90 or more days of active duty; it phases out dollar-for-dollar from $15,000 to $30,000 of basic pay.",
          "This flat planning rate does not calculate that subtraction, deductions, credits, spouse income, or other Virginia-specific return items.",
          "Check your LES state of legal residence and state withholding fields.",
        ]
      : hasNoBroadWageIncomeTax
      ? [
          "Check your LES state tax fields and myPay withholding settings anyway.",
          "Federal rules generally protect active-duty military pay from taxation by a duty-station state when you are there only because of orders.",
          "Other income, spouse income, capital gains, property, or local taxes may still need separate review.",
        ]
      : adExempt
      ? [
          "Confirm the exemption/deduction still applies for the current tax year and that your withholding matches — some members must file to claim it.",
          "Check your LES state of legal residence and state income tax withholding fields.",
          "Other income, spouse income, bonuses, and civilian work may still be taxable.",
        ]
      : [
          "Check your LES state of legal residence and state income tax withholding fields.",
          "Federal rules generally protect active-duty military pay from taxation by a duty-station state when you are there only because of orders.",
          "Several states in this group still exempt some or all active-duty pay in specific situations (e.g., stationed outside the state) — check your state's military pages.",
          "Military spouses may have residency choices under SCRA-related rules, but the right answer can depend on the household situation.",
          "Other income, bonuses, rental income, civilian work, and local taxes may follow different rules.",
        ],
    stateTaxAgencyUrl: stateTaxAgencyUrls[state],
    militaryTaxUrl: militaryTaxUrls[state],
    reviewedTaxYear: 2026,
    stationedOutsideRelief: stationedOutsideReliefByState[state],
    suggestedRatePct,
    rateBlurb: hasNoBroadWageIncomeTax
      ? `${state} has no broad wage income tax — 0% is typical.`
      : adExempt
      ? `${state} generally exempts active-duty pay for residents — 0% is a common planning assumption, but verify with ${state}'s guidance and your finance office.`
      : `Rough planning estimate for ${state} at a typical military income — your real rate depends on income, filing status, and ${state}'s military rules. Verify with your state's guidance and your finance office.`,
  };
});

export function getStateTaxContext(state: string) {
  return stateTaxContexts.find((item) => item.state === state) ?? null;
}
