// Estimated take-home pay: federal + state income tax, FICA, TSP, and SGLI.
//
// This is an EDUCATIONAL ESTIMATE, not a payroll calculation. It assumes the
// standard deduction, no credits/other income, and a flat user-provided state
// rate. Real withholding depends on your W-4, state rules, and your LES.
//
// Tax constants are dated and isolated here so they can be verified/updated the
// same way as the pay tables (the project's "show your work" model).

export type FilingStatus = "single" | "married";
export type TspType = "traditional" | "roth";

// ---------------------------------------------------------------------------
// 2026 IRS figures. VERIFY against IRS Rev. Proc. 2025-32 and Pub. 15-T before
// relying on them. Brackets are expressed as the upper bound of each tier.
// ---------------------------------------------------------------------------
export const STANDARD_DEDUCTION_2026: Record<FilingStatus, number> = {
  single: 16100,
  married: 32200,
};

type Bracket = { upTo: number; rate: number };
export const FEDERAL_BRACKETS_2026: Record<FilingStatus, Bracket[]> = {
  single: [
    { upTo: 12400, rate: 0.1 },
    { upTo: 50400, rate: 0.12 },
    { upTo: 105700, rate: 0.22 },
    { upTo: 201775, rate: 0.24 },
    { upTo: 256225, rate: 0.32 },
    { upTo: 640600, rate: 0.35 },
    { upTo: Infinity, rate: 0.37 },
  ],
  married: [
    { upTo: 24800, rate: 0.1 },
    { upTo: 100800, rate: 0.12 },
    { upTo: 211400, rate: 0.22 },
    { upTo: 403550, rate: 0.24 },
    { upTo: 512450, rate: 0.32 },
    { upTo: 768700, rate: 0.35 },
    { upTo: Infinity, rate: 0.37 },
  ],
};

export const SS_RATE = 0.062;
export const MEDICARE_RATE = 0.0145;
export const SS_WAGE_BASE_2026 = 184500; // 2026 SSA Social Security wage base (2025 = 176,100)

// Additional Medicare Tax: employers withhold an extra 0.9% on wages above a
// flat $200,000/yr (the withholding threshold is filing-status-independent).
export const ADDL_MEDICARE_RATE = 0.009;
export const ADDL_MEDICARE_THRESHOLD_ANNUAL = 200000;

// 2026 IRS elective-deferral limit for TSP (employee traditional + Roth). The
// government match is separate and does not count against this limit.
export const TSP_ELECTIVE_DEFERRAL_LIMIT_2026 = 24500;

// SGLI: $0.05 per $1,000 of coverage per month + $1/month TSGLI.
// Rate dropped from $0.06 to $0.05 per $1,000 effective July 1, 2025.
export const SGLI_OPTIONS: { coverage: number; monthly: number; label: string }[] = [
  { coverage: 0, monthly: 0, label: "None" },
  { coverage: 250000, monthly: 13.5, label: "$250,000" },
  { coverage: 400000, monthly: 21, label: "$400,000" },
  { coverage: 500000, monthly: 26, label: "$500,000 (max)" },
];

export function federalTaxAnnual(taxable: number, status: FilingStatus): number {
  if (taxable <= 0) return 0;
  let tax = 0;
  let prev = 0;
  for (const b of FEDERAL_BRACKETS_2026[status]) {
    if (taxable > b.upTo) {
      tax += (b.upTo - prev) * b.rate;
      prev = b.upTo;
    } else {
      tax += (taxable - prev) * b.rate;
      break;
    }
  }
  return tax;
}

export function federalMarginalRate(taxable: number, status: FilingStatus): number {
  const brackets = FEDERAL_BRACKETS_2026[status];
  if (taxable <= 0) return 0;
  for (const b of brackets) {
    if (taxable <= b.upTo) return b.rate;
  }
  return brackets[brackets.length - 1].rate;
}

export type TakeHomeInput = {
  basePayMonthly: number;
  bahMonthly: number;
  basMonthly: number;
  otherTaxableMonthly?: number; // taxable special pays
  otherNonTaxableMonthly?: number; // non-taxable allowances/special pays
  filingStatus: FilingStatus;
  tspPct: number; // decimal, of base pay
  tspType: TspType;
  sgliMonthly: number; // flat
  stateTaxRatePct: number; // decimal, applied to taxable wages
};

export type TakeHomeResult = {
  grossMonthly: number;
  taxableMonthly: number;
  nonTaxableMonthly: number;
  federalTaxMonthly: number;
  stateTaxMonthly: number;
  ficaMonthly: number;
  socialSecurityMonthly: number;
  medicareMonthly: number;
  tspMonthly: number;
  sgliMonthly: number;
  totalDeductionsMonthly: number;
  takeHomeMonthly: number;
  effectiveTaxRate: number; // (fed + state + FICA) / gross
  federalMarginalRate: number; // top federal bracket reached
};

export function computeTakeHome(i: TakeHomeInput): TakeHomeResult {
  const base = Math.max(0, i.basePayMonthly);
  const bah = Math.max(0, i.bahMonthly);
  const bas = Math.max(0, i.basMonthly);
  const otherTax = Math.max(0, i.otherTaxableMonthly ?? 0);
  const otherNon = Math.max(0, i.otherNonTaxableMonthly ?? 0);

  const taxableMonthly = base + otherTax;
  const nonTaxableMonthly = bah + bas + otherNon;
  const grossMonthly = taxableMonthly + nonTaxableMonthly;

  // TSP is a % of base pay, capped at the annual elective-deferral limit.
  // Traditional contributions are pre-tax (reduce federal/state taxable
  // income); Roth contributions are not.
  const tspUncappedMonthly = Math.max(0, Math.min(1, i.tspPct)) * base;
  const tspMonthly = Math.min(tspUncappedMonthly, TSP_ELECTIVE_DEFERRAL_LIMIT_2026 / 12);
  const tspTraditionalMonthly = i.tspType === "traditional" ? tspMonthly : 0;

  // Federal: annualized taxable wages − traditional TSP − standard deduction.
  const federalTaxableAnnual = Math.max(
    0,
    taxableMonthly * 12 - tspTraditionalMonthly * 12 - STANDARD_DEDUCTION_2026[i.filingStatus]
  );
  const federalTaxMonthly = federalTaxAnnual(federalTaxableAnnual, i.filingStatus) / 12;

  // FICA on taxable wages (traditional TSP does NOT reduce FICA wages).
  const ssWageMonthly = Math.min(taxableMonthly, SS_WAGE_BASE_2026 / 12);
  const socialSecurityMonthly = ssWageMonthly * SS_RATE;
  // Base Medicare (1.45%) on all wages + Additional Medicare (0.9%) on the
  // portion of wages above $200k/yr.
  const addlMedicareMonthly =
    Math.max(0, taxableMonthly - ADDL_MEDICARE_THRESHOLD_ANNUAL / 12) * ADDL_MEDICARE_RATE;
  const medicareMonthly = taxableMonthly * MEDICARE_RATE + addlMedicareMonthly;
  const ficaMonthly = socialSecurityMonthly + medicareMonthly;

  // State: simple flat rate on taxable wages (minus traditional TSP).
  const stateRate = Math.max(0, Math.min(0.2, i.stateTaxRatePct));
  const stateTaxMonthly = stateRate * Math.max(0, taxableMonthly - tspTraditionalMonthly);

  const sgli = Math.max(0, i.sgliMonthly);

  const totalDeductionsMonthly =
    federalTaxMonthly + stateTaxMonthly + ficaMonthly + tspMonthly + sgli;
  const takeHomeMonthly = grossMonthly - totalDeductionsMonthly;

  const effectiveTaxRate =
    grossMonthly > 0 ? (federalTaxMonthly + stateTaxMonthly + ficaMonthly) / grossMonthly : 0;

  return {
    grossMonthly,
    taxableMonthly,
    nonTaxableMonthly,
    federalTaxMonthly,
    stateTaxMonthly,
    ficaMonthly,
    socialSecurityMonthly,
    medicareMonthly,
    tspMonthly,
    sgliMonthly: sgli,
    totalDeductionsMonthly,
    takeHomeMonthly,
    effectiveTaxRate,
    federalMarginalRate: federalMarginalRate(federalTaxableAnnual, i.filingStatus),
  };
}
