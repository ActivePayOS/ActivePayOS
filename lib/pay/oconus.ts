// OCONUS allowances are entered from the member's current DTMO result or LES.
// OHA is reimbursement, not a flat BAH-style entitlement, so ActivePayOS must
// never infer it from a city name or display a rental ceiling as guaranteed pay.

export type OconusAllowanceInput = {
  location: string;
  ohaRentMonthlyUsd: number;
  ohaUtilitiesMonthlyUsd: number;
  colaMonthlyUsd: number;
};

export type OconusAllowanceResult = OconusAllowanceInput & {
  housingMonthlyUsd: number;
  recurringMonthlyUsd: number;
};

function safeMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.max(0, Math.min(100_000, value)) * 100) / 100;
}

export function calculateOconusAllowances(
  input: OconusAllowanceInput
): OconusAllowanceResult {
  const ohaRentMonthlyUsd = safeMoney(input.ohaRentMonthlyUsd);
  const ohaUtilitiesMonthlyUsd = safeMoney(input.ohaUtilitiesMonthlyUsd);
  const colaMonthlyUsd = safeMoney(input.colaMonthlyUsd);
  return {
    location: input.location.trim().slice(0, 100),
    ohaRentMonthlyUsd,
    ohaUtilitiesMonthlyUsd,
    colaMonthlyUsd,
    housingMonthlyUsd: ohaRentMonthlyUsd + ohaUtilitiesMonthlyUsd,
    recurringMonthlyUsd:
      ohaRentMonthlyUsd + ohaUtilitiesMonthlyUsd + colaMonthlyUsd,
  };
}

export const OCONUS_RATE_SOURCE =
  "https://www.travel.dod.mil/Allowances/Overseas-Housing-Allowance/OHA-Rate-Lookup/";
export const OCONUS_COLA_SOURCE =
  "https://www.travel.dod.mil/Allowances/Overseas-Cost-of-Living-Allowance/Overseas-COLA-Rate-Lookup/";

