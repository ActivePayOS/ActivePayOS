// The user's insight, tested: TSP stops you at the limit, and the service only
// matches money that actually went in that month — so contributing faster can
// get you LESS. These are the numbers the warning copy is written against.

import { describe, expect, it } from "vitest";
import {
  BRS_AUTOMATIC_PCT,
  BRS_MAX_MATCH_PCT,
  brsEligibilityAtServiceMonth,
  brsMatchPct,
  computeTspPacing,
} from "@/lib/pay/tsp-pacing";
import { brsAgencyPct } from "@/lib/projection/wealth";
import { TSP_ELECTIVE_DEFERRAL_LIMIT_2026 } from "@/lib/pay/tsp";

const PAY = 5000; // roughly an E-6 / O-2 monthly base pay

describe("brsMatchPct", () => {
  it("tiers 100% on the first 3% and 50% on the next 2%", () => {
    expect(brsMatchPct(0)).toBeCloseTo(0, 10);
    expect(brsMatchPct(0.01)).toBeCloseTo(0.01, 10);
    expect(brsMatchPct(0.03)).toBeCloseTo(0.03, 10);
    expect(brsMatchPct(0.04)).toBeCloseTo(0.035, 10);
    expect(brsMatchPct(0.05)).toBeCloseTo(BRS_MAX_MATCH_PCT, 10);
  });

  it("never pays more than 4%, and never less than nothing", () => {
    expect(brsMatchPct(0.6)).toBeCloseTo(BRS_MAX_MATCH_PCT, 10);
    expect(brsMatchPct(1)).toBeCloseTo(BRS_MAX_MATCH_PCT, 10);
    expect(brsMatchPct(-0.2)).toBe(0);
    expect(brsMatchPct(Number.NaN)).toBe(0);
  });

  it("plus the automatic 1% reproduces the combined agency percent", () => {
    for (const p of [0, 0.01, 0.03, 0.04, 0.05, 0.1, 1]) {
      expect(BRS_AUTOMATIC_PCT + brsMatchPct(p)).toBeCloseTo(brsAgencyPct(p), 10);
    }
  });
});

describe("brsEligibilityAtServiceMonth", () => {
  it("starts automatic contributions after 60 days and matching in month 25", () => {
    expect(brsEligibilityAtServiceMonth(1)).toEqual({ automatic: false, matching: false });
    expect(brsEligibilityAtServiceMonth(2)).toEqual({ automatic: true, matching: false });
    expect(brsEligibilityAtServiceMonth(23)).toEqual({ automatic: true, matching: false });
    expect(brsEligibilityAtServiceMonth(24)).toEqual({ automatic: true, matching: true });
  });

  it("includes the month reaching 26 YOS, then stops government contributions", () => {
    expect(brsEligibilityAtServiceMonth(312)).toEqual({ automatic: true, matching: true });
    expect(brsEligibilityAtServiceMonth(313)).toEqual({ automatic: false, matching: false });
  });
});

describe("computeTspPacing", () => {
  it("stops a 60% election in month 9 and leaves three months with nothing going in", () => {
    const p = computeTspPacing(PAY, 0.6);
    expect(p.perMonth).toBeCloseTo(3000, 6);
    // $24,500 / $3,000 = 8.2 months, so the limit is reached during month 9.
    expect(p.limitReachedInMonth).toBe(9);
    expect(p.monthsStopped).toBe(3);
    expect(p.frontLoading).toBe(true);
  });

  it("prices the loss at the full 4% match for each stopped month", () => {
    const p = computeTspPacing(PAY, 0.6);
    expect(p.matchLostMonthly).toBeCloseTo(200, 6); // 4% of $5,000
    expect(p.matchLostTotal).toBeCloseTo(600, 6); // three months
    expect(p.matchLostTotal).toBeCloseTo(p.matchLostMonthly * p.monthsStopped, 10);
  });

  it("leaves a 5% election alone — it never runs out of room", () => {
    const p = computeTspPacing(PAY, 0.05);
    expect(p.limitReachedInMonth).toBeNull();
    expect(p.monthsStopped).toBe(0);
    // Both loss figures read zero when nothing stops, so the UI can print
    // them without re-checking frontLoading first.
    expect(p.matchLostMonthly).toBe(0);
    expect(p.matchLostTotal).toBe(0);
    expect(p.frontLoading).toBe(false);
  });

  it("reports the even percent whose last dollar lands in December", () => {
    const p = computeTspPacing(PAY, 0.6);
    expect(p.evenPct).toBeCloseTo(TSP_ELECTIVE_DEFERRAL_LIMIT_2026 / (PAY * 12), 10);
    expect(p.evenMonthly).toBeCloseTo(TSP_ELECTIVE_DEFERRAL_LIMIT_2026 / 12, 6);

    // Run that percent back through and the year closes out in month 12 with
    // nothing forfeited — the whole point of the recommendation.
    const paced = computeTspPacing(PAY, p.evenPct);
    expect(paced.limitReachedInMonth).toBe(12);
    expect(paced.monthsStopped).toBe(0);
    expect(paced.matchLostMonthly).toBe(0);
    expect(paced.matchLostTotal).toBe(0);
    expect(paced.frontLoading).toBe(false);
  });

  it("holds the December boundary across a sweep of pay figures", () => {
    // The even percent computes as 12.000000000000002 months for roughly half
    // of all pay values; the recommendation must not flicker between "lands in
    // December" and "never reaches the limit".
    for (let pay = 2100; pay < 15000; pay += 37.13) {
      const even = computeTspPacing(pay, 0).evenPct;
      const paced = computeTspPacing(pay, even);
      expect(paced.limitReachedInMonth).toBe(12);
      expect(paced.monthsStopped).toBe(0);
    }
  });

  it("costs a single month once the election passes the even pace enough", () => {
    // 45% of $5,000 is $2,250/mo → $24,500 / $2,250 = 10.9 → month 11.
    const p = computeTspPacing(PAY, 0.45);
    expect(p.limitReachedInMonth).toBe(11);
    expect(p.monthsStopped).toBe(1);
    expect(p.matchLostTotal).toBeCloseTo(200, 6);
  });

  it("has nothing to lose when the member is not matched", () => {
    const p = computeTspPacing(PAY, 0.6, { brs: false });
    expect(p.monthsStopped).toBe(3); // still stops
    expect(p.matchLostMonthly).toBe(0);
    expect(p.matchLostTotal).toBe(0);
  });

  it("honors a supplied limit", () => {
    const p = computeTspPacing(PAY, 0.6, { limit: 12000 });
    expect(p.limit).toBe(12000);
    expect(p.limitReachedInMonth).toBe(4); // 12000 / 3000
    expect(p.monthsStopped).toBe(8);
  });
});

describe("computeTspPacing edge cases", () => {
  it("degrades safely with no pay", () => {
    for (const pay of [0, -100]) {
      const p = computeTspPacing(pay, 0.6);
      expect(p.perMonth).toBe(0);
      expect(p.limitReachedInMonth).toBeNull();
      expect(p.monthsStopped).toBe(0);
      expect(p.matchLostTotal).toBe(0);
      expect(p.evenPct).toBe(0);
      expect(p.evenMonthly).toBe(0);
      expect(p.frontLoading).toBe(false);
    }
  });

  it("treats a 0% election as contributing nothing, not as being stopped", () => {
    const p = computeTspPacing(PAY, 0);
    expect(p.perMonth).toBe(0);
    expect(p.limitReachedInMonth).toBeNull();
    expect(p.monthsStopped).toBe(0);
    expect(p.matchLostTotal).toBe(0);
    expect(p.frontLoading).toBe(false);
  });

  it("handles a 100% election", () => {
    const p = computeTspPacing(PAY, 1);
    expect(p.perMonth).toBeCloseTo(5000, 6);
    expect(p.limitReachedInMonth).toBe(5); // 24,500 / 5,000 = 4.9
    expect(p.monthsStopped).toBe(7);
    expect(p.matchLostTotal).toBeCloseTo(200 * 7, 6);
  });

  it("clamps percents above 100% instead of inventing pay", () => {
    expect(computeTspPacing(PAY, 4)).toEqual(computeTspPacing(PAY, 1));
  });

  it("survives non-finite input", () => {
    for (const p of [
      computeTspPacing(Number.NaN, 0.6),
      computeTspPacing(PAY, Number.NaN),
      computeTspPacing(Number.POSITIVE_INFINITY, 0.6),
      computeTspPacing(PAY, Number.POSITIVE_INFINITY),
      computeTspPacing(PAY, 0.6, { limit: Number.NaN }),
    ]) {
      expect(Number.isFinite(p.perMonth)).toBe(true);
      expect(Number.isFinite(p.matchLostTotal)).toBe(true);
      expect(Number.isFinite(p.evenPct)).toBe(true);
      expect(Number.isFinite(p.evenMonthly)).toBe(true);
      expect(p.monthsStopped).toBeGreaterThanOrEqual(0);
      expect(p.monthsStopped).toBeLessThanOrEqual(12);
    }
  });

  it("cannot capture the limit when a year of pay is smaller than it", () => {
    // 100% of $1,000/mo is only $12,000 a year — the limit is unreachable and
    // the even percent is capped at everything you earn.
    const p = computeTspPacing(1000, 1);
    expect(p.limitReachedInMonth).toBeNull();
    expect(p.frontLoading).toBe(false);
    expect(p.evenPct).toBe(1);
    expect(p.evenMonthly).toBe(1000);
  });
});
