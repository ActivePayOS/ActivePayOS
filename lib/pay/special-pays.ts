// Special & incentive pays.
//
// Representative monthly amounts and typical tax treatment — all editable by
// the user, because most of these vary by service, grade, years, and location.
// HFP/IDP is shown non-taxable (the common combat-zone case); the rest default
// taxable. Figures are public Department of War / Department of Defense (DoD)
// and DFAS (FMR Vol. 7A) estimates.

export type SpecialPay = {
  id: string;
  label: string;
  monthly: number;
  taxable: boolean;
};

import type { BranchId } from "./branches";

export type SpecialPayPreset = {
  label: string;
  monthly: number;
  taxable: boolean;
  // Branches this pay is specific to. Omitted = available across all services. These are
  // surfaced ADDITIVELY when the branch is selected — nothing universal is
  // ever hidden.
  branches?: BranchId[];
};

export const SPECIAL_PAY_PRESETS: SpecialPayPreset[] = [
  { label: "Hostile Fire / Imminent Danger Pay", monthly: 225, taxable: false },
  // Raised from $250 effective 2025-12-18 (FY26 NDAA).
  { label: "Family Separation Allowance (FSA)", monthly: 300, taxable: false },
  { label: "Flight Pay (ACIP / HDIP-air)", monthly: 250, taxable: true },
  { label: "Parachute (Jump) Pay", monthly: 150, taxable: true },
  { label: "HALO Parachute Pay", monthly: 225, taxable: true },
  { label: "Dive Pay", monthly: 240, taxable: true },
  { label: "Career Sea Pay", monthly: 200, taxable: true, branches: ["navy", "uscg", "usmc"] },
  { label: "Submarine Duty Pay", monthly: 300, taxable: true, branches: ["navy"] },
  { label: "Demolition / EOD (HDIP)", monthly: 150, taxable: true },
  { label: "Foreign Language Proficiency Bonus", monthly: 200, taxable: true },
  { label: "Hardship Duty Pay (location)", monthly: 100, taxable: true },
  { label: "Special Duty Assignment Pay (SDAP)", monthly: 300, taxable: true },
];

// Colors for special-pay inflow ribbons in the Sankey (distinct from the
// base/BAH/BAS blue/green/amber).
export const SPECIAL_PAY_COLORS = [
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#84cc16",
  "#a855f7",
  "#14b8a6",
  "#f43f5e",
  "#0ea5e9",
];
