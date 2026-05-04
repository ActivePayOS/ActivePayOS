export type StateTaxCategory =
  | "no_broad_wage_income_tax"
  | "state_income_tax_review_required";

export type StateTaxContext = {
  state: string;
  abbreviation: string;
  category: StateTaxCategory;
  headline: string;
  summary: string;
  planningNotes: string[];
  stateTaxAgencyUrl: string;
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

  return {
    state,
    abbreviation,
    category: hasNoBroadWageIncomeTax
      ? "no_broad_wage_income_tax"
      : "state_income_tax_review_required",
    headline: hasNoBroadWageIncomeTax
      ? "No broad state wage income tax"
      : "State rules need review",
    summary: hasNoBroadWageIncomeTax
      ? `${state} does not have a broad state wage income tax. ActivePayOS does not subtract state withholding from this estimate.`
      : `${state} has state-specific income tax rules. ActivePayOS does not estimate state withholding yet because military pay treatment can depend on legal residence, duty location, spouse choices, other income, and state instructions.`,
    planningNotes: hasNoBroadWageIncomeTax
      ? [
          "Check your LES state tax fields and myPay withholding settings anyway.",
          "Federal rules generally protect active-duty military pay from taxation by a duty-station state when you are there only because of orders.",
          "Other income, spouse income, capital gains, property, or local taxes may still need separate review.",
        ]
      : [
          "Check your LES state of legal residence and state income tax withholding fields.",
          "Federal rules generally protect active-duty military pay from taxation by a duty-station state when you are there only because of orders.",
          "Military spouses may have residency choices under SCRA-related rules, but the right answer can depend on the household situation.",
          "Other income, bonuses, rental income, civilian work, and local taxes may follow different rules.",
        ],
    stateTaxAgencyUrl: stateTaxAgencyUrls[state],
  };
});

export function getStateTaxContext(state: string) {
  return stateTaxContexts.find((item) => item.state === state) ?? null;
}
