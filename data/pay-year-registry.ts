import basepay2026 from "@/data/basepay/2026.json";
import bas2026 from "@/data/bas/2026.json";

/**
 * Immutable published-year registry. Add a new entry; never replace an older
 * year's data. Calculators default to the newest verified entry while keeping
 * every prior year selectable.
 */
export const PAY_YEAR_REGISTRY = {
  2026: {
    year: 2026,
    status: "verified" as const,
    effectiveDate: "2026-01-01",
    basepay: basepay2026,
    bas: bas2026,
  },
};

export const AVAILABLE_PAY_YEARS = Object.keys(PAY_YEAR_REGISTRY)
  .map(Number)
  .sort((a, b) => b - a);

export const LATEST_VERIFIED_PAY_YEAR = AVAILABLE_PAY_YEARS[0];
