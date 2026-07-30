// Tests for the cross-tool report bundle (lib/export/bundle.ts).

import { describe, expect, it } from "vitest";
import {
  availabilityForSections,
  buildBundleData,
  buildBudgetExportFromSaved,
  generateBundleCsv,
  generateBundlePdf,
  generateBundleTxt,
  paySummaryFromTransfer,
  type BundleData,
} from "@/lib/export/bundle";
import type { PayTransfer } from "@/lib/budget/transfer";
import type { ProjectionExport } from "@/lib/export/projection";

const TRANSFER: PayTransfer = {
  v: 1,
  generatedOn: "2026-07-21",
  meta: {
    year: 2026,
    grade: "E-5",
    yosLabel: "Over 6",
    location: "22003",
    dependents: true,
    stateOfLegalResidence: "VA",
    receivesBah: true,
  },
  income: { base: 4000, bah: 2500, bas: 465, specials: [{ label: "Sea pay", monthly: 100 }] },
  deductions: {
    federal: 300,
    state: 100,
    fica: 306,
    sgli: 26,
    tsp: 200,
    tspPct: 0.05,
    tspType: "traditional",
  },
  grossMonthly: 7065,
  takeHomeMonthly: 6133,
};

const PROJECTION: ProjectionExport = {
  generatedOn: "2026-07-30",
  scenario: {
    branchLabel: "Marine Corps",
    track: "enlisted",
    grade: "E-5",
    yos: 6,
    currentAge: 22,
    serviceYears: 5,
    projectionYears: 10,
    endYear: 2036,
    tspPct: 0.05,
    brs: true,
    tspReturnPct: 9.7,
    invReturnPct: 10,
    savApyPct: 3.8,
    inflationPct: 2.5,
    payRaisePct: 2,
    modelPromotions: true,
  },
  promotions: [],
  years: [
    {
      year: 2027,
      age: 23,
      serving: true,
      grade: "E-5",
      basePayMonthly: 4110,
      tsp: 10431,
      ira: 0,
      k401: 0,
      invest: 2354,
      savings: 3907,
      total: 16693,
      realTotal: 16286,
    },
  ],
  totals: {
    final: 16693,
    finalReal: 16286,
    atSeparation: null,
    separationYear: null,
    contributed: 12000,
    growth: 4693,
    agencyMatch: 900,
  },
};

describe("paySummaryFromTransfer", () => {
  it("rebuilds the Pay Calculator's summary from a stored transfer", () => {
    const s = paySummaryFromTransfer(TRANSFER, "2026-07-30");
    expect(s.grade).toBe("E-5");
    expect(s.location).toBe("22003");
    expect(s.total.monthly).toBe(7065);
    expect(s.lines.map((l) => l.label)).toContain("Other Income");
    expect(s.generatedOn).toBe("2026-07-30");
  });
});

describe("buildBudgetExportFromSaved", () => {
  const saved = {
    income: [
      { id: "inc-1", label: "Base Pay", amount: 4000 },
      { id: "inc-2", label: "BAH", amount: 2100 },
      { id: "inc-3", label: "Empty", amount: 0 },
    ],
    expenses: [
      { id: "exp-1", label: "Housing", amount: 1800 },
      { id: "exp-2", label: "Groceries", amount: 600 },
    ],
    tspPct: 0.05,
    tspBaseId: "inc-1",
    iraEnabled: true,
    iraMonthly: 250,
    iraType: "roth" as const,
  };

  it("mirrors the on-page export: rows plus synthesized TSP and IRA outflows", () => {
    const b = buildBudgetExportFromSaved(saved, "2026-07-30")!;
    expect(b.totalIncome).toBe(6100);
    expect(b.expenses.map((e) => e.label)).toEqual([
      "Housing",
      "Groceries",
      "TSP (5%)",
      "IRA (Roth)",
    ]);
    expect(b.totalExpense).toBe(1800 + 600 + 200 + 250);
    expect(b.leftover).toBe(6100 - 2850);
    expect(b.generatedOn).toBe("2026-07-30");
  });

  it("drops the TSP row when the panel is off and IRA when disabled", () => {
    const b = buildBudgetExportFromSaved(
      { ...saved, showTspPanel: false, iraEnabled: false },
      "2026-07-30"
    )!;
    expect(b.expenses.map((e) => e.label)).toEqual(["Housing", "Groceries"]);
  });

  it("returns null for an empty budget", () => {
    expect(buildBudgetExportFromSaved({ income: [], expenses: [] }, "2026-07-30")).toBeNull();
  });
});

describe("storage-derived helpers outside the browser", () => {
  it("availabilityForSections reports all three tools unavailable with hints", () => {
    const sections = availabilityForSections();
    expect(sections.map((s) => s.id)).toEqual(["pay", "budget", "projection"]);
    for (const s of sections) {
      expect(s.available).toBe(false);
      expect(s.hint).toBeTruthy();
    }
  });

  it("buildBundleData keeps live data and reports no staleness", () => {
    const pay = paySummaryFromTransfer(TRANSFER, "2026-07-30");
    const { data, staleness } = buildBundleData({ pay });
    expect(data.pay).toBe(pay);
    expect(data.budget).toBeUndefined();
    expect(data.projection).toBeUndefined();
    expect(staleness).toEqual({});
  });
});

describe("bundle serializers", () => {
  const data: BundleData = {
    pay: paySummaryFromTransfer(TRANSFER, "2026-07-30"),
    projection: PROJECTION,
  };

  it("CSV: grand REPORT SUMMARY first, then full reports in tool order", () => {
    const csv = generateBundleCsv(data, { projection: "Projection from the snapshot saved 2026-07-28." });
    expect(csv.indexOf("ActivePayOS Combined Report")).toBe(0);
    expect(csv).toContain("Includes,\"Pay Calculator, Wealth Projector\"");
    const summaryAt = csv.indexOf("REPORT SUMMARY");
    const payAt = csv.indexOf("PAY CALCULATOR - FULL REPORT");
    const projAt = csv.indexOf("WEALTH PROJECTOR - FULL REPORT");
    expect(summaryAt).toBeGreaterThan(-1);
    expect(summaryAt).toBeLessThan(payAt);
    expect(payAt).toBeLessThan(projAt);
    expect(csv).toContain("Projection from the snapshot saved 2026-07-28.");
    expect(csv).not.toContain("\r\n");
  });

  it("TXT: grand summary with per-tool headings and full detail", () => {
    const txt = generateBundleTxt(data);
    expect(txt.indexOf("REPORT SUMMARY")).toBeLessThan(txt.indexOf("PAY CALCULATOR - FULL REPORT"));
    expect(txt).toContain("--- Pay Calculator ---");
    expect(txt).toContain("--- Wealth Projector ---");
    expect(txt).toContain("ACTIVEPAYOS WEALTH PROJECTION");
  });

  it("PDF: merges a cover page plus each tool's own PDF", async () => {
    const bytes = await generateBundlePdf(data);
    expect(bytes.length).toBeGreaterThan(1000);
    const head = String.fromCharCode(...bytes.slice(0, 5));
    expect(head).toBe("%PDF-");
  });
});
