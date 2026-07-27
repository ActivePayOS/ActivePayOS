// Thrift Savings Plan reference data.
//
// The annual elective-deferral limit is a dated IRS figure — isolated here and
// flagged so it can be verified/updated like the pay tables.

// 2026 IRS elective deferral (402(g)) limit. VERIFY against IRS guidance
// (2025 = $23,500). Catch-up contributions (age 50+/60-63) are separate and
// not modeled here.
export const TSP_ELECTIVE_DEFERRAL_LIMIT_2026 = 24500;

// ---------------------------------------------------------------------------
// TSP fund management costs. Most members never see these because they're
// netted out of share prices rather than billed — surfaced here so the cost
// is explicit. VERIFY annually against tsp.gov/fund-management-expenses.
//
// 2024 figures: net administrative expense ratio ≈ 0.036%–0.056% per fund
// (record keeping, communications, TSP operations, reduced by loan fees and
// forfeitures) plus investment management/other expenses of ≈ 0.004%–0.02%.
// Combined, a typical mix costs roughly 0.05%/yr ≈ 50¢ per $1,000 per year.
// ---------------------------------------------------------------------------
export const TSP_TYPICAL_EXPENSE_RATIO_PCT = 0.05;

export const TSP_EXPENSE_EXPLAINER: string[] = [
  "The TSP charges no commissions and no account fee. Its cost is an expense ratio — a tiny slice of assets deducted from fund share prices automatically, so it never shows up as a line item on your statement.",
  "It has two parts: net administrative expenses (record keeping, the ThriftLine, communications — reduced by loan-fee income and forfeited agency contributions) and investment management fees paid to the fund managers (BlackRock/State Street).",
  "Recent combined totals run roughly 0.04%–0.08% per year depending on the fund — about 40 to 80 cents per $1,000 invested per year. That is among the lowest of any retirement plan; typical actively-managed civilian funds charge 0.5%–1%+ (10–20× more).",
  "The Mutual Fund Window is the exception: it adds a $55 annual administrative fee, a $95 annual maintenance fee, $28.75 per trade, and each mutual fund's own expense ratio.",
  "Verify current per-fund figures at tsp.gov (Fund management expenses) — they change a little every year.",
];

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
