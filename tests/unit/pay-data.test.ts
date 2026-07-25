// Golden-value tests for the pay-data lookups (base pay, BAS, BAH).
//
// Expected figures are the 2026 DFAS/DTMO values already verified by the
// data-audit scripts (`npm run audit:pay-data`, `npm run bah:verify`); these
// tests lock the lookup logic against those known-good numbers.

import { describe, expect, it } from "vitest";
import { basePayFor, type BasePayDataset } from "@/lib/pay/basepay-lookup";
import { getBAS } from "@/lib/pay/bas";
import { getBahLookup, getBahRate } from "@/lib/pay/bah";
import basepay2026 from "@/data/basepay/2026.json";

const ds = basepay2026 as unknown as BasePayDataset;

describe("basePayFor (2026 DFAS tables)", () => {
  it("returns the '2 or less' column below 2 YOS", () => {
    expect(basePayFor(ds, "E-5", 0)).toBe(3342.9);
    expect(basePayFor(ds, "E-5", 1.9)).toBe(3342.9);
  });

  it("steps to the right column at each YOS break", () => {
    expect(basePayFor(ds, "E-5", 2)).toBe(3598.2);
    expect(basePayFor(ds, "E-5", 6)).toBe(4110);
    expect(basePayFor(ds, "E-5", 7.9)).toBe(4110); // still the over-6 column
    expect(basePayFor(ds, "E-5", 8)).toBe(4299.9);
  });

  it("plateaus at the top of the table", () => {
    expect(basePayFor(ds, "E-5", 40)).toBe(4421.7);
    expect(basePayFor(ds, "E-5", 55)).toBe(4421.7);
  });

  it("resolves officer, warrant, and prior-enlisted-officer tables", () => {
    expect(basePayFor(ds, "O-3", 10)).toBe(8375.7);
    expect(basePayFor(ds, "W-2", 4)).toBe(5286);
    expect(basePayFor(ds, "O-2E", 6)).toBe(6617.7);
  });

  it("returns null where DFAS publishes no rate", () => {
    // O-2E has no published rate below 4 YOS.
    expect(basePayFor(ds, "O-2E", 0)).toBeNull();
    expect(basePayFor(ds, "Z-9", 4)).toBeNull();
  });
});

describe("getBAS (2026)", () => {
  it("returns the enlisted rate for E grades", () => {
    expect(getBAS(2026, "E-1")).toBe(476.95);
    expect(getBAS(2026, "E-9")).toBe(476.95);
  });

  it("returns the officer rate for O, W, and prior-enlisted O grades", () => {
    expect(getBAS(2026, "O-3")).toBe(328.48);
    expect(getBAS(2026, "W-2")).toBe(328.48);
    expect(getBAS(2026, "O-2E")).toBe(328.48);
  });

  it("returns null for years without data", () => {
    expect(getBAS(2025, "E-5")).toBeNull();
  });
});

describe("getBahLookup (2026 DTMO)", () => {
  it("resolves a standard ZIP to its MHA and rate (Cambridge, MA)", () => {
    const r = getBahLookup("02139", "E-5", true);
    expect(r).toMatchObject({ status: "ok", mha: "MA120", normalizedZip: "02139", rate: 4791 });
  });

  it("uses the without-dependents table when asked", () => {
    expect(getBahRate("02139", "E-5", false)).toBe(3615);
  });

  it("accepts ZIP+4 and surrounding whitespace", () => {
    expect(getBahLookup("02139-1234", "O-3", true).rate).toBe(5163);
    expect(getBahLookup(" 02139 ", "O-3", true).rate).toBe(5163);
  });

  it("folds O-8/O-9/O-10 to the O-7 BAH row", () => {
    const o7 = getBahLookup("02139", "O-7", true);
    const o10 = getBahLookup("02139", "O-10", true);
    expect(o7.rate).toBe(6594);
    expect(o10.rate).toBe(6594);
  });

  it("flags malformed ZIPs", () => {
    expect(getBahLookup("abc", "E-5", true).status).toBe("invalid_zip");
    expect(getBahLookup("1234", "E-5", true).status).toBe("invalid_zip");
    expect(getBahLookup("", "E-5", true).status).toBe("invalid_zip");
  });

  it("flags ZIPs missing from the DTMO file", () => {
    expect(getBahLookup("00000", "E-5", true).status).toBe("zip_not_found");
  });

  it("flags non-standard (XX) MHAs instead of guessing a rate", () => {
    // 96799 = American Samoa, mapped to a non-standard XX area.
    const r = getBahLookup("96799", "E-5", true);
    expect(r.status).toBe("nonstandard_mha");
    expect(r.rate).toBeNull();
  });
});
