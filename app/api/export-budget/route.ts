import path from "node:path";
import fs from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";

export const runtime = "nodejs"; // ExcelJS needs Node runtime (not Edge)

type ExportPayload = {
  year: number;
  grade: string;
  yosLabel: string;
  zip?: string;
  withDependents: boolean;
  receivesBah?: boolean;
  stateOfLegalResidence?: string;

  basePayMonthly: number;
  bahMonthly: number;
  basMonthly: number;
  otherIncomeMonthly?: number;

  housingTargetPct?: number; // 1.0 = 100%
  foodTargetPct?: number;    // 1.0 = 100%
  savingsTargetPct?: number; // 0.20 = 20%
  tspPct?: number;           // 0.10 = 10%
  stateTaxPct?: number;      // 0.05 = 5%

  annualTotal: number;
  annualBasePay: number;
  annualBah: number;
  annualBas: number;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
function num(x: unknown, fallback = 0) {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : fallback;
}

export async function POST(req: NextRequest) {
  let body: ExportPayload;
  try {
    body = (await req.json()) as ExportPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const receivesBah = body.receivesBah !== false;
  const zip5 = String(body.zip ?? "").trim().match(/^(\d{5})(?:-\d{4})?$/)?.[1];
  if (receivesBah && !zip5) {
    return NextResponse.json({ error: "Invalid ZIP" }, { status: 400 });
  }

  const base = num(body.basePayMonthly);
  const bah = receivesBah ? num(body.bahMonthly) : 0;
  const bas = num(body.basMonthly);
  const other = num(body.otherIncomeMonthly ?? 0);

  const totalIncome = base + bah + bas + other;

  const housingTargetPct = clamp(num(body.housingTargetPct ?? 1.0), 0, 2);
  const foodTargetPct = clamp(num(body.foodTargetPct ?? 1.0), 0, 2);
  const savingsTargetPct = clamp(num(body.savingsTargetPct ?? 0.20), 0, 0.9);
  const tspPct = clamp(num(body.tspPct ?? 0.10), 0, 0.92);
  const stateTaxPct = clamp(num(body.stateTaxPct ?? 0), 0, 0.2);

  // Suggested dollars (Hybrid)
  const suggestedHousing = bah * housingTargetPct;
  const suggestedFood = bas * foodTargetPct;
  const suggestedMinSavings = totalIncome * savingsTargetPct;

  // Load template from /public/templates
  const templatePath = path.join(
    process.cwd(),
    "public",
    "templates",
    "officeros-budget-template-lite.xlsx"
    );

  try {
    await fs.access(templatePath);
  } catch {
    return NextResponse.json(
      { error: `Template not found at: ${templatePath}` },
      { status: 500 }
    );
  }

  const wb = new ExcelJS.Workbook();

    // FIX: Use buffer load instead of readFile (prevents ExcelJS "anchors" crash)
  const fileBuffer = await fs.readFile(templatePath);

  // ExcelJS runtime loads this fine; TS types can mismatch across Node/ExcelJS versions.
  const xlsxLoader = wb.xlsx as unknown as {
    load(data: Buffer): Promise<ExcelJS.Workbook>;
  };
  await xlsxLoader.load(fileBuffer);

  // Sheet names from your screenshots:
  const start = wb.getWorksheet("Start Here");
  const budget = wb.getWorksheet("Budget");

  if (!start || !budget) {
    return NextResponse.json(
      { error: `Missing sheet(s). Found: ${wb.worksheets.map(w => w.name).join(", ")}` },
      { status: 500 }
    );
  }

  // =========================
  // Start Here mapping (from your screenshot)
  // Inputs (blue) in column B:
  //  B5 Year
  //  B6 Grade
  //  B7 YOS bracket
  //  B8 Duty ZIP
  //  B9 Dependents (TRUE/FALSE)
  //  B10 State tax %
  //  B11 TSP %
  //
  // Monthly Pay (green/blue) in column E:
  //  E5 Base
  //  E6 BAH
  //  E7 BAS
  //  E8 Other income
  //  E9 Total monthly income
  //
  // Hybrid target % (blue) in column I:
  //  I5 Housing target % of BAH
  //  I6 Food target % of BAS
  //  I7 Minimum savings rate
  //
  // Suggested $ (green) in column I:
  //  I9 Suggested Housing Budget
  //  I10 Suggested Food Budget
  //  I11 Suggested Minimum Savings
  // =========================

  start.getCell("B5").value = body.year ?? 2026;
  start.getCell("B6").value = body.grade ?? "";
  start.getCell("B7").value = body.yosLabel ?? "";
  start.getCell("B8").value = receivesBah ? zip5 : "No BAH / barracks";
  start.getCell("B9").value = body.withDependents ? "TRUE" : "FALSE";
  start.getCell("B10").value = stateTaxPct; // decimal
  start.getCell("B11").value = tspPct;      // decimal

  start.getCell("E5").value = base;
  start.getCell("E6").value = bah;
  start.getCell("E7").value = bas;
  start.getCell("E8").value = other;
  start.getCell("E9").value = totalIncome;

  start.getCell("I5").value = housingTargetPct;
  start.getCell("I6").value = foodTargetPct;
  start.getCell("I7").value = savingsTargetPct;

  start.getCell("I9").value = suggestedHousing;
  start.getCell("I10").value = suggestedFood;
  start.getCell("I11").value = suggestedMinSavings;

  // =========================
  // Budget tab mapping (from your screenshot)
  // Column C = Planned, Column D = Actual
  //
  // Income row:
  //  C6 = Income (planned)
  //
  // Savings rows:
  //  C45 = TSP (auto from %)
  //  C48 = Emergency fund
  //
  // NOTE: You currently do NOT have a Housing or Groceries row visible in the screenshot.
  // So we'll *only* set income + savings rows safely.
  // Housing/Food are already shown on Start Here as suggested targets.
  // =========================

  budget.getCell("C6").value = totalIncome;

  // Put suggested minimum savings into Emergency Fund by default (user can re-allocate)
  // TSP is "auto from %" in your sheet-so we do NOT overwrite C45 unless you want.
  budget.getCell("C48").value = suggestedMinSavings;

  // Write output
  const out = await wb.xlsx.writeBuffer();
  const filenameLocation = receivesBah ? zip5 : "NoBAH";
  const filename = `activepayos_Budget_${filenameLocation}_${body.grade ?? "Pay"}_${body.year ?? 2026}.xlsx`;

  return new NextResponse(out, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
