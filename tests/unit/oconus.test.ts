import { describe, expect, it } from "vitest";
import { calculateOconusAllowances } from "@/lib/pay/oconus";

describe("calculateOconusAllowances", () => {
  it("keeps housing and COLA separate", () => {
    const r = calculateOconusAllowances({
      location: "  Ramstein, Germany  ",
      ohaRentMonthlyUsd: 1800,
      ohaUtilitiesMonthlyUsd: 650,
      colaMonthlyUsd: 325,
    });
    expect(r.location).toBe("Ramstein, Germany");
    expect(r.housingMonthlyUsd).toBe(2450);
    expect(r.recurringMonthlyUsd).toBe(2775);
  });

  it("fails safe for negative, non-finite, and extreme amounts", () => {
    const r = calculateOconusAllowances({
      location: "Test",
      ohaRentMonthlyUsd: -1,
      ohaUtilitiesMonthlyUsd: Number.NaN,
      colaMonthlyUsd: 1_000_000,
    });
    expect(r.housingMonthlyUsd).toBe(0);
    expect(r.colaMonthlyUsd).toBe(100_000);
  });
});
