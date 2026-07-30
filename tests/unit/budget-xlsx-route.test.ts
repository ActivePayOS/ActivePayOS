// Tests for /api/export-budget's workbook branch: the computed Summary sheet
// leads the template, and the simplified PDF branch still renders.

import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/export-budget/route";

const PAYLOAD = {
  year: 2026,
  grade: "E-5",
  yosLabel: "Over 6",
  zip: "22003",
  withDependents: true,
  receivesBah: true,
  stateOfLegalResidence: "VA",
  basePayMonthly: 4000,
  bahMonthly: 2500,
  basMonthly: 465,
  annualTotal: 83580,
  annualBasePay: 48000,
  annualBah: 30000,
  annualBas: 5580,
};

function request(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/export-budget", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/export-budget (xlsx)", () => {
  it("keeps the invalid-ZIP contract", async () => {
    const res = await POST(request({ ...PAYLOAD, zip: "invalid", format: "csv" }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Invalid ZIP" });
  });

  it("opens on a computed Summary sheet ahead of the template sheets", async () => {
    const res = await POST(request({ ...PAYLOAD, format: "xlsx" }));
    expect(res.status).toBe(200);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await res.arrayBuffer());
    const names = wb.worksheets.map((w) => w.name);
    expect(names[0]).toBe("Summary");
    // Template sheets survive untouched behind it.
    expect(names).toContain("Start Here");
    expect(names).toContain("Budget");

    const summary = wb.getWorksheet("Summary")!;
    expect(String(summary.getCell("A1").value)).toContain("Summary");
    expect(String(summary.getCell("A4").value)).toBe("Item");
    expect(String(summary.getCell("C4").value)).toBe("What it means");
    // First overview line: total monthly pay with its explanation.
    expect(String(summary.getCell("A5").value)).toBe("Total monthly pay");
    expect(String(summary.getCell("B5").value)).toBe("$6,965.00");
    expect(String(summary.getCell("C5").value)).toContain("gross monthly pay");
  });

  it("still renders the PDF (single modern layout) and CSV summary-first", async () => {
    const pdf = await POST(request({ ...PAYLOAD, format: "pdf", pdfLayout: "classic" }));
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get("content-type")).toContain("application/pdf");
    const head = new Uint8Array((await pdf.arrayBuffer()).slice(0, 5));
    expect(String.fromCharCode(...head)).toBe("%PDF-");

    const csv = await POST(request({ ...PAYLOAD, format: "csv" }));
    const text = await csv.text();
    expect(text.indexOf("SUMMARY")).toBeGreaterThan(-1);
    expect(text.indexOf("SUMMARY")).toBeLessThan(text.indexOf("Pay Component"));
    expect(text).toContain("What it is");
  });
});
