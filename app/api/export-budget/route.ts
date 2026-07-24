import path from "node:path";
import fs from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { buildPaySummary } from "@/lib/export/summary";
import { generatePayCsv } from "@/lib/export/csv";
import { generatePayTxt } from "@/lib/export/txt";
import { generatePayPdf, isPdfLayout, PdfLayout } from "@/lib/export/pdf";

export const runtime = "nodejs"; // ExcelJS / pdf-lib need Node runtime (not Edge)

type ExportFormat = "xlsx" | "csv" | "txt" | "pdf";

type ExportPayload = {
  year: number;
  grade: string;
  yosLabel: string;
  zip?: string;
  withDependents: boolean;
  receivesBah?: boolean;
  stateOfLegalResidence?: string;

  // Output selection. Defaults to "xlsx" for backward compatibility.
  format?: ExportFormat;
  pdfLayout?: string; // "classic" | "modern" | "compact"

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
// Restrict any user-supplied value used in a download filename / Content-
// Disposition header to a safe character set (prevents header/filename
// spoofing and invalid-header 500s).
function safeFilePart(x: unknown, fallback: string): string {
  const s = String(x ?? "").replace(/[^A-Za-z0-9._-]/g, "");
  return s.length ? s : fallback;
}

// Reject oversized bodies before parsing (cheap DoS guard on a compute route).
const MAX_BODY_BYTES = 32 * 1024;

function fileResponse(
  body: string | Uint8Array,
  contentType: string,
  filename: string
) {
  let payload: BodyInit;
  if (typeof body === "string") {
    payload = body;
  } else {
    // Copy into a fresh ArrayBuffer-backed array so the type is an
    // unambiguous BodyInit (sidesteps the Uint8Array<ArrayBufferLike> friction).
    const bytes = new Uint8Array(body.length);
    bytes.set(body);
    payload = new Blob([bytes], { type: contentType });
  }
  return new NextResponse(payload, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(req: NextRequest) {
  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Request body too large" }, { status: 413 });
  }

  let body: ExportPayload;
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "Request body too large" }, { status: 413 });
    }
    body = JSON.parse(raw) as ExportPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const year = Math.trunc(num(body.year, 2026));

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
  const stateOfLegalResidence = String(body.stateOfLegalResidence ?? "").trim();

  // ---------------------------------------------------------------------
  // Minimalist exports (CSV / TXT / PDF): just the pay numbers. These skip
  // the Excel template entirely and are generated directly from the inputs.
  // ---------------------------------------------------------------------
  const format: ExportFormat = body.format ?? "xlsx";

  if (format !== "xlsx") {
    const generatedOn = new Date().toISOString().slice(0, 10);
    const summary = buildPaySummary({
      year,
      grade: body.grade ?? "",
      yosLabel: body.yosLabel ?? "",
      zip5,
      receivesBah,
      dependents: !!body.withDependents,
      stateOfLegalResidence,
      baseMonthly: base,
      bahMonthly: bah,
      basMonthly: bas,
      otherMonthly: other,
      generatedOn,
    });

    const loc = receivesBah ? zip5 : "NoBAH";
    const nameBase = `activepayos_Pay_${safeFilePart(loc, "loc")}_${safeFilePart(body.grade, "Pay")}_${year}`;

    try {
      if (format === "csv") {
        return fileResponse(generatePayCsv(summary), "text/csv; charset=utf-8", `${nameBase}.csv`);
      }
      if (format === "txt") {
        return fileResponse(generatePayTxt(summary), "text/plain; charset=utf-8", `${nameBase}.txt`);
      }
      // format === "pdf"
      const layout: PdfLayout = isPdfLayout(body.pdfLayout) ? body.pdfLayout : "classic";
      const pdfBytes = await generatePayPdf(summary, layout);
      return fileResponse(pdfBytes, "application/pdf", `${nameBase}_${layout}.pdf`);
    } catch (err) {
      console.error("[export-budget] file generation failed:", err);
      return NextResponse.json({ error: "Could not generate the export file." }, { status: 500 });
    }
  }

  // Suggested dollars (Hybrid)
  const suggestedHousing = bah * housingTargetPct;
  const suggestedFood = bas * foodTargetPct;
  const suggestedMinSavings = totalIncome * savingsTargetPct;

  // Load template from /public/templates
  const templatePath = path.join(
    process.cwd(),
    "public",
    "templates",
    "activepayos-budget-template.xlsx"
  );

  try {
    await fs.access(templatePath);
  } catch {
    console.error(`[export-budget] budget template not found at: ${templatePath}`);
    return NextResponse.json(
      { error: "Budget template is unavailable." },
      { status: 500 }
    );
  }

  const wb = new ExcelJS.Workbook();

  try {
    // FIX: Use buffer load instead of readFile (prevents ExcelJS "anchors" crash)
    const fileBuffer = await fs.readFile(templatePath);

    // ExcelJS runtime loads this fine; TS types can mismatch across Node/ExcelJS versions.
    const xlsxLoader = wb.xlsx as unknown as {
      load(data: Buffer): Promise<ExcelJS.Workbook>;
    };
    await xlsxLoader.load(fileBuffer);
  } catch (err) {
    console.error("[export-budget] failed to load budget template:", err);
    return NextResponse.json({ error: "Could not build the budget file." }, { status: 500 });
  }

  // Worksheet names in the budget template:
  const start = wb.getWorksheet("Start Here");
  const budget = wb.getWorksheet("Budget");

  if (!start || !budget) {
    console.error(
      `[export-budget] missing sheet(s). Found: ${wb.worksheets.map((w) => w.name).join(", ")}`
    );
    return NextResponse.json({ error: "Could not build the budget file." }, { status: 500 });
  }

  // =========================
  // "Start Here" sheet mapping
  // Inputs (blue) in column B:
  //  B5 Year
  //  B6 Grade
  //  B7 YOS bracket
  //  B8 Duty ZIP
  //  B9 Dependents (TRUE/FALSE)
  //  B10 State of legal residence
  //  B11 State tax % (optional rough estimate)
  //  B12 TSP %
  //
  // Monthly Pay (green/blue) in column E:
  //  E5 Base
  //  E6 BAH
  //  E7 BAS
  //  E8 Other income
  //  E9 Total monthly income
  //
  // Hybrid target % (blue) in column H:
  //  H5 Housing target % of BAH
  //  H6 Food target % of BAS
  //  H7 Minimum savings rate
  //
  // Suggested $ (green) in column H:
  //  H9 Suggested Housing Budget
  //  H10 Suggested Food Budget
  //  H11 Suggested Minimum Savings
  // =========================

  try {
  start.getCell("B5").value = year;
  start.getCell("B6").value = body.grade ?? "";
  start.getCell("B7").value = body.yosLabel ?? "";
  start.getCell("B8").value = receivesBah ? zip5 : "No BAH / barracks";
  start.getCell("B9").value = body.withDependents ? "TRUE" : "FALSE";
  start.getCell("B10").value = stateOfLegalResidence || "Not selected";
  start.getCell("B11").value = stateTaxPct; // decimal
  start.getCell("B12").value = tspPct;      // decimal

  start.getCell("E5").value = base;
  start.getCell("E6").value = bah;
  start.getCell("E7").value = bas;
  start.getCell("E8").value = other;
  start.getCell("E9").value = totalIncome;

  start.getCell("H5").value = housingTargetPct;
  start.getCell("H6").value = foodTargetPct;
  start.getCell("H7").value = savingsTargetPct;

  start.getCell("H9").value = suggestedHousing;
  start.getCell("H10").value = suggestedFood;
  start.getCell("H11").value = suggestedMinSavings;

  // =========================
  // "Budget" tab mapping
  // Column C = Planned, Column D = Actual
  //
  // Income row:
  //  C6 = Income (planned)
  //
  // Savings rows:
  //  C45 = TSP (auto from %)
  //  C48 = Emergency fund
  //
  // NOTE: The template has no dedicated Housing or Groceries row, so we only
  // set the income + savings rows here. Housing/Food appear on "Start Here" as
  // suggested targets.
  // =========================

  budget.getCell("C6").value = totalIncome;

  // Put suggested minimum savings into Emergency Fund by default (user can re-allocate)
  // TSP is "auto from %" in your sheet-so we do NOT overwrite C45 unless you want.
  budget.getCell("C48").value = suggestedMinSavings;

  // Write output
  const out = await wb.xlsx.writeBuffer();
  const filenameLocation = safeFilePart(receivesBah ? zip5 : "NoBAH", "loc");
  const filename = `activepayos_Budget_${filenameLocation}_${safeFilePart(body.grade, "Pay")}_${year}.xlsx`;

  return new NextResponse(out, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
  } catch (err) {
    console.error("[export-budget] failed to populate/write budget workbook:", err);
    return NextResponse.json({ error: "Could not build the budget file." }, { status: 500 });
  }
}
