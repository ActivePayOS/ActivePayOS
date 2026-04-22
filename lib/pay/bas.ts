// lib/pay/bas.ts
import bas2026 from "@/data/bas/2026.json";

type BasYear = 2026; // expand later as you add more files
type BasFile = {
  year: number;
  effectiveDate: string;
  source: string;
  rates: {
    officers: number;
    enlisted: number;
    basII?: number;
  };
};

const BAS_BY_YEAR: Record<BasYear, BasFile> = {
  2026: bas2026 as BasFile,
};

function isOfficerPayGrade(payGrade: string) {
  // O-*, O1E/O2E/O3E, W-* are treated as officer-type BAS (not enlisted BAS)
  return (
    payGrade.startsWith("O") ||
    payGrade.startsWith("W") ||
    payGrade.includes("O1E") ||
    payGrade.includes("O2E") ||
    payGrade.includes("O3E")
  );
}

export function getBAS(year: number, payGrade: string): number | null {
  const file = (BAS_BY_YEAR as Record<number, BasFile | undefined>)[year];
  if (!file) return null;

  const rates = file.rates;
  return isOfficerPayGrade(payGrade) ? rates.officers : rates.enlisted;
}