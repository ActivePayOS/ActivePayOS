// lib/pay/basepay-lookup.ts
// Client-safe base-pay lookup (no node:fs). Operates on a dataset object that
// the server passes down as a prop, mirroring app/pay/pay-client.tsx.

export type BasePayDataset = {
  year: number;
  /** DFAS-published reduced E-1 rate for the first 4 months of service. */
  e1UnderFourMonthsMonthly?: number;
  tables: Record<string, Record<string, Array<number | null>>>;
};

// DFAS pay-table YOS column breakpoints (column 0 is "2 or less").
const YOS_BREAKS = [2, 3, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40];

function tableKeyForGrade(grade: string): string {
  const g = grade.toUpperCase().trim();
  if (g.startsWith("W-")) return "WO";
  if (g.startsWith("E-")) return "EM";
  if (g.startsWith("O-") && g.endsWith("E")) return "CO_FE";
  return "CO";
}

// ---------------------------------------------------------------------------
// Prior-enlisted officer (O-1E / O-2E / O-3E) rates
// ---------------------------------------------------------------------------
//
// DoD FMR Vol 7A para 2.3.1.2: the special rates require OVER 4 years — "at
// least 4 years and 1 day" — of prior ACTIVE enlisted and/or warrant service.
// Exactly 4 years does not qualify. The rates exist only for O-1, O-2 and O-3:
// there is no O-4E, the E rate simply ends at promotion to major. Service
// academy time counts for none of this (10 U.S.C. 971(b)), so callers must not
// include it in the prior-enlisted figure.

/** Minimum prior active enlisted/warrant service for an E rate. Must be EXCEEDED. */
export const PRIOR_ENLISTED_E_RATE_MIN_MONTHS = 48;

/** The only grades with an E row in the pay tables. */
export const E_RATE_GRADES: readonly string[] = ["O-1", "O-2", "O-3"];

/** Normalize "o-1e" / " O-1 " to the canonical "O-1E" / "O-1". */
function normalizeGrade(grade: string): string {
  return grade.toUpperCase().trim();
}

/**
 * Does this member draw the prior-enlisted officer rate?
 *
 * Pure and total: false for enlisted grades, for warrants, for O-4 and above,
 * for a non-positive or non-finite month count, and for exactly 48 months.
 */
export function qualifiesForEnlistedOfficerRate(
  grade: string,
  priorEnlistedMonths: number
): boolean {
  const g = normalizeGrade(grade);
  if (!E_RATE_GRADES.includes(g)) return false;
  return Number.isFinite(priorEnlistedMonths) && priorEnlistedMonths > PRIOR_ENLISTED_E_RATE_MIN_MONTHS;
}

/**
 * The pay-table row a member is actually paid from — "O-1E" instead of "O-1"
 * once the prior-enlisted threshold is passed, and the grade unchanged in every
 * other case (including grades that already name an E row).
 */
export function payRowForGrade(grade: string, priorEnlistedMonths = 0): string {
  const g = normalizeGrade(grade);
  return qualifiesForEnlistedOfficerRate(g, priorEnlistedMonths) ? `${g}E` : g;
}

/** Prior enlisted service = total service minus commissioned service, never negative. */
export function priorEnlistedMonthsFrom(
  totalServiceMonths: number,
  commissionedMonths: number
): number {
  if (!Number.isFinite(totalServiceMonths) || !Number.isFinite(commissionedMonths)) return 0;
  return Math.max(0, totalServiceMonths - commissionedMonths);
}

export type BasePayLookupOptions = {
  /**
   * Total months of service. DFAS pays E-1s a reduced rate for the first 4
   * months; that rate is only applied when this is supplied and under 4.
   */
  serviceMonths?: number;
  /**
   * Months of prior ACTIVE enlisted/warrant service, which selects the
   * O-1E/O-2E/O-3E rows once it exceeds 4 years. Leave it off (or 0) and the
   * lookup behaves exactly as it did before.
   */
  priorEnlistedMonths?: number;
};

// Map a continuous years-of-service value to the pay-table column index.
function yosYearsToIndex(years: number): number {
  if (years < 2) return 0;
  let idx = 0;
  for (let i = 0; i < YOS_BREAKS.length; i++) {
    if (years >= YOS_BREAKS[i]) idx = i + 1;
    else break;
  }
  return idx;
}

function rateFromTable(
  dataset: BasePayDataset,
  grade: string,
  years: number
): number | null {
  const row = dataset?.tables?.[tableKeyForGrade(grade)]?.[grade];
  if (!row) return null;
  const v = row[yosYearsToIndex(years)];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function basePayFor(
  dataset: BasePayDataset,
  grade: string,
  years: number,
  // Either the total months of service (the original fourth argument) or an
  // options bag. Three-argument call sites are untouched: no reduced E-1 rate,
  // no E-rate upgrade, same column, same number.
  options?: number | BasePayLookupOptions
): number | null {
  const opts: BasePayLookupOptions =
    typeof options === "number" ? { serviceMonths: options } : options ?? {};
  const { serviceMonths, priorEnlistedMonths = 0 } = opts;

  if (
    typeof serviceMonths === "number" &&
    serviceMonths < 4 &&
    grade.toUpperCase().trim() === "E-1"
  ) {
    const under4 = dataset?.e1UnderFourMonthsMonthly;
    if (typeof under4 === "number" && Number.isFinite(under4)) return under4;
  }

  // The lookup decides whether the E row applies, so no caller has to guess.
  const row = payRowForGrade(grade, priorEnlistedMonths);
  if (row !== grade.toUpperCase().trim()) {
    // Only ever an upgrade: if the E table has no cell here, fall back to the
    // plain grade rather than losing the rate entirely. (A caller who names an
    // E grade outright still gets that row's null — that is a real data answer.)
    const upgraded = rateFromTable(dataset, row, years);
    if (upgraded != null) return upgraded;
  }

  return rateFromTable(dataset, grade, years);
}
