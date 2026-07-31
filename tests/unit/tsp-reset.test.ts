import { describe, expect, it } from "vitest";
import { computeTspReset, monthLimitIsReached, FULL_MATCH_PCT } from "@/lib/pay/tsp-reset";
import { TSP_ELECTIVE_DEFERRAL_LIMIT_2026 } from "@/lib/pay/tsp";

// The scenario this exists for: the calculator told someone 47% would exactly
// max the year, they were already running 60%, and they need to know what to
// drop to now — without silently forfeiting the BRS match.

const PAY = 4340; // roughly an O-1 monthly base pay

describe("computeTspReset", () => {
  it("works out the percent that lands exactly on the limit", () => {
    const r = computeTspReset({ monthlyBasePay: PAY, currentPct: 0.6, monthsElapsed: 5 });
    // 5 months at 60% is already in; the rest must fit the remaining room.
    expect(r.contributedYtd).toBeCloseTo(PAY * 0.6 * 5, 6);
    expect(r.monthsRemaining).toBe(7);
    expect(r.suggestedMonthly * r.monthsRemaining).toBeCloseTo(r.remainingRoom, 6);
    expect(r.contributedYtd + r.suggestedMonthly * r.monthsRemaining).toBeCloseTo(r.limit, 6);
  });

  it("reports the even percent that would have spread the limit over the year", () => {
    const r = computeTspReset({ monthlyBasePay: PAY, currentPct: 0.6, monthsElapsed: 5 });
    expect(r.evenPctForYear).toBeCloseTo(TSP_ELECTIVE_DEFERRAL_LIMIT_2026 / (PAY * 12), 6);
  });

  it("flags the months of forfeited match when the election is left alone", () => {
    const r = computeTspReset({ monthlyBasePay: PAY, currentPct: 0.6, monthsElapsed: 5 });
    expect(r.limitReachedInMonth).not.toBeNull();
    expect(r.matchMonthsAtRisk).toBeGreaterThan(0);
    expect(r.warnings.join(" ")).toMatch(/forfeiting the match/i);
  });

  it("never suggests contributing past the limit", () => {
    const r = computeTspReset({ monthlyBasePay: PAY, currentPct: 0.6, monthsElapsed: 5 });
    expect(r.contributedYtd + r.suggestedMonthly * r.monthsRemaining).toBeLessThanOrEqual(
      r.limit + 1e-6
    );
  });

  it("handles someone who has already hit the limit", () => {
    const r = computeTspReset({
      monthlyBasePay: PAY,
      currentPct: 0.6,
      monthsElapsed: 10,
      contributedYtd: TSP_ELECTIVE_DEFERRAL_LIMIT_2026,
    });
    expect(r.alreadyAtLimit).toBe(true);
    expect(r.remainingRoom).toBe(0);
    expect(r.suggestedPct).toBe(0);
    expect(r.warnings.join(" ")).toMatch(/already reached/i);
  });

  it("caps a supplied year-to-date figure at the limit", () => {
    const r = computeTspReset({
      monthlyBasePay: PAY,
      currentPct: 0.6,
      monthsElapsed: 11,
      contributedYtd: TSP_ELECTIVE_DEFERRAL_LIMIT_2026 + 5000,
    });
    expect(r.contributedYtd).toBe(TSP_ELECTIVE_DEFERRAL_LIMIT_2026);
    expect(r.alreadyAtLimit).toBe(true);
  });

  it("warns when staying under the limit means dropping below the match floor", () => {
    // Almost everything is already in, so the remaining room is tiny.
    const r = computeTspReset({
      monthlyBasePay: PAY,
      currentPct: 0.6,
      monthsElapsed: 11,
      contributedYtd: TSP_ELECTIVE_DEFERRAL_LIMIT_2026 - 50,
    });
    expect(r.suggestedPct).toBeLessThan(FULL_MATCH_PCT);
    expect(r.belowMatchFloor).toBe(true);
    expect(r.warnings.join(" ")).toMatch(/full match/i);
  });

  it("leaves a modest contributor alone", () => {
    const r = computeTspReset({ monthlyBasePay: PAY, currentPct: 0.05, monthsElapsed: 5 });
    expect(r.limitReachedInMonth).toBeNull();
    expect(r.matchMonthsAtRisk).toBe(0);
    expect(r.belowMatchFloor).toBe(false);
    expect(r.suggestedPct).toBeGreaterThan(FULL_MATCH_PCT);
  });

  it("degrades safely with no pay entered", () => {
    const r = computeTspReset({ monthlyBasePay: 0, currentPct: 0.6, monthsElapsed: 5 });
    expect(r.suggestedPct).toBe(0);
    expect(r.warnings.join(" ")).toMatch(/base pay/i);
  });

  it("handles a full year already elapsed", () => {
    const r = computeTspReset({ monthlyBasePay: PAY, currentPct: 0.1, monthsElapsed: 12 });
    expect(r.monthsRemaining).toBe(0);
    expect(r.suggestedPct).toBe(0);
    expect(r.warnings.join(" ")).toMatch(/year is over/i);
  });
});

describe("monthLimitIsReached", () => {
  it("returns the month a steady election runs out of room", () => {
    // 60% of $4,340 is $2,604/mo; $24,500 / $2,604 = 9.4 → month 10.
    expect(monthLimitIsReached(PAY, 0.6, TSP_ELECTIVE_DEFERRAL_LIMIT_2026)).toBe(10);
  });

  it("returns null when the limit is never reached", () => {
    expect(monthLimitIsReached(PAY, 0.05, TSP_ELECTIVE_DEFERRAL_LIMIT_2026)).toBeNull();
  });

  it("returns null for a zero election", () => {
    expect(monthLimitIsReached(PAY, 0, TSP_ELECTIVE_DEFERRAL_LIMIT_2026)).toBeNull();
  });
});
