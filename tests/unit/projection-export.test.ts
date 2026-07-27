// Tests for the Wealth Projection CSV/TXT export builders.

import { describe, expect, it } from "vitest";
import {
  generateProjectionCsv,
  generateProjectionTxt,
  type ProjectionExport,
} from "@/lib/export/projection";

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

describe("generateProjectionCsv", () => {
  const csv = generateProjectionCsv(P);

  it("includes the scenario assumptions", () => {
    expect(csv).toContain("Branch,Marine Corps");
    expect(csv).toContain("Years staying in,5");
    expect(csv).toContain("TSP contribution (% of base pay),5");
    expect(csv).toContain("Assumed TSP return (%/yr),9.7");
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

  it("marks post-service years without a grade", () => {
    const row2064 = txt.split("\r\n").find((l) => l.startsWith("2064"))!;
    expect(row2064).toContain("-");
    expect(row2064).toContain("$920,606");
  });
});
