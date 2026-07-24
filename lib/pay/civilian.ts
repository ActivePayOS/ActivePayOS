// Civilian-equivalent salary: what a civilian W-2 job would have to pay so
// that, after federal income tax, state income tax, and FICA, it leaves the
// same annual cash in pocket as the member's military pay.
//
// WHY THIS EXISTS ------------------------------------------------------------
// BAH and BAS are excluded from gross income (26 U.S.C. § 134 "qualified
// military benefits"; see also 37 U.S.C. §§ 402–403 and IRS Publication 3,
// Armed Forces' Tax Guide). A civilian salary is fully taxable, so matching a
// member's take-home requires a HIGHER gross salary than the military
// headline total. This module quantifies that gap and shows every step.
//
// METHOD (exact solve, not a marginal-rate shortcut) -------------------------
// 1. Military after-tax cash (annual):
//      target = gross − federal − state − FICA
//    using the SAME tax engine as the take-home tab (lib/pay/takehome.ts).
//    TSP and SGLI are voluntary elections, not taxes, so they are excluded
//    from both sides of the comparison.
// 2. Civilian model: a single fully-taxable W-2 salary S, same filing status,
//    same flat state rate, standard deduction, and the same traditional
//    401(k) dollars the member elects for TSP (the IRS elective-deferral
//    limit, 26 U.S.C. § 402(g), is identical for TSP and 401(k) plans — so
//    the retirement contribution and its deduction cancel on both sides):
//      afterTax(S) = S − fed(S − 401k − stdDed) − state·(S − 401k) − FICA(S)
// 3. Solve afterTax(S) = target by bisection. afterTax is continuous and
//    strictly increasing in S (every marginal dollar is taxed below 100%),
//    so the solution exists and is unique.
//
// A NOTE ON THE OLD SHORTCUT: dividing after-tax pay by (1 − marginal rate)
// taxes every civilian dollar at one flat rate — the MEMBER's military
// marginal rate. That is wrong in both directions at once: it overstates tax
// on the civilian's first dollars (shielded by the standard deduction and
// lower brackets) and understates it when the higher civilian salary climbs
// into brackets the military taxable income never reached. The net error is
// scenario-dependent. The solver has no such bias: its answer is verified by
// recomputing the civilian's taxes at the solved salary, which this module
// does and reports as a "check" line.
//
// All tax constants are 2026 figures from lib/pay/takehome.ts — verify
// against IRS Rev. Proc. 2025-32 (brackets, standard deduction), SSA's 2026
// COLA fact sheet (Social Security wage base), and IRS Topic 751/560.

import {
  federalTaxAnnual,
  federalMarginalRate,
  STANDARD_DEDUCTION_2026,
  SS_RATE,
  MEDICARE_RATE,
  SS_WAGE_BASE_2026,
  ADDL_MEDICARE_RATE,
  ADDL_MEDICARE_THRESHOLD_ANNUAL,
  type FilingStatus,
  type TakeHomeResult,
  type TspType,
} from "./takehome";

export type CivilianTaxesAnnual = {
  salary: number;
  traditional401k: number;
  federalTaxable: number;
  federal: number;
  state: number;
  socialSecurity: number;
  medicare: number;
  fica: number;
  totalTax: number;
  afterTax: number; // salary − totalTax (401k excluded: it's savings, not tax)
  effectiveTaxRate: number; // totalTax / salary
  federalMarginalRate: number;
};

export type ReceiptLine = {
  id: string;
  label: string;
  /** Human-readable math for the receipts table, e.g. "6.2% × min(salary, $184,500)". */
  formula: string;
  /** Annual dollars. Deductions are reported as positive numbers. */
  value: number;
  kind: "income" | "deduction" | "result" | "check";
};

export type CivilianEquivalentBreakdown = {
  /** The headline: civilian gross salary needed to match military after-tax cash. */
  salaryNeeded: number;
  /** salaryNeeded − military gross cash (annual). */
  premiumOverGross: number;
  /** premiumOverGross / military gross (0 when gross is 0). */
  premiumPct: number;
  military: {
    grossAnnual: number;
    taxableAnnual: number;
    nonTaxableAnnual: number;
    federalAnnual: number;
    stateAnnual: number;
    ficaAnnual: number;
    afterTaxAnnual: number; // the match target
    effectiveTaxRate: number; // taxes / gross
  };
  civilian: CivilianTaxesAnnual;
  /** |civilian.afterTax − military.afterTaxAnnual| — the solver's residual. */
  matchError: number;
  militaryReceipt: ReceiptLine[];
  civilianReceipt: ReceiptLine[];
};

export type CivilianEquivalentInput = {
  takeHome: TakeHomeResult;
  filingStatus: FilingStatus;
  /** Decimal flat state rate, e.g. 0.05. Applied identically to both sides. */
  stateTaxRatePct: number;
  tspType: TspType;
};

/** Civilian federal + state + FICA at a given salary. Pure; exported for tests. */
export function civilianTaxesAt(
  salary: number,
  opts: { filingStatus: FilingStatus; stateTaxRatePct: number; traditional401kAnnual: number }
): CivilianTaxesAnnual {
  const s = Math.max(0, salary);
  const k401 = Math.min(Math.max(0, opts.traditional401kAnnual), s);
  const stateRate = Math.max(0, Math.min(0.2, opts.stateTaxRatePct));

  const federalTaxable = Math.max(0, s - k401 - STANDARD_DEDUCTION_2026[opts.filingStatus]);
  const federal = federalTaxAnnual(federalTaxable, opts.filingStatus);
  const state = stateRate * Math.max(0, s - k401);
  // FICA ignores 401(k)/TSP deferrals; Social Security stops at the wage base,
  // Medicare adds 0.9% on wages above the flat $200k withholding threshold.
  const socialSecurity = Math.min(s, SS_WAGE_BASE_2026) * SS_RATE;
  const medicare =
    s * MEDICARE_RATE + Math.max(0, s - ADDL_MEDICARE_THRESHOLD_ANNUAL) * ADDL_MEDICARE_RATE;
  const fica = socialSecurity + medicare;
  const totalTax = federal + state + fica;

  return {
    salary: s,
    traditional401k: k401,
    federalTaxable,
    federal,
    state,
    socialSecurity,
    medicare,
    fica,
    totalTax,
    afterTax: s - totalTax,
    effectiveTaxRate: s > 0 ? totalTax / s : 0,
    federalMarginalRate: federalMarginalRate(federalTaxable, opts.filingStatus),
  };
}

export function computeCivilianEquivalent(i: CivilianEquivalentInput): CivilianEquivalentBreakdown {
  const grossAnnual = i.takeHome.grossMonthly * 12;
  const taxableAnnual = i.takeHome.taxableMonthly * 12;
  const nonTaxableAnnual = i.takeHome.nonTaxableMonthly * 12;
  const federalAnnual = i.takeHome.federalTaxMonthly * 12;
  const stateAnnual = i.takeHome.stateTaxMonthly * 12;
  const ficaAnnual = i.takeHome.ficaMonthly * 12;
  const taxesAnnual = federalAnnual + stateAnnual + ficaAnnual;
  const target = grossAnnual - taxesAnnual;

  // Mirror the member's traditional TSP dollars as a civilian 401(k) election
  // so retirement savings cancel out of the comparison (Roth has no deduction
  // on either side, so it cancels trivially).
  const traditional401kAnnual = i.tspType === "traditional" ? i.takeHome.tspMonthly * 12 : 0;
  const opts = {
    filingStatus: i.filingStatus,
    stateTaxRatePct: i.stateTaxRatePct,
    traditional401kAnnual,
  };

  // Bisection. afterTax(S) is strictly increasing, afterTax(target) ≤ target
  // (taxes ≥ 0), so bracket [target, hi] and squeeze to under a cent.
  let lo = Math.max(0, target);
  let hi = Math.max(lo * 2, lo + 100_000, 50_000);
  for (let guard = 0; civilianTaxesAt(hi, opts).afterTax < target && guard < 60; guard++) {
    hi *= 1.5;
  }
  for (let iter = 0; iter < 80 && hi - lo > 0.005; iter++) {
    const mid = (lo + hi) / 2;
    if (civilianTaxesAt(mid, opts).afterTax < target) lo = mid;
    else hi = mid;
  }
  const salaryNeeded = (lo + hi) / 2;
  const civilian = civilianTaxesAt(salaryNeeded, opts);

  const fmt = (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const pct = (r: number) => `${(r * 100).toFixed(2).replace(/\.?0+$/, "")}%`;

  const militaryReceipt: ReceiptLine[] = [
    {
      id: "mil-gross",
      label: "Military cash compensation",
      formula: `taxable ${fmt(taxableAnnual)} (base + taxable specials) + tax-free ${fmt(nonTaxableAnnual)} (BAH + BAS + non-taxable specials)`,
      value: grossAnnual,
      kind: "income",
    },
    {
      id: "mil-fed",
      label: "Federal income tax (est.)",
      formula: `2026 brackets on taxable ${fmt(taxableAnnual)} − traditional TSP ${fmt(traditional401kAnnual)} − standard deduction ${fmt(STANDARD_DEDUCTION_2026[i.filingStatus])}`,
      value: federalAnnual,
      kind: "deduction",
    },
    {
      id: "mil-state",
      label: "State income tax (est.)",
      formula: `${pct(Math.max(0, Math.min(0.2, i.stateTaxRatePct)))} × (taxable wages − traditional TSP)`,
      value: stateAnnual,
      kind: "deduction",
    },
    {
      id: "mil-fica",
      label: "FICA",
      formula: `${pct(SS_RATE)} Social Security + ${pct(MEDICARE_RATE)} Medicare on taxable wages only — BAH/BAS are FICA-exempt`,
      value: ficaAnnual,
      kind: "deduction",
    },
    {
      id: "mil-after",
      label: "Military after-tax cash (the target)",
      formula: `${fmt(grossAnnual)} − ${fmt(taxesAnnual)}`,
      value: target,
      kind: "result",
    },
  ];

  const civilianReceipt: ReceiptLine[] = [
    {
      id: "civ-salary",
      label: "Civilian salary needed (solved)",
      formula: `bisection on afterTax(S) = ${fmt(target)}; unique because every added dollar is taxed below 100%`,
      value: salaryNeeded,
      kind: "income",
    },
    {
      id: "civ-fed",
      label: "Federal income tax at that salary",
      formula: `2026 brackets on ${fmt(salaryNeeded)} − 401(k) ${fmt(civilian.traditional401k)} − standard deduction ${fmt(STANDARD_DEDUCTION_2026[i.filingStatus])} = taxable ${fmt(civilian.federalTaxable)}`,
      value: civilian.federal,
      kind: "deduction",
    },
    {
      id: "civ-state",
      label: "State income tax",
      formula: `${pct(Math.max(0, Math.min(0.2, i.stateTaxRatePct)))} × (salary − 401(k)) — the whole salary is taxable`,
      value: civilian.state,
      kind: "deduction",
    },
    {
      id: "civ-ss",
      label: "Social Security",
      formula: `${pct(SS_RATE)} × min(salary, ${fmt(SS_WAGE_BASE_2026)} wage base)`,
      value: civilian.socialSecurity,
      kind: "deduction",
    },
    {
      id: "civ-medicare",
      label: "Medicare",
      formula: `${pct(MEDICARE_RATE)} × salary${salaryNeeded > ADDL_MEDICARE_THRESHOLD_ANNUAL ? ` + ${pct(ADDL_MEDICARE_RATE)} above ${fmt(ADDL_MEDICARE_THRESHOLD_ANNUAL)}` : ""}`,
      value: civilian.medicare,
      kind: "deduction",
    },
    {
      id: "civ-check",
      label: "Civilian after-tax cash (check — equals the target)",
      formula: `${fmt(salaryNeeded)} − ${fmt(civilian.totalTax)}`,
      value: civilian.afterTax,
      kind: "check",
    },
  ];

  return {
    salaryNeeded,
    premiumOverGross: salaryNeeded - grossAnnual,
    premiumPct: grossAnnual > 0 ? (salaryNeeded - grossAnnual) / grossAnnual : 0,
    military: {
      grossAnnual,
      taxableAnnual,
      nonTaxableAnnual,
      federalAnnual,
      stateAnnual,
      ficaAnnual,
      afterTaxAnnual: target,
      effectiveTaxRate: grossAnnual > 0 ? taxesAnnual / grossAnnual : 0,
    },
    civilian,
    matchError: Math.abs(civilian.afterTax - target),
    militaryReceipt,
    civilianReceipt,
  };
}

// Shown alongside the number so the estimate is honest about its edges.
export const CIVILIAN_EQUIVALENT_ASSUMPTIONS: string[] = [
  "Single fully-taxable W-2 salary, same filing status, 2026 standard deduction, no credits (child tax credit, EITC), no itemizing, and no other income.",
  "The same flat state income-tax rate you entered is applied to both sides; real state brackets, local/city taxes, and state military-pay exemptions are not modeled.",
  "The civilian makes the same traditional retirement contribution you elect for TSP — the 401(k) and TSP share the same IRS elective-deferral limit — so retirement savings cancel out of the comparison.",
  "TSP/401(k) and SGLI are voluntary elections, not taxes, so the match is on after-tax cash before those elections.",
  "Excluded entirely — and all favor the military side: employer healthcare premiums vs. TRICARE, the BRS pension and automatic + matching TSP contributions, commissary/exchange, and state tax breaks on military pay. Your true total compensation is HIGHER than this cash-only equivalent.",
];

export const CIVILIAN_EQUIVALENT_SOURCES: { label: string; href: string }[] = [
  {
    label: "26 U.S.C. § 134 — qualified military benefits (BAH/BAS excluded from gross income)",
    href: "https://www.law.cornell.edu/uscode/text/26/134",
  },
  {
    label: "IRS Publication 3 — Armed Forces' Tax Guide (excludable allowances)",
    href: "https://www.irs.gov/publications/p3",
  },
  {
    label: "IRS Rev. Proc. 2025-32 — 2026 federal brackets & standard deduction",
    href: "https://www.irs.gov/pub/irs-drop/rp-25-32.pdf",
  },
  {
    label: "SSA — 2026 Social Security wage base ($184,500)",
    href: "https://www.ssa.gov/news/press/factsheets/colafacts2026.pdf",
  },
  {
    label: "IRS Topic 751 — Social Security & Medicare withholding rates",
    href: "https://www.irs.gov/taxtopics/tc751",
  },
  {
    label: "37 U.S.C. §§ 402–403 — BAS and BAH entitlements",
    href: "https://www.law.cornell.edu/uscode/text/37/403",
  },
];
