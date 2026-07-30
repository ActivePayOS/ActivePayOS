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

export function basePayFor(
  dataset: BasePayDataset,
  grade: string,
  years: number,
  // Total months of service, when the caller tracks time at month granularity.
  // DFAS pays E-1s a reduced rate for the first 4 months of service; that rate
  // is only applied when serviceMonths is supplied (and < 4), so existing
  // three-argument call sites keep returning the standard "2 or less" column.
  serviceMonths?: number
): number | null {
  if (
    typeof serviceMonths === "number" &&
    serviceMonths < 4 &&
    grade.toUpperCase().trim() === "E-1"
  ) {
    const under4 = dataset?.e1UnderFourMonthsMonthly;
    if (typeof under4 === "number" && Number.isFinite(under4)) return under4;
  }
  const row = dataset?.tables?.[tableKeyForGrade(grade)]?.[grade];
  if (!row) return null;
  const v = row[yosYearsToIndex(years)];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
