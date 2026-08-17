// lib/export/xlsx.ts
// Excel building blocks for the Wealth Projector workbook: conditional-format
// data bars, in-cell block bars, PNG embedding, and the "Trade space" sheet.
//
// ExcelJS 4.4 has no chart-creation API, so every visual here is one of the
// three things that survive a real Excel round-trip:
//   1. dataBar conditional formatting  - magnitude inside a sortable table
//   2. in-cell block bars (a static string, or a live REPT formula)
//   3. an embedded PNG via addImage    - a real chart image when one is passed
//
// Two ExcelJS bugs are routed around deliberately; see dataBarRule below.

import ExcelJS from "exceljs";
import type {
  AnalysisSection,
  AnalysisTable,
  MetricUnit,
  TradeSpaceAnalysis,
} from "@/lib/projection/trade-space";
import {
  BAR_CHAR,
  TRADE_SPACE_INTRO,
  TRADE_SPACE_TITLE,
  barColumns,
  collectAssumptions,
  collectCaveats,
  formatAnalysisValue,
  headlineComparison,
  inCellBar,
  severityLabel,
  sourceLabel,
  tableMax,
  unitLabel,
} from "./analysis";

/** ExcelJS's DataBarRuleType omits `color`, which its own writer requires. */
type DataBarRule = ExcelJS.DataBarRuleType & { color?: Partial<ExcelJS.Color> };

const INK = "FF1D2530";
const MUTED = "FF6B7280";
const NAVY = "FF11224A";
const BAR_BLUE = "FF2563EB";
const BAR_TEAL = "FF0D7C6B";
const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF3F8" } };
const MONO = "Consolas";

// ------------------------------------------------------------- data bars ---

/**
 * A dataBar rule that writes valid OOXML.
 *
 * - `cfvo` and `color` are both REQUIRED by ExcelJS's writer (it throws or
 *   emits a broken rule without them); neither has a default.
 * - `gradient` must stay false. ExcelJS decides whether to emit the modern
 *   x14 half with `!rule.gradient`, but writes the extLst back-reference
 *   unconditionally — so `gradient: true` leaves a dangling empty <x14:id/>
 *   and silently discards minLength/maxLength/border/axisPosition/direction.
 * - `showValue` is silently dropped by ExcelJS 4.4 (it emits no such
 *   attribute), so a bar-only column is not achievable here. Use an in-cell
 *   block bar when the number must not appear beside the bar.
 *
 * Pass ONE explicit numeric `max` whenever two columns must be compared:
 * per-column auto-scaling makes the bars lie about the comparison.
 */
export function dataBarRule(opts: {
  color?: string;
  min?: number;
  max?: number;
  priority?: number;
}): DataBarRule {
  return {
    type: "dataBar",
    priority: opts.priority ?? 1,
    gradient: false,
    border: false,
    cfvo: [
      typeof opts.min === "number" ? { type: "num", value: opts.min } : { type: "min" },
      typeof opts.max === "number" ? { type: "num", value: opts.max } : { type: "max" },
    ],
    color: { argb: opts.color ?? BAR_BLUE },
  };
}

/**
 * Attach data bars to a range. `ref` may hold several space-separated ranges
 * ("C5:C12 E5:E12"), which is how non-adjacent columns share one scale.
 */
export function addDataBars(
  ws: ExcelJS.Worksheet,
  ref: string,
  opts: { color?: string; min?: number; max?: number } = {}
): void {
  ws.addConditionalFormatting({ ref, rules: [dataBarRule(opts)] });
}

/** 1 -> "A", 27 -> "AA". */
export function columnLetter(index: number): string {
  let n = index;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/**
 * A REPT bar that recalculates when the user edits the model.
 *
 * Uses the literal block character rather than UNICHAR(9608), which Excel
 * rejects as #NAME? unless it is stored with an `_xlfn.` prefix, and CHAR(),
 * which only accepts 1-255 and returns #VALUE! here.
 */
export function barFormula(valueRef: string, maxRef: string, width = 20): string {
  return `IF(N(${maxRef})<=0,"",REPT("${BAR_CHAR}",MIN(${width},MAX(1,ROUND(${valueRef}/${maxRef}*${width},0)))))`;
}

// ----------------------------------------------------------------- image ---

/** Pixel size straight out of the PNG IHDR chunk. Null when it is not a PNG. */
export function pngPixelSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24) return null;
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < signature.length; i += 1) {
    if (bytes[i] !== signature[i]) return null;
  }
  const at = (offset: number) =>
    ((bytes[offset] << 24) >>> 0) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3];
  const width = at(16);
  const height = at(20);
  return width > 0 && height > 0 ? { width, height } : null;
}

/**
 * Embed a PNG at an exact pixel size.
 *
 * The object anchor with an explicit `ext` emits a oneCellAnchor and renders
 * pixel-exact; a range-string anchor ("J2:R17") emits a twoCellAnchor and
 * Excel stretches the picture to the cells, distorting a chart. Returns false
 * when the bytes are not a usable PNG, so callers degrade to bars instead of
 * writing a broken workbook.
 */
export function embedPng(
  wb: ExcelJS.Workbook,
  ws: ExcelJS.Worksheet,
  bytes: Uint8Array,
  at: { col: number; row: number; maxWidth?: number }
): boolean {
  const size = pngPixelSize(bytes);
  if (!size) return false;
  try {
    const cap = at.maxWidth ?? 760;
    const scale = size.width > cap ? cap / size.width : 1;
    // ExcelJS types `buffer` against its own vendored Buffer declaration; the
    // value handed over is a real Node Buffer either way.
    const id = wb.addImage({
      buffer: Buffer.from(bytes) as unknown as ExcelJS.Image["buffer"],
      extension: "png",
    });
    ws.addImage(id, {
      tl: { col: at.col, row: at.row },
      ext: { width: Math.round(size.width * scale), height: Math.round(size.height * scale) },
      editAs: "oneCell",
    });
    return true;
  } catch {
    return false;
  }
}

// ------------------------------------------------------------ formatting ---

function numFmtFor(unit: MetricUnit): string | undefined {
  switch (unit) {
    case "usd":
    case "usd-per-month":
    case "usd-per-year":
      return "#,##0";
    case "percent":
    case "years":
    case "count":
      return "0.0##";
    case "age":
    case "calendar-year":
      return "0";
    default:
      return undefined;
  }
}

/** Numbers stay numbers so Excel can sort, chart and data-bar them. */
function cellValue(value: number | string, unit: MetricUnit): ExcelJS.CellValue {
  if (typeof value === "number" && Number.isFinite(value) && unit !== "text") return value;
  return formatAnalysisValue(value, unit, "human");
}

// ----------------------------------------------------- Trade space sheet ---

export type LiveTradeSpaceRefs = {
  /** Absolute Assumptions-sheet addresses of the yellow input cells. */
  high3: string;
  stayYos: string;
  multiplierPct: string;
  retireAge: string;
  colaPct: string;
  withdrawalPct: string;
  lifeAge: string;
  taxNowPct: string;
  taxLaterPct: string;
  rothMonthly: string;
  rothYears: string;
  returnPct: string;
  /** Projection-sheet addresses for the horizon row. */
  projectedTotal: string;
  horizonAge: string;
};

export type TradeSpaceSheetOptions = {
  /** Engine sections to render. Omit to render every section it produced. */
  sectionIds?: string[];
  /** Table keys to leave out — data the caller cannot supply honestly. */
  skipTableKeys?: string[];
  /** Assumption keys to leave out, for the same reason. */
  skipAssumptionKeys?: string[];
  /** Renders the live, formula-driven retirement + Roth calculator. */
  live?: LiveTradeSpaceRefs;
  /** A chart image to embed. Degrades to bars when absent or unreadable. */
  chartPng?: Uint8Array;
};

/**
 * The "Trade space" sheet: stay-in vs get-out, Roth vs Traditional and the
 * IRA guidance as labelled tables with an explanation column, in-cell bars on
 * the headline outcomes, and data bars inside every comparable table.
 *
 * Assumptions and caveats are written onto the SAME sheet as the numbers,
 * because a stay-vs-leave figure without its assumptions is worse than useless.
 */
export function addTradeSpaceSheet(
  wb: ExcelJS.Workbook,
  analysis: TradeSpaceAnalysis,
  opts: TradeSpaceSheetOptions = {}
): ExcelJS.Worksheet {
  const ws = wb.addWorksheet("Trade space");
  ws.columns = [{ width: 46 }, { width: 18 }, { width: 24 }, { width: 104 }];
  ws.views = [{ state: "frozen", ySplit: 1 }];

  let row = 1;
  const skip = new Set(opts.skipTableKeys ?? []);
  const grey = { color: { argb: MUTED }, size: 10 } as const;

  const title = (text: string, size = 12) => {
    const cell = ws.getCell(row, 1);
    cell.value = text;
    cell.font = { bold: true, size, color: { argb: NAVY } };
    row += 1;
  };
  const note = (text: string) => {
    ws.getCell(row, 1).value = text;
    ws.getCell(row, 1).font = grey;
    row += 1;
  };
  const blank = () => {
    row += 1;
  };
  const headerRow = (labels: string[]) => {
    labels.forEach((label, i) => {
      const cell = ws.getCell(row, i + 1);
      cell.value = label;
      cell.font = { bold: true, color: { argb: INK } };
      cell.fill = HEADER_FILL;
    });
    const r = row;
    row += 1;
    return r;
  };

  title(`ActivePayOS — ${TRADE_SPACE_TITLE}`, 14);
  note(TRADE_SPACE_INTRO);
  blank();

  // ---- headline comparison: two magnitudes on ONE bar scale --------------
  const head = headlineComparison(analysis);
  if (head) {
    title(head.title);
    const barTop = headerRow(["Path", "Total position", "Scale (one shared)", "What it means"]);
    const firstDataRow = row;
    for (const bar of head.bars) {
      ws.getCell(row, 1).value = bar.label;
      const valueCell = ws.getCell(row, 2);
      valueCell.value = bar.value;
      valueCell.numFmt = "#,##0";
      const barCell = ws.getCell(row, 3);
      barCell.value = inCellBar(bar.value, head.max);
      barCell.font = { name: MONO, color: { argb: BAR_BLUE } };
      ws.getCell(row, 4).value = head.note;
      ws.getCell(row, 4).font = grey;
      row += 1;
    }
    // Data bars too: same explicit 0..max bounds on both rows, so the bars
    // cannot auto-scale independently and misrepresent the comparison.
    if (row > firstDataRow) {
      addDataBars(ws, `B${firstDataRow}:B${row - 1}`, { min: 0, max: head.max, color: BAR_BLUE });
    }
    void barTop;
    blank();
  }

  // ---- one block per engine section --------------------------------------
  const sections: AnalysisSection[] = opts.sectionIds
    ? analysis.sections.filter((s) => opts.sectionIds!.includes(s.id))
    : analysis.sections;

  for (const section of sections) {
    title(section.title);
    note(section.headline);
    if (!section.complete) {
      note("An input this section needs was missing, so it reports only what could be computed — nothing is filled in with a guess.");
    }

    if (section.metrics.length > 0) {
      headerRow(["Item", "Value", "Scale", "What it means"]);
      const metricTop = row;
      const moneyMetrics = section.metrics.filter(
        (m) => typeof m.value === "number" && m.unit.startsWith("usd") && m.value > 0
      );
      const metricMax = moneyMetrics.reduce((max, m) => Math.max(max, Number(m.value)), 0);
      for (const metric of section.metrics) {
        ws.getCell(row, 1).value = metric.label;
        if (metric.emphasis === "headline") ws.getCell(row, 1).font = { bold: true };
        const valueCell = ws.getCell(row, 2);
        valueCell.value = cellValue(metric.value, metric.unit);
        const fmt = numFmtFor(metric.unit);
        if (fmt && typeof valueCell.value === "number") valueCell.numFmt = fmt;
        if (typeof metric.value === "number" && metric.unit.startsWith("usd") && metric.value > 0) {
          const barCell = ws.getCell(row, 3);
          barCell.value = inCellBar(Number(metric.value), metricMax, 14);
          barCell.font = { name: MONO, color: { argb: BAR_TEAL } };
        }
        const explanation =
          typeof metric.realValue === "number"
            ? `${metric.explanation}  (${Math.round(metric.realValue).toLocaleString("en-US")} in today's dollars)`
            : metric.explanation;
        ws.getCell(row, 4).value = explanation;
        ws.getCell(row, 4).font = grey;
        row += 1;
      }
      void metricTop;
      blank();
    }

    for (const table of section.tables) {
      if (skip.has(table.key)) continue;
      writeAnalysisTable(ws, table, () => row, (next) => {
        row = next;
      });
      blank();
    }
  }

  // ---- the live, formula-driven calculator --------------------------------
  if (opts.live) {
    writeLiveTradeSpace(ws, opts.live, () => row, (next) => {
      row = next;
    });
    blank();
  }

  // ---- assumptions and caveats, on the same sheet as the numbers ----------
  const omitted = new Set(opts.skipAssumptionKeys ?? []);
  title("Assumptions behind every figure above");
  headerRow(["Assumption", "Value", "Where it comes from", "What it means"]);
  for (const a of collectAssumptions(analysis).filter((x) => !omitted.has(x.key))) {
    ws.getCell(row, 1).value = a.label;
    const valueCell = ws.getCell(row, 2);
    valueCell.value = cellValue(a.value, a.unit);
    const fmt = numFmtFor(a.unit);
    if (fmt && typeof valueCell.value === "number") valueCell.numFmt = fmt;
    ws.getCell(row, 3).value = `${unitLabel(a.unit)} — ${sourceLabel(a.source)}`.replace(/^ — /, "");
    ws.getCell(row, 3).font = grey;
    ws.getCell(row, 4).value = a.explanation;
    ws.getCell(row, 4).font = grey;
    row += 1;
  }
  blank();

  title("Caveats — things that change the answer");
  headerRow(["Weight", "What it is"]);
  for (const c of collectCaveats(analysis)) {
    ws.getCell(row, 1).value = severityLabel(c.severity);
    ws.getCell(row, 1).font = { color: { argb: c.severity === "info" ? MUTED : INK }, bold: c.severity !== "info" };
    ws.getCell(row, 2).value = c.text;
    ws.getCell(row, 2).font = grey;
    row += 1;
  }
  blank();
  note("Planning estimate only. Assumed returns and assumed tax rates are not guarantees. Verify at tsp.gov, irs.gov and DFAS. activepayos.com");

  // ---- optional chart image, anchored pixel-exact -------------------------
  if (opts.chartPng && opts.chartPng.length > 0) {
    embedPng(wb, ws, opts.chartPng, { col: 4.2, row: 2, maxWidth: 720 });
  }

  return ws;
}

/** One engine table, with data bars over every column sharing its scale. */
function writeAnalysisTable(
  ws: ExcelJS.Worksheet,
  table: AnalysisTable,
  getRow: () => number,
  setRow: (next: number) => void
): void {
  let row = getRow();
  ws.getCell(row, 1).value = table.title;
  ws.getCell(row, 1).font = { bold: true, color: { argb: INK } };
  row += 1;

  table.columns.forEach((col, i) => {
    const cell = ws.getCell(row, i + 1);
    cell.value = unitLabel(col.unit) ? `${col.label} (${unitLabel(col.unit)})` : col.label;
    cell.font = { bold: true, color: { argb: INK } };
    cell.fill = HEADER_FILL;
  });
  const headerAt = row;
  row += 1;

  const firstDataRow = row;
  for (const r of table.rows) {
    table.columns.forEach((col, i) => {
      const cell = ws.getCell(row, i + 1);
      const raw = r[col.key];
      cell.value = cellValue(raw ?? "", col.unit);
      const fmt = numFmtFor(col.unit);
      if (fmt && typeof cell.value === "number") cell.numFmt = fmt;
      if (col.unit === "text") cell.font = { color: { argb: INK }, size: 10 };
    });
    row += 1;
  }
  const lastDataRow = row - 1;

  // Shared-scale bars: ONE numeric range across every named column, because
  // scaling paired columns independently makes the bars lie.
  const barKeys = table.sharedBarScale ?? barColumns(table);
  if (barKeys.length > 0 && lastDataRow >= firstDataRow) {
    const max = tableMax(table, barKeys);
    if (max > 0) {
      const refs = barKeys
        .map((key) => table.columns.findIndex((c) => c.key === key))
        .filter((i) => i >= 0)
        .map((i) => `${columnLetter(i + 1)}${firstDataRow}:${columnLetter(i + 1)}${lastDataRow}`);
      if (refs.length > 0) {
        addDataBars(ws, refs.join(" "), { min: 0, max, color: BAR_BLUE });
      }
    }
  }
  void headerAt;
  setRow(row);
}

/**
 * The live half of the sheet: retirement and Roth worked entirely in formulas
 * against the yellow Assumptions cells, so the whole comparison recalculates
 * when the reader disagrees with an input and edits it.
 *
 * This is the only part of the workbook that can talk about a pension when the
 * caller has no basic-pay history: the reader supplies their own High-3 and
 * years of service rather than the tool inventing one.
 */
function writeLiveTradeSpace(
  ws: ExcelJS.Worksheet,
  refs: LiveTradeSpaceRefs,
  getRow: () => number,
  setRow: (next: number) => void
): void {
  let row = getRow();
  const grey = { color: { argb: MUTED }, size: 10 } as const;

  ws.getCell(row, 1).value = "Live trade-space calculator (edit the yellow cells on the Assumptions sheet)";
  ws.getCell(row, 1).font = { bold: true, size: 12, color: { argb: NAVY } };
  row += 1;
  ws.getCell(row, 1).value =
    "Every cell below is a formula. This workbook models ONE career path, so the pension is priced from the High-3 and years of service you enter; change 'Years still serving' on the Assumptions sheet to see the savings side move too.";
  ws.getCell(row, 1).font = grey;
  row += 1;
  // Without a High-3 every retirement figure below is legitimately zero. Say
  // so plainly rather than letting the reader think the sheet is broken.
  ws.getCell(row, 1).value = { formula: `IF(N(${refs.high3})>0,"","Enter your High-3 monthly basic pay on the Assumptions sheet — until you do, every retirement figure below reads $0 because none of it can be estimated without it.")` };
  ws.getCell(row, 1).font = { bold: true, color: { argb: "FFB45309" } };
  row += 1;

  ["Item", "Value", "Scale", "What it means"].forEach((label, i) => {
    const cell = ws.getCell(row, i + 1);
    cell.value = label;
    cell.font = { bold: true, color: { argb: INK } };
    cell.fill = HEADER_FILL;
  });
  row += 1;

  const line = (label: string, formula: string, explanation: string, fmt = "#,##0"): number => {
    ws.getCell(row, 1).value = label;
    const cell = ws.getCell(row, 2);
    cell.value = { formula };
    cell.numFmt = fmt;
    ws.getCell(row, 4).value = explanation;
    ws.getCell(row, 4).font = grey;
    const at = row;
    row += 1;
    return at;
  };

  const eligible = `N(${refs.stayYos})>=20`;
  const annualPension = `IF(${eligible},${refs.high3}*12*(${refs.multiplierPct}/100)*${refs.stayYos},0)`;
  const yearsRetired = `MAX(0,N(${refs.horizonAge})-N(${refs.retireAge}))`;
  const grownAnnual = `${annualPension}*(1+${refs.colaPct}/100)^${yearsRetired}`;
  const nestEgg = `IF(${refs.withdrawalPct}<=0,0,(${grownAnnual})/(${refs.withdrawalPct}/100))`;

  line(
    "Monthly retired pay",
    `ROUND((${annualPension})/12,2)`,
    "Your High-3 basic pay times the multiplier times years of service. Zero below 20 years — the pension is a cliff, not a gradient.",
    "#,##0.00"
  );
  line(
    "Annual retired pay (first year)",
    `ROUND(${annualPension},2)`,
    "Twelve months of retired pay, before tax, in the first year of retirement."
  );
  const nestRow = line(
    "Nest-egg equivalent of the pension",
    `ROUND(${nestEgg},2)`,
    "The savings balance it would take to draw that pension at your sustainable-withdrawal rate. For most members this single figure is larger than the entire projected TSP."
  );
  line(
    "Lifetime retired pay to the assumed age (undiscounted)",
    `ROUND(IF(${refs.colaPct}=0,(${annualPension})*MAX(0,N(${refs.lifeAge})-N(${refs.retireAge})),(${annualPension})*(((1+${refs.colaPct}/100)^MAX(0,N(${refs.lifeAge})-N(${refs.retireAge})))-1)/(${refs.colaPct}/100)),2)`,
    "The raw sum of every payment to the assumed age, in the dollars of each year — future dollars, not today's."
  );
  const savingsRow = line(
    "Projected savings at the horizon (no pension)",
    `${refs.projectedTotal}`,
    "The Projection sheet's total. It does NOT include the pension, which is why that number looks the same whether you serve 19 years or 20."
  );
  const stayRow = line(
    "Total position WITH military retirement",
    `ROUND(${refs.projectedTotal}+${nestEgg},2)`,
    "Savings plus the pension's nest-egg equivalent — the only basis on which staying in and getting out can be compared. Pre-tax."
  );
  const leaveRow = line(
    "Total position WITHOUT military retirement",
    `ROUND(${refs.projectedTotal},2)`,
    "The same savings with no pension behind them — what getting out short of 20 years leaves you holding."
  );
  line(
    "What the pension is worth to this plan",
    `ROUND(${nestEgg},2)`,
    "The gap between the two lines above. Reaching 20 years is worth this much, before any difference in what you save along the way."
  );

  // In-cell bars beside the two comparable lines, sharing one MAX() scale so
  // they cannot be read against different rulers.
  const scaleRef = `MAX($B$${stayRow},$B$${leaveRow})`;
  for (const at of [stayRow, leaveRow]) {
    const cell = ws.getCell(at, 3);
    cell.value = { formula: barFormula(`$B$${at}`, scaleRef) };
    cell.font = { name: MONO, color: { argb: BAR_BLUE } };
  }
  addDataBars(ws, `B${stayRow}:B${leaveRow}`, { min: 0, color: BAR_BLUE });
  void nestRow;
  void savingsRow;

  row += 1;
  ws.getCell(row, 1).value = "Roth vs Traditional, live";
  ws.getCell(row, 1).font = { bold: true, size: 12, color: { argb: NAVY } };
  row += 1;
  ["Item", "Value", "Scale", "What it means"].forEach((label, i) => {
    const cell = ws.getCell(row, i + 1);
    cell.value = label;
    cell.font = { bold: true, color: { argb: INK } };
    cell.fill = HEADER_FILL;
  });
  row += 1;

  const growth = `((1+${refs.returnPct}/100)^${refs.rothYears}-1)/(${refs.returnPct}/100)`;
  const balance = `IF(${refs.returnPct}=0,${refs.rothMonthly}*12*${refs.rothYears},${refs.rothMonthly}*12*${growth})`;
  const upFrontTax = `${refs.rothMonthly}*12*${refs.rothYears}*(${refs.taxNowPct}/100)`;

  line("Pre-tax balance at the horizon", `ROUND(${balance},2)`, "Identical on both paths — the same dollars went in.");
  const rothRow = line(
    "Roth: value net of the up-front tax",
    `ROUND((${balance})*(1-${refs.taxNowPct}/100),2)`,
    "Qualified Roth withdrawals are tax-free, so the balance itself is yours. What is netted here is the tax you paid up front — money the Traditional path kept invested — compounded at the same return. That netting is what makes equal tax rates tie exactly."
  );
  const tradRow = line(
    "Traditional: after-tax value",
    `ROUND((${balance})*(1-${refs.taxLaterPct}/100),2)`,
    "The whole balance — contributions and every dollar of growth — is taxed at withdrawal."
  );
  line(
    "Roth advantage (negative favours Traditional)",
    `ROUND((${balance})*((1-${refs.taxNowPct}/100)-(1-${refs.taxLaterPct}/100)),2)`,
    "Both paths put the same dollars in, so this reduces to which marginal tax rate is higher — today's or retirement's."
  );
  line(
    "Break-even retirement tax rate",
    `${refs.taxNowPct}`,
    "Above this retirement-time rate Roth wins; below it Traditional wins; at it they tie. It is simply your marginal rate today.",
    "0.0##"
  );
  line(
    "Tax paid up front on the Roth path",
    `ROUND(${upFrontTax},2)`,
    "Tax on the income before it ever reached the account — money the Traditional path keeps invested instead."
  );

  const rothScale = `MAX($B$${rothRow},$B$${tradRow})`;
  for (const at of [rothRow, tradRow]) {
    const cell = ws.getCell(at, 3);
    cell.value = { formula: barFormula(`$B$${at}`, rothScale) };
    cell.font = { name: MONO, color: { argb: BAR_TEAL } };
  }
  addDataBars(ws, `B${rothRow}:B${tradRow}`, { min: 0, color: BAR_TEAL });

  setRow(row);
}
