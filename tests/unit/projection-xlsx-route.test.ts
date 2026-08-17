// Tests for the live-Excel projection route (previously zero coverage).
// Calls the POST handler directly with real Request objects — no server.

import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/export-projection-xlsx/route";
import type { ProjectionExport } from "@/lib/export/projection";

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

/** A career the trade-space engine can actually analyze (16 of 20 years). */
const REPORT: ProjectionExport = (() => {
  const years: ProjectionExport["years"] = [];
  let tsp = 50000;
  for (let i = 0; i < 25; i += 1) {
    const serving = i < 4;
    tsp = tsp * 1.07 + (serving ? 9000 : 9600);
    years.push({
      year: 2027 + i,
      age: 33 + i,
      serving,
      grade: "E-6",
      basePayMonthly: serving ? 5000 * Math.pow(1.03, i) : 0,
      tsp,
      ira: 0,
      k401: 0,
      invest: 0,
      savings: 0,
      total: tsp,
      realTotal: tsp / Math.pow(1.025, i + 1),
    });
  }
  return {
    generatedOn: "2026-08-17",
    scenario: {
      branchLabel: "Army",
      track: "enlisted",
      grade: "E-6",
      yos: 12,
      currentAge: 32,
      serviceYears: 4,
      projectionYears: 25,
      endYear: 2051,
      tspPct: 0.05,
      brs: true,
      tspReturnPct: 7,
      invReturnPct: 7,
      savApyPct: 3,
      iraMonthly: 500,
      iraUntilAge: 60,
      iraReturnPct: 7,
      inflationPct: 2.5,
      payRaisePct: 3,
      modelPromotions: true,
    },
    promotions: [],
    years,
    totals: {
      final: years[24].total,
      finalReal: years[24].realTotal,
      atSeparation: years[3].total,
      separationYear: 2030,
      contributed: 280000,
      growth: 500000,
      agencyMatch: 40000,
      employeeTsp: 60000,
    },
    rothTradeoff: {
      monthlyContribution: 500,
      yearsContributing: 20,
      yearsToWithdrawal: 30,
      annualReturnPct: 7,
      taxRateNowPct: 12,
      taxRateAtWithdrawalPct: 22,
      preTaxBalance: 400000,
      taxPaidUpFront: 20000,
      deferredTaxBill: 88000,
      rothAfterTax: 400000,
      tradAfterTax: 312000,
      winner: "roth",
      advantage: 40000,
    },
  };
})();

/**
 * ExcelJS's reader keeps the parsed rules on the worksheet model rather than
 * on its public type, so reach for them there.
 */
function conditionalFormattings(ws: ExcelJS.Worksheet): { ref: string; rules: { type: string }[] }[] {
  return (ws as unknown as { conditionalFormattings?: { ref: string; rules: { type: string }[] }[] })
    .conditionalFormattings ?? [];
}

function textOf(ws: ExcelJS.Worksheet): string {
  const out: string[] = [];
  ws.eachRow({ includeEmpty: false }, (_row, n) => {
    for (let c = 1; c <= 4; c += 1) {
      const v = ws.getCell(n, c).value;
      if (typeof v === "string") out.push(v);
    }
  });
  return out.join("\n");
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
    // Summary stays first; Trade space and the chart recipes are appended so
    // nothing else moves.
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      "Summary",
      "Read me",
      "Assumptions",
      "Projection",
      "Trade space",
      "Build a chart",
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

// --------------------------------------------------------- visuals in Excel ---

describe("workbook visuals", () => {
  it("puts data bars on the year-by-year balance columns and they survive a re-read", async () => {
    const res = await POST(request(PAYLOAD));
    const wb = await loadWorkbook(res);
    const proj = wb.getWorksheet("Projection")!;
    const cf = conditionalFormattings(proj);

    // Accounts share ONE rule (and one scale); Total and Today's-$ get their own.
    const refs = cf.map((c) => c.ref);
    expect(refs).toContain("D2:H12");
    expect(refs).toContain("I2:I12");
    expect(refs).toContain("J2:J12");
    for (const entry of cf) {
      expect(entry.rules.map((r) => r.type)).toContain("dataBar");
    }
  });

  it("writes valid dataBar OOXML — no gradient, no dangling x14 id, anchored at zero", async () => {
    const res = await POST(request(PAYLOAD));
    const zip = await JSZip.loadAsync(await res.arrayBuffer());
    const xml = (await zip.file("xl/worksheets/sheet4.xml")!.async("string")) ?? "";

    expect(xml).toContain('<cfRule type="dataBar"');
    expect(xml).toContain('<cfvo type="num" val="0"/>');
    // gradient:true would leave an empty <x14:id/> pointing at a rule that was
    // never written, and silently drop every x14-only knob.
    expect(xml).toContain('gradient="0"');
    expect(xml).not.toMatch(/<x14:id\/>|<x14:id><\/x14:id>/);
    expect(xml).toMatch(/<x14:id>\{[0-9A-F-]{36}\}<\/x14:id>/i);

    // Formula-only cells are computed on open in Sheets/LibreOffice too.
    const workbookXml = (await zip.file("xl/workbook.xml")!.async("string")) ?? "";
    expect(workbookXml).toContain('fullCalcOnLoad="1"');
  });

  it("keeps the live formulas on the Projection sheet intact", async () => {
    const res = await POST(request(PAYLOAD));
    const wb = await loadWorkbook(res);
    const proj = wb.getWorksheet("Projection")!;
    expect((proj.getCell("I12").value as { formula?: string })?.formula).toBe("SUM(D12:H12)");
    expect((proj.getCell("D12").value as { formula?: string })?.formula).toContain("Assumptions!$B$");
  });
});

describe("Trade space sheet", () => {
  it("ships without a report payload, asking for what it cannot know", async () => {
    const res = await POST(request(PAYLOAD));
    const wb = await loadWorkbook(res);
    const ts = wb.getWorksheet("Trade space")!;
    const text = textOf(ts);

    expect(text).toContain("Trade space analysis");
    expect(text).toContain("Where an IRA fits");
    expect(text).toContain("Roth vs Traditional");
    expect(text).toContain("Live trade-space calculator");
    // The two facts the live-model payload cannot carry are asked for, and the
    // figures that would need them are not invented.
    const assumptions = wb.getWorksheet("Assumptions")!;
    expect(textOf(assumptions)).toContain("High-3 monthly basic pay");
    expect(text).not.toContain("Used in this scenario");

    // Assumptions and caveats travel with the numbers.
    expect(text).toContain("Assumptions behind every figure above");
    expect(text).toContain("Caveats — things that change the answer");
  });

  it("renders the full analysis when the report payload travels with it", async () => {
    const res = await POST(request({ ...PAYLOAD, projection: REPORT }));
    expect(res.status).toBe(200);
    const wb = await loadWorkbook(res);
    const ts = wb.getWorksheet("Trade space")!;
    const text = textOf(ts);

    expect(text).toContain("Staying in vs getting out");
    expect(text).toContain("Military retirement");
    expect(text).toContain("Total position at the end of the projection");
    // The pension is priced in, which is the entire point of the comparison.
    expect(text).toContain("Nest-egg equivalent of the pension");
    // In-cell block bars beside the headline comparison.
    expect(text).toContain("█");
  });

  it("gives paired columns ONE explicit numeric scale, not per-column auto-scaling", async () => {
    const res = await POST(request({ ...PAYLOAD, projection: REPORT }));
    const wb = await loadWorkbook(res);
    const ts = wb.getWorksheet("Trade space")!;
    const cf = conditionalFormattings(ts);
    expect(cf.length).toBeGreaterThan(0);

    // The stay/leave columns are formatted by a single multi-range rule.
    const shared = cf.find((c) => c.ref.includes(" "));
    expect(shared).toBeTruthy();

    const zip = await JSZip.loadAsync(
      await (await POST(request({ ...PAYLOAD, projection: REPORT }))).arrayBuffer()
    );
    const xml = (await zip.file("xl/worksheets/sheet5.xml")!.async("string")) ?? "";
    // Both bounds are explicit numbers, so the two columns cannot auto-scale
    // independently and misrepresent the comparison.
    expect(xml).toMatch(/<cfvo type="num" val="0"\/><cfvo type="num" val="[\d.]+"\/>/);
    expect(xml).not.toMatch(/<x14:id\/>/);
  });

  it("embeds a chart PNG when one is supplied, and degrades quietly when it is junk", async () => {
    // 1x1 transparent PNG.
    const png =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const withChart = await POST(request({ ...PAYLOAD, chartPngBase64: png }));
    const zip = await JSZip.loadAsync(await withChart.arrayBuffer());
    expect(Object.keys(zip.files).some((f) => f.startsWith("xl/media/"))).toBe(true);

    const junk = await POST(request({ ...PAYLOAD, chartPngBase64: "not-a-png" }));
    expect(junk.status).toBe(200);
    const junkZip = await JSZip.loadAsync(await junk.arrayBuffer());
    expect(Object.keys(junkZip.files).some((f) => f.startsWith("xl/media/"))).toBe(false);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await (await POST(request({ ...PAYLOAD, chartPngBase64: "not-a-png" }))).arrayBuffer());
    expect(wb.getWorksheet("Trade space")).toBeTruthy();
  });

  it("never breaks the export on a malformed report payload", async () => {
    for (const bad of [{ nope: 1 }, { scenario: {}, years: "no", totals: {}, promotions: [] }, null]) {
      const res = await POST(request({ ...PAYLOAD, projection: bad }));
      expect(res.status).toBe(200);
      const wb = await loadWorkbook(res);
      expect(wb.getWorksheet("Trade space")).toBeTruthy();
    }
  });
});
