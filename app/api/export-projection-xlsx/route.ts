import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { addDataBars, addTradeSpaceSheet, type LiveTradeSpaceRefs } from "@/lib/export/xlsx";
import type { ProjectionExport } from "@/lib/export/projection";
import { analyzeTradeSpace, type TradeSpaceAnalysis } from "@/lib/projection/trade-space";
import {
  DEFAULT_LIFE_EXPECTANCY_AGE,
  DEFAULT_SAFE_WITHDRAWAL_RATE_PCT,
  REGULAR_RETIREMENT_YEARS,
  RETIREMENT_MULTIPLIER_PCT,
} from "@/lib/projection/military-retirement";

export const runtime = "nodejs"; // ExcelJS needs the Node runtime (not Edge)

// Live Excel model for the Wealth Projector: an Assumptions sheet feeds a
// formula-driven Projection sheet, so the workbook keeps recalculating when
// the user edits returns, contributions, or service length in Excel/Sheets.
// Stateless and in-memory like the other export routes — nothing is stored.

type LiveModelPayload = {
  grade?: string;
  startYear: number;
  currentAge: number;
  serviceYears: number;
  projectionYears: number;
  /**
   * Optional long-term horizon (e.g. to age 65). When present and larger than
   * projectionYears, the Projection sheet extends to it, so the "Long-term
   * analysis" scope carries into the live Excel model too.
   */
  longTermYears?: number;
  inflationPct: number;
  balances: { tsp: number; ira: number; invest: number; savings: number };
  returnsPct: { tsp: number; ira: number; k401: number; invest: number; savings: number };
  monthly: {
    tspTotal: number; // you + agency while serving
    iraServing: number;
    iraAfter: number;
    iraUntilAge: number;
    k401After: number;
    k401UntilAge: number;
    invServing: number;
    invAfter: number;
    savServing: number;
    savAfter: number;
  };
  /**
   * OPTIONAL: the full report payload the CSV/TXT/PDF builders already
   * receive. When present the Trade space sheet renders the real analysis
   * (stay-in vs get-out with the pension priced in, Roth vs Traditional, IRA
   * placement) instead of the general case. Absent, the sheet still ships —
   * the live formula calculator asks the reader for the two facts this
   * payload cannot carry (High-3 basic pay and years of service) rather than
   * inventing them.
   */
  projection?: ProjectionExport;
  /** OPTIONAL: base64 PNG of the growth chart, embedded pixel-exact. */
  chartPngBase64?: string;
};

// Roomier than the live model alone needs: the optional report payload runs a
// few KB per projected year and an embedded chart PNG is larger again. Still
// bounded — this route is stateless and nothing is stored.
const MAX_BODY_BYTES = 1024 * 1024;
const MAX_CHART_BYTES = 4 * 1024 * 1024;

function num(x: unknown, fallback = 0) {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : fallback;
}
function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
function safeFilePart(x: unknown, fallback: string): string {
  const s = String(x ?? "").replace(/[^A-Za-z0-9._-]/g, "");
  return s.length ? s : fallback;
}

/**
 * Both tax-rate cells open at the SAME value, so the workbook's neutral state
 * is the honest "effectively even" rather than an implied recommendation. It
 * is a seed for a yellow input cell, never a claim about anyone's bracket, and
 * it is overridden whenever the report payload carries real rates.
 */
const NEUTRAL_TAX_RATE_PCT = 22;

/** Shape-check the optional report payload before the engine touches it. */
function asProjectionExport(x: unknown): ProjectionExport | null {
  if (!x || typeof x !== "object") return null;
  const candidate = x as Partial<ProjectionExport>;
  if (!candidate.scenario || typeof candidate.scenario !== "object") return null;
  if (!Array.isArray(candidate.years)) return null;
  if (!candidate.totals || typeof candidate.totals !== "object") return null;
  if (!Array.isArray(candidate.promotions)) return null;
  return candidate as ProjectionExport;
}

function decodeChartPng(x: unknown): Uint8Array | undefined {
  if (typeof x !== "string" || x.length === 0) return undefined;
  const base64 = x.replace(/^data:image\/png;base64,/, "");
  if (base64.length > MAX_CHART_BYTES) return undefined;
  try {
    const bytes = Buffer.from(base64, "base64");
    return bytes.length > 0 ? new Uint8Array(bytes) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * "Build a chart" sheet: copy-paste recipes against the real Projection
 * layout, so the reader gets LIVE charts that move with the yellow inputs
 * instead of a picture that silently goes stale.
 */
function addChartRecipeSheet(wb: ExcelJS.Workbook, lastRow: number) {
  const ws = wb.addWorksheet("Build a chart");
  ws.columns = [{ width: 30 }, { width: 40 }, { width: 68 }];

  let r = 1;
  const heading = (text: string) => {
    const c = ws.getCell(r, 1);
    c.value = text;
    c.font = { bold: true, size: 12 };
    r += 1;
  };
  const note = (text: string) => {
    const c = ws.getCell(r, 1);
    c.value = text;
    c.font = { color: { argb: "FF6B7280" }, size: 10 };
    ws.mergeCells(r, 1, r, 3);
    r += 1;
  };
  const step = (label: string, value: string, why?: string) => {
    ws.getCell(r, 1).value = label;
    const v = ws.getCell(r, 2);
    v.value = value;
    v.font = { bold: true };
    if (why) ws.getCell(r, 3).font = { color: { argb: "FF6B7280" }, size: 10 };
    if (why) ws.getCell(r, 3).value = why;
    r += 1;
  };

  heading("Build a chart from your projection");
  note(
    "Excel builds charts from data you select, and a chart you build stays LIVE — edit any yellow cell on Assumptions and the chart redraws with it. Each recipe below is a range you can paste straight into the Name Box (left of the formula bar) to select it."
  );
  r += 1;

  const recipes: {
    name: string;
    ranges: string;
    chart: string;
    reads: string;
    /** Overrides the Name Box hint when the selection isn't a literal range. */
    selectHint?: string;
  }[] = [
    {
      name: "Net worth over time",
      ranges: `Projection!$A$1:$A$${lastRow},Projection!$I$1:$J$${lastRow}`,
      chart: "Insert > Charts > Line (2-D Line)",
      reads:
        "Two lines: your projected total, and the same money in today's dollars. The gap between them IS inflation — it is the single most useful picture in this workbook.",
    },
    {
      name: "Which account carries it",
      ranges: `Projection!$A$1:$A$${lastRow},Projection!$D$1:$H$${lastRow}`,
      chart: "Insert > Charts > Area > Stacked Area",
      reads:
        "TSP, IRA, 401(k), investments and savings stacked. Shows which account is actually doing the work, and when the civilian accounts overtake the military one.",
    },
    {
      name: "Balance growth per year",
      ranges: `Projection!$A$1:$A$${lastRow},Projection!$I$1:$I$${lastRow}`,
      chart: "Insert > Charts > Column > Clustered Column",
      reads:
        "The same totals as bars. Compounding is easier to see here — the bars barely move early, then climb steeply once growth outruns contributions.",
    },
    {
      name: "Staying in vs getting out",
      ranges: "On the Trade space sheet: the two headline figures and their labels",
      selectHint:
        "Drag across the label column and the value column of that comparison — hold Ctrl to add the second block.",
      chart: "Insert > Charts > Column > Clustered Column",
      reads:
        "A two-bar comparison at the same end age. Read it with the assumptions listed beside it — the answer moves a lot with the tax rate and the retirement age.",
    },
  ];

  for (const rec of recipes) {
    heading(rec.name);
    step(
      "1. Select this range",
      rec.ranges,
      rec.selectHint ?? "Paste into the Name Box and press Enter."
    );
    step("2. Insert the chart", rec.chart, "Google Sheets: Insert > Chart, then pick the type.");
    step("3. What it tells you", "", rec.reads);
    r += 1;
  }

  heading("Notes");
  note(
    "The comma in a range selects two blocks at once (the year column plus the value columns) — that is what puts years on the horizontal axis. In Google Sheets, hold Ctrl while dragging the second block instead."
  );
  note(
    `Data runs from row 2 to row ${lastRow}. If you change the projection horizon and re-export, that last row moves — these recipes are written for THIS workbook.`
  );
  note(
    "Columns on Projection: A Year, B Age, C Serving?, D TSP, E IRA, F 401(k), G Investments, H Savings, I Total, J Today's dollars."
  );
}

// One palette for the whole workbook, so the sheets read as one document.
const EDITABLE_ARGB = "FFFFF3C4"; // amber — the cells the member owns
const COMPUTED_ARGB = "FFEFF3F8"; // pale slate — formula results
const HEADER_ARGB = "FFE2E8F0"; // slate — column and section headings
const MUTED_ARGB = "FF6B7280";
const RULE_ARGB = "FFCBD5E1";

const thinBorder = {
  top: { style: "thin" as const, color: { argb: RULE_ARGB } },
  left: { style: "thin" as const, color: { argb: RULE_ARGB } },
  bottom: { style: "thin" as const, color: { argb: RULE_ARGB } },
  right: { style: "thin" as const, color: { argb: RULE_ARGB } },
};

/** Tab colours group the sheets: inputs, data, analysis, help. */
const TAB_COLOURS: Record<string, string> = {
  Summary: "FF1D4ED8",
  "Read me": "FF94A3B8",
  Assumptions: "FFD97706",
  Projection: "FF0F766E",
  "Trade space": "FF7C3AED",
  "Build a chart": "FF94A3B8",
};

/**
 * Colour legend, appended below whatever a sheet already contains, so "yellow
 * means you can change it" is stated rather than left to be inferred. Appends
 * rather than writing fixed rows, because the sheet owns its own layout.
 */
function appendColourLegend(ws: ExcelJS.Worksheet) {
  let r = ws.rowCount + 2;
  const title = ws.getRow(r).getCell(1);
  title.value = "What the colours mean";
  title.font = { bold: true, size: 12 };
  r += 1;

  const legend: [string, string, string][] = [
    [
      "Change me",
      EDITABLE_ARGB,
      "Yellow cells on the Assumptions tab are yours to edit — everything else recalculates from them.",
    ],
    [
      "Calculated",
      COMPUTED_ARGB,
      "A formula result. Typing over one replaces the formula, so the workbook stops updating.",
    ],
    ["Heading", HEADER_ARGB, "Section titles and column headers."],
  ];

  for (const [label, argb, why] of legend) {
    const row = ws.getRow(r);
    const swatch = row.getCell(1);
    swatch.value = label;
    swatch.fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
    swatch.font = { size: 10, bold: true };
    swatch.alignment = { horizontal: "center" };
    swatch.border = thinBorder;
    const text = row.getCell(2);
    text.value = why;
    text.font = { color: { argb: MUTED_ARGB }, size: 10 };
    r += 1;
  }
}

/** Bold, filled, frozen header row — applied to every tabular sheet. */
function styleHeaderRow(ws: ExcelJS.Worksheet, row = 1) {
  const r = ws.getRow(row);
  r.font = { bold: true };
  r.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_ARGB } };
    cell.border = thinBorder;
    cell.alignment = { vertical: "middle" };
  });
  r.height = 18;
}

export async function POST(req: NextRequest) {
  const lengthHeader = req.headers.get("content-length");
  if (lengthHeader && Number(lengthHeader) > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  let raw: LiveModelPayload;
  try {
    raw = (await req.json()) as LiveModelPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const baseYears = clamp(Math.round(num(raw.projectionYears, 20)), 1, 70);
  const p = {
    grade: safeFilePart(raw.grade, "grade"),
    startYear: clamp(Math.round(num(raw.startYear, new Date().getFullYear())), 2000, 2100),
    currentAge: clamp(Math.round(num(raw.currentAge, 22)), 17, 90),
    serviceYears: clamp(num(raw.serviceYears, 5), 0, 40),
    // Honor an optional longTermYears horizon (long-term scope) when it
    // extends past the on-screen projection horizon.
    projectionYears: clamp(Math.max(baseYears, Math.round(num(raw.longTermYears, 0))), 1, 70),
    inflationPct: clamp(num(raw.inflationPct, 2.5), 0, 15),
    balances: {
      tsp: clamp(num(raw.balances?.tsp), 0, 1e9),
      ira: clamp(num(raw.balances?.ira), 0, 1e9),
      invest: clamp(num(raw.balances?.invest), 0, 1e9),
      savings: clamp(num(raw.balances?.savings), 0, 1e9),
    },
    returnsPct: {
      tsp: clamp(num(raw.returnsPct?.tsp), -20, 30),
      ira: clamp(num(raw.returnsPct?.ira), -20, 30),
      k401: clamp(num(raw.returnsPct?.k401), -20, 30),
      invest: clamp(num(raw.returnsPct?.invest), -20, 30),
      savings: clamp(num(raw.returnsPct?.savings), 0, 20),
    },
    monthly: {
      tspTotal: clamp(num(raw.monthly?.tspTotal), 0, 1e6),
      iraServing: clamp(num(raw.monthly?.iraServing), 0, 1e6),
      iraAfter: clamp(num(raw.monthly?.iraAfter), 0, 1e6),
      iraUntilAge: clamp(Math.round(num(raw.monthly?.iraUntilAge, 65)), 17, 95),
      k401After: clamp(num(raw.monthly?.k401After), 0, 1e6),
      k401UntilAge: clamp(Math.round(num(raw.monthly?.k401UntilAge, 65)), 17, 95),
      invServing: clamp(num(raw.monthly?.invServing), 0, 1e6),
      invAfter: clamp(num(raw.monthly?.invAfter), 0, 1e6),
      savServing: clamp(num(raw.monthly?.savServing), 0, 1e6),
      savAfter: clamp(num(raw.monthly?.savAfter), 0, 1e6),
    },
  };

  // The optional full report. When it is absent nothing is invented: the
  // engine is handed an empty year series, which makes it return null for the
  // two sections that need a basic-pay history, and the Trade space sheet
  // falls back to its live formula calculator for those.
  const report = asProjectionExport(raw.projection);
  const chartPng = decodeChartPng(raw.chartPngBase64);

  const engineInput: ProjectionExport = report ?? {
    generatedOn: new Date().toISOString().slice(0, 10),
    scenario: {
      branchLabel: "",
      track: "",
      grade: p.grade,
      yos: 0,
      currentAge: p.currentAge,
      serviceYears: p.serviceYears,
      projectionYears: p.projectionYears,
      endYear: p.startYear + p.projectionYears,
      tspPct: 0,
      brs: true,
      tspReturnPct: p.returnsPct.tsp,
      invReturnPct: p.returnsPct.invest,
      savApyPct: p.returnsPct.savings,
      iraMonthly: p.monthly.iraServing,
      iraUntilAge: p.monthly.iraUntilAge,
      iraReturnPct: p.returnsPct.ira,
      k401Monthly: p.monthly.k401After,
      k401UntilAge: p.monthly.k401UntilAge,
      k401ReturnPct: p.returnsPct.k401,
      inflationPct: p.inflationPct,
      payRaisePct: 0,
      modelPromotions: false,
    },
    promotions: [],
    // No basic-pay history travels in the live-model payload, so there is
    // none here either. The engine degrades; it does not guess.
    years: [],
    totals: {
      final: 0,
      finalReal: 0,
      atSeparation: null,
      separationYear: null,
      contributed: 0,
      growth: 0,
      agencyMatch: 0,
    },
  };

  let analysis: TradeSpaceAnalysis | null = null;
  try {
    analysis = analyzeTradeSpace(engineInput);
  } catch {
    analysis = null; // a malformed report payload must never break the export
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = "ActivePayOS";
  wb.created = new Date();
  // Cells that ship a formula without a cached value are computed on open, so
  // Google Sheets and LibreOffice populate them too.
  wb.calcProperties.fullCalcOnLoad = true;

  // ----------------------------------------------------------------- Summary
  // Created FIRST so the workbook opens on the big picture. The cells are
  // filled after the Assumptions/Projection sheets exist (their formulas
  // reference those sheets, so the Summary stays live too).
  const summary = wb.addWorksheet("Summary");
  summary.columns = [{ width: 34 }, { width: 18 }, { width: 76 }];


  // ---------------------------------------------------------------- Read me
  const readme = wb.addWorksheet("Read me");
  readme.columns = [{ width: 100 }];
  const readmeLines = [
    "ActivePayOS — Wealth Projector live model",
    "",
    "This workbook recalculates. Change any yellow cell on the Assumptions sheet",
    "(returns, contributions, years serving, inflation) and the Projection sheet",
    "updates instantly — in Excel, Google Sheets, or LibreOffice.",
    "",
    "How it differs from the website's projection:",
    "- The site grows your TSP contribution as promotions raise your base pay;",
    "  this workbook holds the monthly TSP amount flat unless you edit it.",
    "- The site compounds monthly; this workbook compounds yearly, so totals",
    "  will differ slightly.",
    "- IRS contribution limits are not enforced here.",
    "",
    "The 'Serving?' column on the Projection sheet is a formula driven by the",
    "'Years still serving' assumption — while it is 1, the while-serving",
    "contribution amounts apply; after that, the after-service amounts do.",
    "",
    "Sheets in this workbook:",
    "- Summary      headline numbers, live against the Projection sheet.",
    "- Assumptions  every yellow cell you can edit.",
    "- Projection   the year-by-year model. The balance columns carry data bars,",
    "               so the growth curve is visible without leaving the table.",
    "- Trade space  staying in vs getting out, Roth vs Traditional, and where an",
    "               IRA fits — with the military pension priced in. The projected",
    "               total does NOT include the pension (a pension is an income",
    "               stream, not a balance), which is why that figure looks the",
    "               same whether you serve 19 years or 20. Every assumption and",
    "               caveat sits on that sheet beside the numbers it qualifies.",
    "",
    "Educational planning estimate, not financial advice. Verify against your",
    "LES and myPay. activepayos.com",
  ];
  readmeLines.forEach((line, i) => {
    const c = readme.getCell(i + 1, 1);
    c.value = line;
    if (i === 0) c.font = { bold: true, size: 14 };
  });

  // ------------------------------------------------------------ Assumptions
  const a = wb.addWorksheet("Assumptions");
  a.columns = [{ width: 38 }, { width: 14 }, { width: 46 }];
  const yellow: ExcelJS.Fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFFFF3C4" },
  };
  let row = 1;
  const title = (label: string) => {
    const c = a.getCell(row, 1);
    c.value = label;
    c.font = { bold: true, size: 12 };
    row += 1;
  };
  const input = (
    label: string,
    value: number,
    note: string,
    fmt: string = "#,##0.00"
  ): number => {
    a.getCell(row, 1).value = label;
    const cell = a.getCell(row, 2);
    cell.value = value;
    cell.fill = yellow;
    cell.numFmt = fmt;
    a.getCell(row, 3).value = note;
    a.getCell(row, 3).font = { color: { argb: "FF6B7280" }, size: 10 };
    const r = row;
    row += 1;
    return r;
  };

  title("Wealth Projector — assumptions (edit the yellow cells)");
  row += 1;

  title("Timeline");
  const rAge = input("Current age", p.currentAge, "Ages the projection rows.", "0");
  const rServe = input("Years still serving", p.serviceYears, "While serving, the while-serving contribution amounts apply.", "0.0");
  row += 1;

  title("Assumed annual returns (%)");
  const rTspRet = input("TSP (net of fees)", p.returnsPct.tsp, "Blended fund return minus expense ratio.");
  const rIraRet = input("IRA (net of fees)", p.returnsPct.ira, "");
  const rK401Ret = input("Civilian 401(k)", p.returnsPct.k401, "");
  const rInvRet = input("Investment account", p.returnsPct.invest, "");
  const rSavRet = input("Savings APY", p.returnsPct.savings, "");
  const rInfl = input("Inflation", p.inflationPct, "Used only for the Today's-$ column.");
  row += 1;

  title("Monthly contributions ($)");
  const rTspMo = input("TSP while serving (you + agency)", p.monthly.tspTotal, "The site grows this with promotions; here it stays flat unless you edit it.");
  const rIraServ = input("IRA while serving", p.monthly.iraServing, "");
  const rIraAfter = input("IRA after service", p.monthly.iraAfter, "");
  const rIraUntil = input("IRA contributions until age", p.monthly.iraUntilAge, "", "0");
  const rK401Mo = input("401(k) after service (you + match)", p.monthly.k401After, "Starts at separation.");
  const rK401Until = input("401(k) contributions until age", p.monthly.k401UntilAge, "", "0");
  const rInvServ = input("Investments while serving", p.monthly.invServing, "");
  const rInvAfter = input("Investments after service", p.monthly.invAfter, "");
  const rSavServ = input("Savings while serving", p.monthly.savServing, "");
  const rSavAfter = input("Savings after service", p.monthly.savAfter, "");
  row += 1;

  title("Starting balances ($)");
  const rTspBal = input("TSP", p.balances.tsp, "", "#,##0");
  const rIraBal = input("IRA", p.balances.ira, "", "#,##0");
  const rInvBal = input("Investments", p.balances.invest, "", "#,##0");
  const rSavBal = input("Savings", p.balances.savings, "", "#,##0");
  row += 1;

  // ---- Trade space inputs -------------------------------------------------
  // These drive the live half of the Trade space sheet. Seeded from the report
  // payload when it travelled; otherwise they are the two facts the live-model
  // payload cannot carry, asked for rather than invented.
  const pension = analysis?.retirement?.pension ?? null;
  const seedHigh3 = pension?.high3.monthlyBase ?? report?.pension?.high3MonthlyBase ?? 0;
  const seedYos = report ? Math.max(REGULAR_RETIREMENT_YEARS, report.scenario.yos + report.scenario.serviceYears) : REGULAR_RETIREMENT_YEARS;
  const seedMultiplier = RETIREMENT_MULTIPLIER_PCT[report?.scenario.brs === false ? "high3" : "brs"];
  const seedRetireAge = pension?.startAge ?? p.currentAge + Math.round(p.serviceYears);
  const seedRoth = report?.rothTradeoff;

  title("Trade space — military retirement");
  const rHigh3 = input(
    "High-3 monthly basic pay",
    seedHigh3,
    seedHigh3 > 0
      ? "The average of your highest 36 months of basic pay. Allowances are excluded."
      : "Enter the average of your highest 36 months of basic pay — this payload cannot carry it, so nothing is assumed."
  );
  const rStayYos = input("Years of service at retirement", seedYos, `A regular retirement needs ${REGULAR_RETIREMENT_YEARS} years. Below that the pension is $0 — a cliff, not a gradient.`, "0.0");
  const rMult = input("Retired-pay multiplier (% per year of service)", seedMultiplier, "2.0 under the Blended Retirement System, 2.5 under legacy High-3.");
  const rRetAge = input(
    "Age retired pay starts",
    seedRetireAge,
    "Active-duty retired pay begins the month you retire — decades before a 401(k) is penalty-free. Make this line up with the years-of-service cell above.",
    "0"
  );
  const rCola = input("Retired-pay COLA (%/yr)", p.inflationPct, "Retired pay tracks the FULL CPI, so it holds its purchasing power for life.");
  const rSwr = input("Sustainable withdrawal rate (%)", DEFAULT_SAFE_WITHDRAWAL_RATE_PCT, "Used to convert the pension into a nest-egg equivalent, so it sits on the same scale as a balance.");
  const rLife = input("Retired pay assumed through age", DEFAULT_LIFE_EXPECTANCY_AGE, "A planning assumption, not a prediction. Living longer makes the pension worth proportionally more.", "0");
  row += 1;

  title("Trade space — Roth vs Traditional");
  const rTaxNow = input("Marginal tax rate today (%)", seedRoth?.taxRateNowPct ?? NEUTRAL_TAX_RATE_PCT, "What you would pay on the next dollar of income now, federal plus state. Replace with your own rate.");
  const rTaxLater = input("Marginal tax rate at withdrawal (%)", seedRoth?.taxRateAtWithdrawalPct ?? NEUTRAL_TAX_RATE_PCT, "The single most important and least knowable input. Roth wins when this is higher than today's rate.");
  const rRothMo = input("Monthly contribution being compared", seedRoth?.monthlyContribution ?? p.monthly.tspTotal, "The same dollars go in on both paths — that is what makes the comparison fair.");
  const rRothYrs = input("Years contributing", seedRoth?.yearsContributing ?? p.projectionYears, "How long contributions keep arriving before the balance is withdrawn.", "0.0");

  const A = (r: number) => `Assumptions!$B$${r}`;

  // ------------------------------------------------------------- Projection
  const s = wb.addWorksheet("Projection");
  s.columns = [
    { header: "Year", width: 8 },
    { header: "Age", width: 6 },
    { header: "Serving?", width: 9 },
    { header: "TSP", width: 14 },
    { header: "IRA", width: 14 },
    { header: "401(k)", width: 14 },
    { header: "Investments", width: 14 },
    { header: "Savings", width: 14 },
    { header: "Total", width: 15 },
    { header: "Today's $", width: 15 },
  ];
  s.getRow(1).font = { bold: true };
  s.views = [{ state: "frozen", ySplit: 1 }];

  const money = "#,##0";
  // Row 2 = the starting snapshot (year 0).
  const start = s.getRow(2);
  start.getCell(1).value = p.startYear;
  start.getCell(2).value = { formula: `${A(rAge)}` };
  start.getCell(3).value = { formula: `IF(${A(rServe)}>0,1,0)` };
  start.getCell(4).value = { formula: `${A(rTspBal)}` };
  start.getCell(5).value = { formula: `${A(rIraBal)}` };
  start.getCell(6).value = 0;
  start.getCell(7).value = { formula: `${A(rInvBal)}` };
  start.getCell(8).value = { formula: `${A(rSavBal)}` };
  start.getCell(9).value = { formula: "SUM(D2:H2)" };
  start.getCell(10).value = { formula: "I2" };

  for (let i = 1; i <= p.projectionYears; i += 1) {
    const r = i + 2;
    const prev = r - 1;
    const rw = s.getRow(r);
    rw.getCell(1).value = { formula: `A${prev}+1` };
    rw.getCell(2).value = { formula: `B${prev}+1` };
    // Serving through the "years still serving" assumption.
    rw.getCell(3).value = { formula: `IF(ROW()-2<=${A(rServe)},1,0)` };
    rw.getCell(4).value = {
      formula: `ROUND(D${prev}*(1+${A(rTspRet)}/100)+C${r}*12*${A(rTspMo)},2)`,
    };
    rw.getCell(5).value = {
      formula: `ROUND(E${prev}*(1+${A(rIraRet)}/100)+12*IF(C${r}=1,${A(rIraServ)},IF(B${r}<=${A(rIraUntil)},${A(rIraAfter)},0)),2)`,
    };
    rw.getCell(6).value = {
      formula: `ROUND(F${prev}*(1+${A(rK401Ret)}/100)+IF(AND(C${r}=0,B${r}<=${A(rK401Until)}),12*${A(rK401Mo)},0),2)`,
    };
    rw.getCell(7).value = {
      formula: `ROUND(G${prev}*(1+${A(rInvRet)}/100)+12*IF(C${r}=1,${A(rInvServ)},${A(rInvAfter)}),2)`,
    };
    rw.getCell(8).value = {
      formula: `ROUND(H${prev}*(1+${A(rSavRet)}/100)+12*IF(C${r}=1,${A(rSavServ)},${A(rSavAfter)}),2)`,
    };
    rw.getCell(9).value = { formula: `SUM(D${r}:H${r})` };
    rw.getCell(10).value = { formula: `ROUND(I${r}/(1+${A(rInfl)}/100)^(ROW()-2),2)` };
  }
  for (let r = 2; r <= p.projectionYears + 2; r += 1) {
    for (const c of [4, 5, 6, 7, 8, 9, 10]) s.getRow(r).getCell(c).numFmt = money;
  }

  // ---- data bars: the growth curve, visible in-cell -----------------------
  // The five account columns share ONE rule (and therefore one scale), so the
  // bars show the account mix honestly; scaling each column to its own max
  // would draw a $3,000 savings balance the same length as a $900,000 TSP.
  // The Total column gets its own rule because totals dwarf the components.
  // Both anchor at zero rather than at the range's lowest value, so a bar
  // length reads as a balance and not as a distance above the starting one.
  {
    const lastRow = p.projectionYears + 2;
    addDataBars(s, `D2:H${lastRow}`, { min: 0, color: "FF2563EB" });
    addDataBars(s, `I2:I${lastRow}`, { min: 0, color: "FF0D7C6B" });
    addDataBars(s, `J2:J${lastRow}`, { min: 0, color: "FF94A3B8" });
  }

  // ------------------------------------------------- Summary (filled last)
  // Live formulas against the Projection/Assumptions sheets, so the headline
  // numbers recalculate right along with the model.
  {
    const lastRow = p.projectionYears + 2;
    const grey = { color: { argb: "FF6B7280" }, size: 10 } as const;
    let r = 1;
    const t = summary.getCell(r, 1);
    t.value = "ActivePayOS — Wealth Projection Summary";
    t.font = { bold: true, size: 14 };
    r += 1;
    summary.getCell(r, 1).value =
      "Recalculates live — edit the yellow cells on the Assumptions sheet and these numbers update.";
    summary.getCell(r, 1).font = grey;
    r += 2;

    summary.getCell(r, 1).value = "Item";
    summary.getCell(r, 2).value = "Value";
    summary.getCell(r, 3).value = "What it means";
    summary.getRow(r).font = { bold: true };
    r += 1;

    const line = (label: string, value: ExcelJS.CellValue, note: string, fmt?: string) => {
      summary.getCell(r, 1).value = label;
      const cell = summary.getCell(r, 2);
      cell.value = value;
      if (fmt) cell.numFmt = fmt;
      summary.getCell(r, 3).value = note;
      summary.getCell(r, 3).font = grey;
      r += 1;
    };

    line(
      `Projected total (${p.startYear + p.projectionYears})`,
      { formula: `Projection!I${lastRow}` },
      "Everything combined - TSP, IRA, 401(k), investments, and savings - at the end of the horizon, in future (nominal) dollars.",
      money
    );
    line(
      "In today's dollars",
      { formula: `Projection!J${lastRow}` },
      "The same total deflated by the inflation assumption - what it would buy in today's money.",
      money
    );
    line(
      "At separation",
      {
        formula: `IF(${A(rServe)}>0,LOOKUP(2,1/(Projection!$C$2:$C$${lastRow}=1),Projection!$I$2:$I$${lastRow}),"-")`,
      },
      "Your combined balance in the last year still serving - after that, military TSP contributions stop and balances keep compounding.",
      money
    );
    line(
      "Starting balances (total)",
      { formula: `${A(rTspBal)}+${A(rIraBal)}+${A(rInvBal)}+${A(rSavBal)}` },
      "What the accounts already hold today, before any projected growth.",
      money
    );
    line(
      "Years projected",
      { formula: `Projection!A${lastRow}-Projection!A2` },
      "The projection horizon in years, ending at the projected-total year above.",
      "0"
    );
  }

  // ------------------------------------------------------- Trade space
  // Appended before "Build a chart" so the existing Summary-first order holds.
  if (analysis) {
    const lastRow = p.projectionYears + 2;
    const live: LiveTradeSpaceRefs = {
      high3: A(rHigh3),
      stayYos: A(rStayYos),
      multiplierPct: A(rMult),
      retireAge: A(rRetAge),
      colaPct: A(rCola),
      withdrawalPct: A(rSwr),
      lifeAge: A(rLife),
      taxNowPct: A(rTaxNow),
      taxLaterPct: A(rTaxLater),
      rothMonthly: A(rRothMo),
      rothYears: A(rRothYrs),
      returnPct: A(rTspRet),
      projectedTotal: `Projection!$I$${lastRow}`,
      horizonAge: `Projection!$B$${lastRow}`,
    };
    addTradeSpaceSheet(wb, analysis, {
      live,
      chartPng,
      // Without the report payload the tool has no split between the member's
      // own TSP contributions and the agency's, so the "used" figures would
      // read as a confident zero. Left out rather than shown wrong.
      skipTableKeys: report ? [] : ["ira-vs-tsp-room"],
      skipAssumptionKeys: report ? [] : ["tsp-used"],
    });
  }

  // ------------------------------------------------------- Build a chart
  // Excel charts cannot be authored by ExcelJS 4.4 (no chart API), and a
  // pasted image would go stale the moment an assumption is edited. So the
  // workbook teaches the reader to build LIVE charts on their own data: those
  // redraw themselves when the yellow inputs change, and they work in Google
  // Sheets and LibreOffice too, where an embedded PNG is only ever a picture.
  addChartRecipeSheet(wb, p.projectionYears + 2);

  // Colour the tabs and style the header rows once, at the end, so every sheet
  // gets the same treatment however it was built.
  for (const ws of wb.worksheets) {
    const tab = TAB_COLOURS[ws.name];
    if (tab) ws.properties.tabColor = { argb: tab };
    if (ws.name === "Projection") styleHeaderRow(ws);
  }
  const readmeSheet = wb.getWorksheet("Read me");
  if (readmeSheet) {
    readmeSheet.getColumn(2).width = 86;
    appendColourLegend(readmeSheet);
  }

  const buffer = await wb.xlsx.writeBuffer();
  const filename = `activepayos_WealthModel_${p.grade}_${p.startYear + p.projectionYears}.xlsx`;
  const bytes = new Uint8Array(buffer as ArrayBuffer);
  return new NextResponse(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
