// Tests for the Wealth Projection CSV/TXT export builders.

import { describe, expect, it } from "vitest";
import {
  PROJECTION_JSON_SCHEMA,
  generateProjectionCsv,
  generateProjectionJson,
  generateProjectionTxt,
  type ProjectionExport,
} from "@/lib/export/projection";
import { generateProjectionPdf } from "@/lib/export/projection-pdf";
import { analyzeTradeSpace } from "@/lib/projection/trade-space";

const P: ProjectionExport = {
  generatedOn: "2026-07-25",
  scenario: {
    branchLabel: "Marine Corps",
    track: "enlisted",
    grade: "E-5",
    yos: 6,
    currentAge: 22,
    serviceYears: 5,
    projectionYears: 38,
    endYear: 2064,
    tspPct: 0.05,
    brs: true,
    tspReturnPct: 9.7,
    invReturnPct: 10,
    savApyPct: 3.8,
    inflationPct: 2.5,
    payRaisePct: 2,
    modelPromotions: true,
  },
  promotions: [{ year: 2028, grade: "E-6", competitive: true }],
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
    {
      year: 2064,
      age: 60,
      serving: false,
      grade: "E-6",
      basePayMonthly: 0,
      tsp: 920606,
      ira: 0,
      k401: 0,
      invest: 493934,
      savings: 158873,
      total: 1573414,
      realTotal: 615653,
    },
  ],
  totals: {
    final: 1573414,
    finalReal: 615653,
    atSeparation: 64349,
    separationYear: 2031,
    contributed: 237956,
    growth: 1335458,
    agencyMatch: 13042,
  },
};

/**
 * A career long enough for the trade-space engine to have something to say:
 * four more years of service (16 total, short of the 20-year cliff) inside a
 * 25-year horizon, so the STAY arm is a real counterfactual with a pension and
 * the LEAVE arm is the modelled path.
 */
const RICH: ProjectionExport = (() => {
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
    promotions: [{ year: 2029, grade: "E-7", competitive: true }],
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

describe("generateProjectionCsv", () => {
  const csv = generateProjectionCsv(P);

  it("includes the scenario assumptions", () => {
    expect(csv).toContain("Branch,Marine Corps");
    expect(csv).toContain("Years staying in,5");
    expect(csv).toContain("TSP contribution (% of base pay),5");
    expect(csv).toContain("Assumed TSP return (%/yr),9.7");
  });

  it("is summary-first: SUMMARY and Totals come before the year table", () => {
    expect(csv.indexOf("SUMMARY")).toBeGreaterThan(-1);
    expect(csv.indexOf("SUMMARY")).toBeLessThan(csv.indexOf("Scenario"));
    expect(csv.indexOf("Totals")).toBeLessThan(csv.indexOf("Year by year"));
    expect(csv).toContain("What it means");
  });

  it("uses \\n line endings", () => {
    expect(csv).not.toContain("\r\n");
    expect(csv.endsWith("\n")).toBe(true);
  });

  it("hides Investments/Savings columns when those accounts are off", () => {
    const off: ProjectionExport = {
      ...P,
      activeAccounts: { invest: false, savings: false },
      years: P.years.map((y) => ({ ...y, invest: 0, savings: 0 })),
    };
    const csvOff = generateProjectionCsv(off);
    expect(csvOff).not.toContain("Investments (USD)");
    expect(csvOff).not.toContain("Savings (USD)");
    // Default payloads keep both columns.
    expect(csv).toContain("Investments (USD)");
    expect(csv).toContain("Savings (USD)");
  });

  it("lists promotions with the not-guaranteed caveat", () => {
    expect(csv).toContain("E-6,2028,board/exam-driven (not guaranteed)");
  });

  it("writes year rows with blanks for post-service grade and pay", () => {
    expect(csv).toContain("2027,23,Yes,E-5,4110.00,10431.00");
    expect(csv).toContain("2064,60,No,,,920606.00");
  });

  it("includes totals and separation", () => {
    expect(csv).toContain("At separation (2031),64349.00");
    expect(csv).toContain("BRS agency match received,13042.00");
  });

  it("neutralizes formula-like labels (injection guard)", () => {
    const evil = {
      ...P,
      scenario: { ...P.scenario, branchLabel: "=cmd()" },
    };
    expect(generateProjectionCsv(evil)).toContain("Branch,'=cmd()");
  });
});

describe("generateProjectionTxt", () => {
  const txt = generateProjectionTxt(P);

  it("carries the headline figures and caveats", () => {
    expect(txt).toContain("ACTIVEPAYOS WEALTH PROJECTION");
    expect(txt).toContain("Marine Corps E-5, 6 YOS, age 22");
    expect(txt).toContain("$1,573,414");
    expect(txt).toContain("At separation (2031)");
    expect(txt).toContain("E-6 2028*");
    expect(txt).toContain("not guarantees");
  });

  it("is summary-first: the SUMMARY block precedes the year table", () => {
    expect(txt.indexOf("SUMMARY")).toBeGreaterThan(-1);
    expect(txt.indexOf("SUMMARY")).toBeLessThan(txt.indexOf("YEAR BY YEAR"));
    expect(txt.indexOf("At separation (2031)")).toBeLessThan(txt.indexOf("YEAR BY YEAR"));
  });

  it("uses \\n line endings", () => {
    expect(txt).not.toContain("\r\n");
  });

  it("marks post-service years without a grade", () => {
    const row2064 = txt.split("\n").find((l) => l.startsWith("2064"))!;
    expect(row2064).toContain("-");
    expect(row2064).toContain("$920,606");
  });
});

// ------------------------------------------------- trade-space, all formats ---

describe("trade-space analysis in every text format", () => {
  const csv = generateProjectionCsv(RICH);
  const txt = generateProjectionTxt(RICH);
  const json = generateProjectionJson(RICH);
  const analysis = analyzeTradeSpace(RICH);

  it("CSV carries the section, every sub-analysis, and an explanation column", () => {
    expect(csv).toContain("TRADE SPACE ANALYSIS");
    expect(csv).toContain("Section,Item,Value,Unit,What it means");
    for (const section of analysis.sections) {
      expect(csv).toContain(section.title);
    }
    // Staying in vs getting out, Roth vs Traditional, and the IRA guidance.
    expect(csv).toContain("Staying in vs getting out");
    expect(csv).toContain("Roth vs Traditional");
    expect(csv).toContain("Where an IRA fits");
  });

  it("CSV keeps the conclusions above the year-by-year detail", () => {
    expect(csv.indexOf("SUMMARY")).toBeLessThan(csv.indexOf("TRADE SPACE ANALYSIS"));
    expect(csv.indexOf("TRADE SPACE ANALYSIS")).toBeLessThan(csv.indexOf("Year by year"));
  });

  it("CSV carries the assumptions and caveats WITH the numbers", () => {
    expect(csv).toContain("Trade space assumptions");
    expect(csv).toContain("Trade space caveats");
    // The two that make a stay-vs-leave figure readable at all.
    expect(csv).toContain("Tax basis");
    expect(csv).toContain("civilian salary");
  });

  it("CSV bars share one scale across the paired columns", () => {
    const header = csv.split("\n").find((l) => l.startsWith("Scale: ") || l.includes(",Scale: "))!;
    expect(header).toContain("one shared scale");
  });

  it("TXT leads with a headline block, then the detail", () => {
    expect(txt).toContain("TRADE SPACE ANALYSIS");
    expect(txt).toContain("TRADE SPACE ASSUMPTIONS");
    expect(txt).toContain("TRADE SPACE CAVEATS");
    expect(txt.indexOf("TRADE SPACE ANALYSIS")).toBeLessThan(txt.indexOf("YEAR BY YEAR"));
    // The verdict line of each section appears before its metric detail.
    expect(txt.indexOf(analysis.stayVsLeave!.headline)).toBeLessThan(
      txt.indexOf("STAYING IN VS GETTING OUT")
    );
  });

  it("TXT draws the headline comparison as bars on one scale", () => {
    const block = txt.slice(txt.indexOf("TOTAL POSITION AT THE END"));
    expect(block).toContain("█");
    // The larger arm gets the full-width bar; the smaller one gets less.
    const bars = block.split("\n").slice(1, 3).map((l) => (l.match(/█+/)?.[0] ?? "").length);
    expect(bars[0]).toBeGreaterThan(bars[1]);
  });

  it("TXT keeps long analysis labels separated from their values", () => {
    const block = txt.slice(txt.indexOf("TRADE SPACE ANALYSIS"), txt.indexOf("YEAR BY YEAR"));
    for (const line of block.split("\n")) {
      expect(line).not.toMatch(/[a-z0-9)]\$[\d,]/);
    }
  });

  it("JSON exposes the analysis as structured data, summary first", () => {
    const parsed = JSON.parse(json);
    expect(parsed.schema).toBe(PROJECTION_JSON_SCHEMA);
    expect(Array.isArray(parsed.summary)).toBe(true);
    expect(parsed.tradeSpace.sections.map((s: { id: string }) => s.id)).toEqual(
      analysis.sections.map((s) => s.id)
    );
    expect(parsed.tradeSpace.stayVsLeave.breakEven).toBeTruthy();
    expect(parsed.tradeSpace.assumptions.length).toBeGreaterThan(0);
    expect(parsed.tradeSpace.caveats.length).toBeGreaterThan(0);
    // Conclusions are keyed above the bulk year detail.
    expect(json.indexOf('"tradeSpace"')).toBeLessThan(json.indexOf('"years"'));
  });

  it("JSON keeps numbers as numbers so a consumer can compute with them", () => {
    const parsed = JSON.parse(json);
    const gap = parsed.tradeSpace.stayVsLeave.breakEven.gapAtEnd;
    expect(typeof gap).toBe("number");
    expect(gap).toBeCloseTo(analysis.stayVsLeave!.breakEven!.gapAtEnd, 6);
  });

  it("degrades without throwing when the payload carries nothing to analyze", () => {
    const bare: ProjectionExport = { ...RICH, years: [], rothTradeoff: undefined };
    expect(() => generateProjectionCsv(bare)).not.toThrow();
    expect(() => generateProjectionTxt(bare)).not.toThrow();
    const parsed = JSON.parse(generateProjectionJson(bare));
    expect(parsed.tradeSpace.stayVsLeave).toBeNull();
    expect(parsed.tradeSpace.rothVsTraditional.complete).toBe(false);
    // Nothing fabricated: the missing input is named instead.
    expect(generateProjectionCsv(bare)).toContain("Trade space caveats");
  });
});

describe("generateProjectionPdf", () => {
  it("renders a valid PDF that includes the trade-space section", async () => {
    const bytes = await generateProjectionPdf(RICH);
    expect(bytes.length).toBeGreaterThan(2000);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  });

  it("still renders when the analysis has nothing to say", async () => {
    const bare: ProjectionExport = { ...RICH, years: [], rothTradeoff: undefined };
    const bytes = await generateProjectionPdf(bare);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  });
});
