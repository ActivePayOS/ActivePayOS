import { describe, expect, it } from "vitest";
import { analyzeStationScenario, OCONUS } from "@/lib/pay/state-tax-analysis";

describe("analyzeStationScenario", () => {
  it("returns null for unknown states", () => {
    expect(analyzeStationScenario("Atlantis", "Texas")).toBeNull();
    expect(analyzeStationScenario("Texas", "Atlantis")).toBeNull();
  });

  it("no-income-tax home state is 0% wherever stationed", () => {
    for (const duty of ["Texas", "California", OCONUS]) {
      const a = analyzeStationScenario("Texas", duty)!;
      expect(a.outcome).toBe("no_income_tax");
      expect(a.suggestedRatePct).toBe(0);
    }
  });

  it("broad active-duty-exempt home state is 0% wherever stationed", () => {
    const a = analyzeStationScenario("Illinois", "Georgia")!;
    expect(a.outcome).toBe("exempt_everywhere");
    expect(a.suggestedRatePct).toBe(0);
  });

  it("California resident stationed outside CA gets nonresident treatment at 0%", () => {
    const a = analyzeStationScenario("California", "Massachusetts")!;
    expect(a.outcome).toBe("relief_stationed_outside");
    expect(a.suggestedRatePct).toBe(0);
    expect(a.conditions).toMatch(/PCS/);
  });

  it("California resident stationed in CA is taxed at the normal planning rate", () => {
    const a = analyzeStationScenario("California", "California")!;
    expect(a.stationedInHomeState).toBe(true);
    expect(a.outcome).toBe("taxed");
    expect(a.suggestedRatePct).toBeGreaterThan(0);
  });

  it("OCONUS counts as stationed outside the home state", () => {
    const a = analyzeStationScenario("California", OCONUS)!;
    expect(a.stationedOconus).toBe(true);
    expect(a.outcome).toBe("relief_stationed_outside");
    expect(a.suggestedRatePct).toBe(0);
  });

  it("conditional-nonresident states (NY) surface their tests instead of a flat exemption", () => {
    const a = analyzeStationScenario("New York", "Texas")!;
    expect(a.outcome).toBe("conditional_relief");
    expect(a.suggestedRatePct).toBe(0);
    expect(a.conditions).toMatch(/30 days/);
  });

  it("OCONUS-only relief (Colorado) does not fire for a stateside station", () => {
    const stateside = analyzeStationScenario("Colorado", "Texas")!;
    expect(stateside.outcome).toBe("taxed");
    expect(stateside.suggestedRatePct).toBeGreaterThan(0);

    const overseas = analyzeStationScenario("Colorado", OCONUS)!;
    expect(overseas.outcome).toBe("partial_relief");
    expect(overseas.suggestedRatePct).toBe(0);
  });

  it("states with no stationed-outside relief stay taxed when stationed away", () => {
    const a = analyzeStationScenario("Georgia", "Texas")!;
    expect(a.outcome).toBe("taxed");
    expect(a.suggestedRatePct).toBeGreaterThan(0);
    // The duty state never taxes military pay of a nonresident.
    expect(a.explanation).toMatch(/SCRA/);
  });

  it("partial-relief states (Louisiana) fire with their cap noted", () => {
    const a = analyzeStationScenario("Louisiana", "Virginia")!;
    expect(a.outcome).toBe("partial_relief");
    expect(a.conditions).toMatch(/50,000/);
  });

  it("civilian-income warning appears only for a stateside duty station away from home", () => {
    const away = analyzeStationScenario("Georgia", "Texas")!;
    expect(away.warnings.some((w) => w.includes("Civilian side income"))).toBe(true);
    const home = analyzeStationScenario("Georgia", "Georgia")!;
    expect(home.warnings.some((w) => w.includes("Civilian side income"))).toBe(false);
    const oconus = analyzeStationScenario("Georgia", OCONUS)!;
    expect(oconus.warnings.some((w) => w.includes("Civilian side income"))).toBe(false);
  });
});
