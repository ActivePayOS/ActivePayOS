// lib/pay/basepay.ts
import fs from "node:fs";
import path from "node:path";

export type PayTableKey = "CO" | "CO_FE" | "WO" | "EM";

export const YOS_HEADERS = [
  "2 or less",
  "Over 2",
  "Over 3",
  "Over 4",
  "Over 6",
  "Over 8",
  "Over 10",
  "Over 12",
  "Over 14",
  "Over 16",
  "Over 18",
  "Over 20",
  "Over 22",
  "Over 24",
  "Over 26",
  "Over 28",
  "Over 30",
  "Over 32",
  "Over 34",
  "Over 36",
  "Over 38",
  "Over 40",
] as const;

export const YOS_BREAKS = [2,3,4,6,8,10,12,14,16,18,20,22,24,26,28,30,32,34,36,38,40] as const;

export type BasePayDataset = {
  year: number;
  headers: string[];
  breaks: number[];
  generatedAt?: string;
  tables: Record<PayTableKey, Record<string, Array<number | null>>>;
};

function readJson<T>(p: string): T {
  const raw = fs.readFileSync(p, "utf8");
  return JSON.parse(raw) as T;
}

export function tableKeyForGrade(grade: string): PayTableKey {
  const g = grade.toUpperCase().trim();
  if (g.startsWith("W-")) return "WO";
  if (g.startsWith("E-")) return "EM";
  if (g.startsWith("O-") && g.endsWith("E")) return "CO_FE";
  if (g.startsWith("O-")) return "CO";
  // default fallback
  return "CO";
}

export function loadBasePay(year: number): BasePayDataset {
  const p = path.join(process.cwd(), "data", "basepay", `${year}.json`);
  return readJson<BasePayDataset>(p);
}

/**
 * Convert a user's "Years of Service" selection into an index 0..21
 * matching your dataset headers.
 *
 * Expected inputs:
 *  - "< 2" or "2 or less" -> 0
 *  - "Over 2" -> 1
 *  - "Over 3" -> 2
 *  ...
 *  - "Over 40" -> 21
 */
export function yosLabelToIndex(label: string): number {
  const s = label.trim().toLowerCase();

  if (s === "< 2" || s === "<2" || s.includes("2 or less")) return 0;

  // try to parse "over N"
  const m = s.match(/over\s*(\d+)/);
  if (m) {
    const n = Number(m[1]);
    const idx = YOS_BREAKS.indexOf(n as any);
    if (idx !== -1) return idx + 1; // because index 0 is "2 or less"
  }

  // fallback: if label equals one of the headers
  const headerIdx = YOS_HEADERS.map(h => h.toLowerCase()).indexOf(s);
  if (headerIdx !== -1) return headerIdx;

  // safest fallback
  return 0;
}

export function getBasePay(year: number, grade: string, yosLabel: string): number | null {
  const d = loadBasePay(year);
  const key = tableKeyForGrade(grade);
  const row = d.tables?.[key]?.[grade];
  if (!row) return null;

  const idx = yosLabelToIndex(yosLabel);
  const v = row[idx];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Returns the full 22-value series for graphing a single grade across YOS steps.
 */
export function getBasePaySeries(year: number, grade: string): Array<number | null> {
  const d = loadBasePay(year);
  const key = tableKeyForGrade(grade);
  const row = d.tables?.[key]?.[grade];
  if (!row) return new Array(22).fill(null);
  return row.slice(0, 22) as Array<number | null>;
}
