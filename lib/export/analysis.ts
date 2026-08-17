// lib/export/analysis.ts
// Format-agnostic rendering helpers for the comprehensive trade-space analysis
// (lib/projection/trade-space.ts).
//
// The engine deliberately returns numbers + units + explanations and never a
// formatted string, so each output medium can render the SAME analysis
// natively:
//   CSV  - a labelled section with Value / Unit / What it means columns
//   TXT  - a headline block, then metrics with indented explanations
//   PDF  - a readable section with the key comparison called out
//   JSON - the structured analysis verbatim
//   XLSX - labelled tables with an explanation column and in-cell bars
//
// Everything here is presentation only. No figure is re-derived: if a number
// is not on the analysis object it does not appear in an export.

import {
  analyzeTradeSpace,
  type AnalysisSection,
  type AnalysisTable,
  type Assumption,
  type Caveat,
  type Metric,
  type MetricUnit,
  type TradeSpaceAnalysis,
} from "@/lib/projection/trade-space";
import type { ProjectionExport } from "./projection";
import { formatPlain, formatUsd } from "./summary";

/** One heading every format uses, so the section is findable across outputs. */
export const TRADE_SPACE_TITLE = "Trade space analysis";

export const TRADE_SPACE_INTRO =
  "Staying in vs getting out, Roth vs Traditional, and where an IRA fits - " +
  "with military retirement valued alongside the savings balances. The " +
  "projector's headline total does NOT include the pension, because a pension " +
  "is an income stream and not a balance; this section capitalizes it so the " +
  "two paths can be compared on one number.";

/** Build the analysis for a payload. The single seam every format calls. */
export function projectionAnalysis(p: ProjectionExport): TradeSpaceAnalysis {
  return analyzeTradeSpace(p);
}

// ------------------------------------------------------------ formatting ---

/** "human" is for TXT/PDF prose; "plain" is for machine-readable CSV cells. */
export type ValueStyle = "human" | "plain";

/** A short, printable name for a unit — the CSV/XLSX "Unit" column. */
export function unitLabel(unit: MetricUnit): string {
  switch (unit) {
    case "usd":
      return "USD";
    case "usd-per-month":
      return "USD/mo";
    case "usd-per-year":
      return "USD/yr";
    case "percent":
      return "%";
    case "years":
      return "years";
    case "age":
      return "age";
    case "calendar-year":
      return "year";
    case "count":
      return "count";
    default:
      return "";
  }
}

/**
 * Render one analysis value. Numbers stay bare in "plain" style so a
 * spreadsheet reads them as numbers; the unit travels in its own column.
 */
export function formatAnalysisValue(
  value: number | string,
  unit: MetricUnit,
  style: ValueStyle = "human"
): string {
  if (typeof value === "string") return value;
  if (!Number.isFinite(value)) return "-";
  if (style === "plain") {
    switch (unit) {
      case "usd":
      case "usd-per-month":
      case "usd-per-year":
        return formatPlain(value);
      case "text":
        return String(value);
      default:
        return String(Math.round(value * 100) / 100);
    }
  }
  switch (unit) {
    case "usd":
      return formatUsd(value);
    case "usd-per-month":
      return `${formatUsd(value)}/mo`;
    case "usd-per-year":
      return `${formatUsd(value)}/yr`;
    case "percent":
      return `${Math.round(value * 100) / 100}%`;
    case "years":
      return `${Math.round(value * 10) / 10} yr`;
    case "age":
      return `age ${Math.round(value)}`;
    case "calendar-year":
      return String(Math.round(value));
    case "count":
      return String(Math.round(value * 100) / 100);
    default:
      return String(value);
  }
}

/** Metric line with the today's-dollars figure appended when it is carried. */
export function formatMetric(metric: Metric, style: ValueStyle = "human"): string {
  const base = formatAnalysisValue(metric.value, metric.unit, style);
  if (style === "plain" || typeof metric.realValue !== "number") return base;
  return `${base} (${formatUsd(metric.realValue)} in today's dollars)`;
}

/** Where an assumption came from, spelled out rather than left as a code. */
export function sourceLabel(source: Assumption["source"]): string {
  switch (source) {
    case "payload":
      return "from your scenario";
    case "caller":
      return "supplied by the tool";
    case "statute":
      return "set by law or IRS figures";
    default:
      return "this analysis' default";
  }
}

/** A one-character severity marker for fixed-width TXT output. */
export function severityMark(severity: Caveat["severity"]): string {
  if (severity === "caution") return "!";
  if (severity === "cannot-quantify") return "?";
  return "-";
}

export function severityLabel(severity: Caveat["severity"]): string {
  if (severity === "caution") return "Caution";
  if (severity === "cannot-quantify") return "Not quantified";
  return "Note";
}

// ------------------------------------------------------------------ bars ---

/** Block character used for in-cell / in-text bars (renders without a font hack). */
export const BAR_CHAR = "█";

/**
 * A proportional bar of block characters. Any non-zero value gets at least one
 * block so "small" never reads as "nothing"; scale is always shared by the
 * caller passing one `max` for every series being compared.
 */
export function inCellBar(value: number, max: number, width = 20): string {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0 || value <= 0) return "";
  const blocks = Math.round((value / max) * width);
  return BAR_CHAR.repeat(Math.min(width, Math.max(1, blocks)));
}

/** The largest value across the given columns — the shared bar scale. */
export function tableMax(table: AnalysisTable, columnKeys: readonly string[]): number {
  let max = 0;
  for (const row of table.rows) {
    for (const key of columnKeys) {
      const v = row[key];
      if (typeof v === "number" && Number.isFinite(v) && v > max) max = v;
    }
  }
  return max;
}

/** Columns the engine flagged as reading well as a bar. */
export function barColumns(table: AnalysisTable): string[] {
  return table.columns.filter((c) => c.bar).map((c) => c.key);
}

// -------------------------------------------------------- headline digest ---

export type HeadlineComparison = {
  title: string;
  /** Two or more labelled magnitudes on ONE scale, ready to bar. */
  bars: { label: string; value: number; unit: MetricUnit }[];
  max: number;
  note: string;
};

/**
 * The single comparison worth calling out in a space-constrained medium: the
 * two total positions side by side. Null when the comparison did not compute.
 */
export function headlineComparison(analysis: TradeSpaceAnalysis): HeadlineComparison | null {
  const sl = analysis.stayVsLeave;
  if (!sl || !sl.comparable || !sl.stay || !sl.leave) return null;
  const bars = [
    { label: sl.stay.label, value: sl.stay.totalPositionAtEnd, unit: "usd" as MetricUnit },
    { label: sl.leave.label, value: sl.leave.totalPositionAtEnd, unit: "usd" as MetricUnit },
  ];
  return {
    title: "Total position at the end of the projection",
    bars,
    max: Math.max(...bars.map((b) => b.value), 0),
    note:
      "Investable savings PLUS the pension's nest-egg equivalent - the only " +
      "basis on which the two paths can be compared. Pre-tax on both sides.",
  };
}

/** Metrics the engine marked as worth leading with. */
export function headlineMetrics(section: AnalysisSection): Metric[] {
  return section.metrics.filter((m) => m.emphasis === "headline");
}

/**
 * Assumptions and caveats that apply to the whole analysis, followed by each
 * section's own — de-duplicated by key so the same statutory note does not
 * repeat four times in one export.
 */
export function collectAssumptions(analysis: TradeSpaceAnalysis): Assumption[] {
  const seen = new Set<string>();
  const out: Assumption[] = [];
  for (const a of [...analysis.assumptions, ...analysis.sections.flatMap((s) => s.assumptions)]) {
    if (seen.has(a.key)) continue;
    seen.add(a.key);
    out.push(a);
  }
  return out;
}

export function collectCaveats(analysis: TradeSpaceAnalysis): Caveat[] {
  const seen = new Set<string>();
  const out: Caveat[] = [];
  for (const c of [...analysis.caveats, ...analysis.sections.flatMap((s) => s.caveats)]) {
    if (seen.has(c.key) || seen.has(c.text)) continue;
    seen.add(c.key);
    seen.add(c.text);
    out.push(c);
  }
  return out;
}
