// lib/export/summary.ts
// Shared, minimalist "just the pay numbers" summary used by the CSV, TXT and
// PDF exporters. Intentionally excludes the hybrid budget targets (housing /
// food / savings / TSP) — those live only in the full Excel workbook.

type PayLine = {
  label: string;
  monthly: number;
  annual: number;
};

export type PaySummary = {
  // Context
  year: number;
  grade: string;
  yosLabel: string;
  location: string; // duty ZIP, or a "no BAH" note
  dependents: boolean;
  stateOfLegalResidence: string;
  receivesBah: boolean;
  generatedOn: string; // YYYY-MM-DD

  // Pay components + total (monthly and annualized)
  lines: PayLine[];
  total: PayLine;
};

export type BuildSummaryArgs = {
  year: number;
  grade: string;
  yosLabel: string;
  zip5?: string;
  receivesBah: boolean;
  dependents: boolean;
  stateOfLegalResidence: string;

  baseMonthly: number;
  bahMonthly: number;
  basMonthly: number;
  otherMonthly: number;

  generatedOn: string;
};

function line(label: string, monthly: number): PayLine {
  return { label, monthly, annual: monthly * 12 };
}

export function buildPaySummary(args: BuildSummaryArgs): PaySummary {
  const lines: PayLine[] = [
    line("Base Pay", args.baseMonthly),
    line(args.receivesBah ? "BAH (housing allowance)" : "BAH (none - barracks)", args.bahMonthly),
    line("BAS (food allowance)", args.basMonthly),
  ];

  // Only surface "Other Income" when it is actually set, to keep the
  // minimalist output uncluttered.
  if (args.otherMonthly > 0) {
    lines.push(line("Other Income", args.otherMonthly));
  }

  const totalMonthly = lines.reduce((sum, l) => sum + l.monthly, 0);

  return {
    year: args.year,
    grade: args.grade || "-",
    yosLabel: args.yosLabel || "-",
    location: args.receivesBah ? args.zip5 ?? "-" : "No BAH / barracks",
    dependents: args.dependents,
    stateOfLegalResidence: args.stateOfLegalResidence || "Not selected",
    receivesBah: args.receivesBah,
    generatedOn: args.generatedOn,
    lines,
    total: line("Total Pay", totalMonthly),
  };
}

// "$3,000.00" — for human-facing TXT/PDF output.
export function formatUsd(n: number): string {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  const [whole, frac] = abs.toFixed(2).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}$${grouped}.${frac}`;
}

// "3000.00" — bare number for machine-friendly CSV cells.
export function formatPlain(n: number): string {
  return n.toFixed(2);
}
