// Thrift Savings Plan reference data.
//
// The annual elective-deferral limit is a dated IRS figure — isolated here and
// flagged so it can be verified/updated like the pay tables.

// 2026 IRS elective deferral (402(g)) limit. VERIFY against IRS guidance
// (2025 = $23,500). Catch-up contributions (age 50+/60-63) are separate and
// not modeled here.
export const TSP_ELECTIVE_DEFERRAL_LIMIT_2026 = 24500;

export type TspFundKey = "G" | "F" | "C" | "S" | "I";

export const TSP_FUNDS: {
  key: TspFundKey;
  name: string;
  color: string;
  blurb: string;
}[] = [
  { key: "G", name: "G Fund", color: "#64748b", blurb: "Gov't securities — no loss of principal, lowest growth." },
  { key: "F", name: "F Fund", color: "#3b82f6", blurb: "U.S. bond index — modest growth, some risk." },
  { key: "C", name: "C Fund", color: "#22c55e", blurb: "Large-cap U.S. stocks (S&P 500)." },
  { key: "S", name: "S Fund", color: "#f59e0b", blurb: "Small/mid-cap U.S. stocks — higher risk/reward." },
  { key: "I", name: "I Fund", color: "#8b5cf6", blurb: "International developed-market stocks." },
];

export type FundAllocation = Record<TspFundKey, number>;

// A simple, diversified default the user can change.
export const DEFAULT_FUND_ALLOCATION: FundAllocation = {
  G: 5,
  F: 5,
  C: 60,
  S: 20,
  I: 10,
};
