import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";

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
};

const MAX_BODY_BYTES = 32 * 1024;

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

  const p = {
    grade: safeFilePart(raw.grade, "grade"),
    startYear: clamp(Math.round(num(raw.startYear, new Date().getFullYear())), 2000, 2100),
    currentAge: clamp(Math.round(num(raw.currentAge, 22)), 17, 90),
    serviceYears: clamp(num(raw.serviceYears, 5), 0, 40),
    projectionYears: clamp(Math.round(num(raw.projectionYears, 20)), 1, 70),
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

  const wb = new ExcelJS.Workbook();
  wb.creator = "ActivePayOS";
  wb.created = new Date();

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
