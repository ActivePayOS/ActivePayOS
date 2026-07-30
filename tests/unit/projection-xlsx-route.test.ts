// Tests for the live-Excel projection route (previously zero coverage).
// Calls the POST handler directly with real Request objects — no server.

import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/export-projection-xlsx/route";

const PAYLOAD = {
  grade: "E-5",
  startYear: 2026,
  currentAge: 22,
  serviceYears: 5,
  projectionYears: 10,
  inflationPct: 2.5,
  balances: { tsp: 10000, ira: 0, invest: 2000, savings: 3000 },
  returnsPct: { tsp: 9.7, ira: 9, k401: 9, invest: 10, savings: 3.8 },
  monthly: {
    tspTotal: 400,
    iraServing: 0,
    iraAfter: 0,
    iraUntilAge: 65,
    k401After: 500,
    k401UntilAge: 65,
    invServing: 100,
    invAfter: 200,
    savServing: 100,
    savAfter: 100,
  },
};

function request(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/export-projection-xlsx", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function loadWorkbook(res: Response): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await res.arrayBuffer());
  return wb;
}

describe("POST /api/export-projection-xlsx", () => {
  it("rejects invalid JSON", async () => {
    const res = await POST(
      new NextRequest("http://localhost/api/export-projection-xlsx", {
        method: "POST",
        body: "{nope",
      })
    );
    expect(res.status).toBe(400);
  });

  it("builds a workbook that opens on a live Summary sheet", async () => {
    const res = await POST(request(PAYLOAD));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("spreadsheetml");

    const wb = await loadWorkbook(res);
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      "Summary",
      "Read me",
      "Assumptions",
      "Projection",
    ]);

    const summary = wb.getWorksheet("Summary")!;
    expect(String(summary.getCell("A1").value)).toContain("Summary");
    // Headline cells are formulas against the Projection sheet (stay live).
    const projected = summary.getCell("B5").value as { formula?: string };
    expect(projected?.formula).toBe("Projection!I12"); // 10 years -> last row 12
    // What-it-means notes are threaded beside every value.
    expect(String(summary.getCell("C5").value)).toContain("Everything combined");

    // The projection table still runs the requested horizon.
    const proj = wb.getWorksheet("Projection")!;
    expect(proj.getCell("A2").value).toBe(2026);
    expect((proj.getCell("A12").value as { formula?: string })?.formula).toBe("A11+1");
  });

  it("honors longTermYears when it extends the horizon", async () => {
    const res = await POST(request({ ...PAYLOAD, longTermYears: 43 }));
    const wb = await loadWorkbook(res);
    const proj = wb.getWorksheet("Projection")!;
    // 43 rows of projection -> last data row is 45.
    expect(proj.getCell("A45").value).toBeTruthy();
    const summary = wb.getWorksheet("Summary")!;
    expect((summary.getCell("B5").value as { formula?: string })?.formula).toBe("Projection!I45");
    expect(String(summary.getCell("A5").value)).toContain("2069");
  });

  it("ignores a smaller longTermYears (never truncates the on-screen horizon)", async () => {
    const res = await POST(request({ ...PAYLOAD, longTermYears: 3 }));
    const wb = await loadWorkbook(res);
    const summary = wb.getWorksheet("Summary")!;
    expect((summary.getCell("B5").value as { formula?: string })?.formula).toBe("Projection!I12");
  });
});
