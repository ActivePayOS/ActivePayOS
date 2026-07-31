// Literal pins for the 2026 retirement-contribution limits and the copy built
// from them.
//
// Every figure below traces to IRS Notice 2025-67 ("2026 Amounts Relating to
// Retirement Plans and IRAs", https://www.irs.gov/pub/irs-drop/n-25-67.pdf) and
// TSP Bulletin 25-3 (https://www.tsp.gov/bulletins/25-3/). The expectations are
// hard-coded rather than derived from the exported constants so a bad annual
// update fails here — same convention as the constant pins in takehome.test.ts.

import { describe, expect, it } from "vitest";
import {
  DEFERRAL_SHARED_NOTE,
  K401_LIMIT_HINT,
  TSP_ANNUAL_ADDITIONS_LIMIT_2026,
  TSP_AGENCY_MONEY_NOTE,
  TSP_CATCH_UP_LIMIT_50_PLUS_2026,
  TSP_CATCH_UP_LIMIT_60_TO_63_2026,
  TSP_ELECTIVE_DEFERRAL_LIMIT_2026,
  TSP_LIMIT_HINT,
  TSP_LIMIT_SENTENCE,
  TSP_LIMIT_SUMMARY,
  TSP_MAX_EARLY_WARNING,
} from "@/lib/pay/tsp";
import {
  IRA_CATCH_UP_LIMIT_50_PLUS_2026,
  IRA_CONTRIBUTION_LIMIT_2026,
  IRA_LIMIT_HINT,
  IRA_LIMIT_SENTENCE,
  IRA_LIMIT_SUMMARY,
  ROTH_IRA_PHASEOUT_2026,
  ROTH_IRA_PHASEOUT_NOTE,
} from "@/lib/pay/ira";

describe("2026 TSP limits", () => {
  it("matches IRS Notice 2025-67 / TSP Bulletin 25-3", () => {
    // 26 U.S.C. § 402(g) elective deferral (2025 = $23,500).
    expect(TSP_ELECTIVE_DEFERRAL_LIMIT_2026).toBe(24500);
    // § 414(v)(2)(B)(i) age-50+ catch-up (2025 = $7,500).
    expect(TSP_CATCH_UP_LIMIT_50_PLUS_2026).toBe(8000);
    // § 414(v)(2)(E)(i) ages 60-63 — Notice 2025-67: "remains $11,250".
    expect(TSP_CATCH_UP_LIMIT_60_TO_63_2026).toBe(11250);
    // § 415(c)(1)(A) annual additions (2025 = $70,000).
    expect(TSP_ANNUAL_ADDITIONS_LIMIT_2026).toBe(72000);
  });

  it("the catch-up is extra room on top of the deferral limit", () => {
    expect(TSP_ELECTIVE_DEFERRAL_LIMIT_2026 + TSP_CATCH_UP_LIMIT_50_PLUS_2026).toBe(32500);
    expect(TSP_ELECTIVE_DEFERRAL_LIMIT_2026 + TSP_CATCH_UP_LIMIT_60_TO_63_2026).toBe(35750);
  });

  it("the total-additions cap is far above the deferral limit", () => {
    expect(TSP_ANNUAL_ADDITIONS_LIMIT_2026).toBeGreaterThan(TSP_ELECTIVE_DEFERRAL_LIMIT_2026);
  });
});

describe("2026 IRA limits", () => {
  it("matches IRS Notice 2025-67", () => {
    // § 219(b)(5)(A) traditional + Roth combined (2025 = $7,000).
    expect(IRA_CONTRIBUTION_LIMIT_2026).toBe(7500);
    // § 219(b)(5)(B)(ii) age-50+ catch-up (2025 = $1,000).
    expect(IRA_CATCH_UP_LIMIT_50_PLUS_2026).toBe(1100);
    expect(IRA_CONTRIBUTION_LIMIT_2026 + IRA_CATCH_UP_LIMIT_50_PLUS_2026).toBe(8600);
  });

  it("pins the Roth IRA MAGI phase-out ranges", () => {
    expect(ROTH_IRA_PHASEOUT_2026.single).toEqual({ start: 153000, end: 168000 });
    expect(ROTH_IRA_PHASEOUT_2026.married).toEqual({ start: 242000, end: 252000 });
    // Not indexed — Notice 2025-67 keeps this one at $0–$10,000 forever.
    expect(ROTH_IRA_PHASEOUT_2026.marriedSeparate).toEqual({ start: 0, end: 10000 });
  });
});

describe("limit copy strings", () => {
  it("renders the TSP limit with the catch-up as a secondary clause", () => {
    expect(TSP_LIMIT_SUMMARY).toBe("$24,500 ($32,500 if 50+)");
    expect(TSP_LIMIT_SENTENCE.startsWith("2026 limit: $24,500 ($32,500 if 50+)")).toBe(true);
    expect(TSP_LIMIT_HINT.startsWith("2026 limit: $24,500 ($32,500 if 50+)")).toBe(true);
  });

  it("renders the IRA limit with the catch-up as a secondary clause", () => {
    expect(IRA_LIMIT_SUMMARY).toBe("$7,500 ($8,600 if 50+)");
    expect(IRA_LIMIT_SENTENCE.startsWith("2026 limit: $7,500 ($8,600 if 50+)")).toBe(true);
    expect(IRA_LIMIT_HINT).toContain("$625/mo");
  });

  it("states the shared-limit and agency-money facts with the live figures", () => {
    expect(DEFERRAL_SHARED_NOTE).toContain("$24,500");
    expect(DEFERRAL_SHARED_NOTE).toContain("per person, not per plan");
    expect(K401_LIMIT_HINT).toContain("$24,500 ($32,500 if 50+)");
    expect(K401_LIMIT_HINT).toContain("shared with the TSP");
    expect(TSP_AGENCY_MONEY_NOTE).toContain("$24,500");
    // Agency money is excluded from § 402(g) but included in § 415(c).
    expect(TSP_AGENCY_MONEY_NOTE).toContain("$72,000");
    expect(TSP_MAX_EARLY_WARNING).toContain("$24,500");
  });

  it("quotes both Roth IRA phase-out ranges", () => {
    expect(ROTH_IRA_PHASEOUT_NOTE).toContain("$153,000–$168,000");
    expect(ROTH_IRA_PHASEOUT_NOTE).toContain("$242,000–$252,000");
  });

  // No copy string may restate a dollar figure the constants don't produce.
  it("never hard-codes a stale figure", () => {
    const copy = [
      TSP_LIMIT_SUMMARY,
      TSP_LIMIT_SENTENCE,
      TSP_LIMIT_HINT,
      TSP_AGENCY_MONEY_NOTE,
      TSP_MAX_EARLY_WARNING,
      DEFERRAL_SHARED_NOTE,
      K401_LIMIT_HINT,
      IRA_LIMIT_SUMMARY,
      IRA_LIMIT_SENTENCE,
      IRA_LIMIT_HINT,
      ROTH_IRA_PHASEOUT_NOTE,
    ].join(" ");
    const allowed = new Set(
      [
        TSP_ELECTIVE_DEFERRAL_LIMIT_2026,
        TSP_ELECTIVE_DEFERRAL_LIMIT_2026 + TSP_CATCH_UP_LIMIT_50_PLUS_2026,
        TSP_ANNUAL_ADDITIONS_LIMIT_2026,
        IRA_CONTRIBUTION_LIMIT_2026,
        IRA_CONTRIBUTION_LIMIT_2026 + IRA_CATCH_UP_LIMIT_50_PLUS_2026,
        IRA_CONTRIBUTION_LIMIT_2026 / 12,
        ROTH_IRA_PHASEOUT_2026.single.start,
        ROTH_IRA_PHASEOUT_2026.single.end,
        ROTH_IRA_PHASEOUT_2026.married.start,
        ROTH_IRA_PHASEOUT_2026.married.end,
      ].map((n) => Math.round(n))
    );
    const figures = (copy.match(/\$[\d,]+/g) ?? []).map((s) => Number(s.replace(/[$,]/g, "")));
    expect(figures.length).toBeGreaterThan(0);
    for (const f of figures) expect(allowed.has(f)).toBe(true);
  });
});
