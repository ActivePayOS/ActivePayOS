// Thrift Savings Plan reference data.
//
// The annual elective-deferral limit is a dated IRS figure — isolated here and
// flagged so it can be verified/updated like the pay tables.

// 2026 IRS elective deferral (402(g)) limit — the most of YOUR OWN pay you can
// defer in a calendar year, traditional and Roth combined. Confirmed by IRS
// Notice 2025-67 and TSP Bulletin 25-3 (2025 = $23,500). VERIFY annually.
//   https://www.irs.gov/pub/irs-drop/n-25-67.pdf
//   https://www.tsp.gov/bulletins/25-3/
// SINGLE SOURCE OF TRUTH for this figure — lib/pay/takehome.ts re-exports it,
// so update it here (and only here) on the annual refresh.
export const TSP_ELECTIVE_DEFERRAL_LIMIT_2026 = 24500;

// 2026 age-50+ catch-up (26 U.S.C. § 414(v)(2)(B)(i)) — extra room ON TOP of
// the elective-deferral limit, starting the year you turn 50. TSP applies this
// amount to ages 50-59 and 64+. Confirmed by Notice 2025-67 / Bulletin 25-3
// (2025 = $7,500). VERIFY annually against the sources above.
export const TSP_CATCH_UP_LIMIT_50_PLUS_2026 = 8000;

// 2026 "super" catch-up for the years you turn 60, 61, 62 or 63 (SECURE 2.0
// § 109; 26 U.S.C. § 414(v)(2)(E)(i)). It did NOT rise for 2026 — Notice
// 2025-67 says it "remains $11,250" — and drops back to the age-50+ amount at
// 64. VERIFY annually against the sources above.
export const TSP_CATCH_UP_LIMIT_60_TO_63_2026 = 11250;

// 2026 annual additions limit (26 U.S.C. § 415(c)(1)(A)) — the ceiling on
// EVERYTHING landing in the account for one employer in a year: your own
// contributions, the service's automatic 1% and match, and combat-zone
// tax-exempt contributions. Catch-up contributions sit outside it, and the cap
// is counted per employer, so an unrelated civilian plan gets its own.
// Confirmed by Notice 2025-67 (2025 = $70,000). VERIFY annually.
export const TSP_ANNUAL_ADDITIONS_LIMIT_2026 = 72000;

// ---------------------------------------------------------------------------
// Preformatted limit copy. Every surface (pay calculator, budget builder,
// wealth projector) renders these strings rather than restating a dollar figure
// as a literal, so the annual refresh above updates all of them at once.
// Kept short — InfoDot bubbles are ~18rem wide.
// ---------------------------------------------------------------------------
const usd0 = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** "$24,500 ($32,500 if 50+)" — headline limit, catch-up as a secondary clause. */
export const TSP_LIMIT_SUMMARY = `${usd0(TSP_ELECTIVE_DEFERRAL_LIMIT_2026)} (${usd0(
  TSP_ELECTIVE_DEFERRAL_LIMIT_2026 + TSP_CATCH_UP_LIMIT_50_PLUS_2026
)} if 50+)`;

/** Lead sentence for any TSP explainer — states the limit first. */
export const TSP_LIMIT_SENTENCE = `2026 limit: ${TSP_LIMIT_SUMMARY} of your own pay into the TSP, traditional and Roth combined.`;

/** Small always-visible hint under a contribution input. */
export const TSP_LIMIT_HINT = `2026 limit: ${TSP_LIMIT_SUMMARY} of your own pay — agency money is on top.`;

/**
 * Same hint for a civilian 401(k): § 402(g) is one limit per person covering
 * every elective-deferral plan, so this module stays its single source.
 */
export const K401_LIMIT_HINT = `2026 limit: ${TSP_LIMIT_SUMMARY} of your own pay — shared with the TSP in the same year; the employer match is on top.`;

/** The 402(g) limit follows the person, not the account. */
export const DEFERRAL_SHARED_NOTE = `The ${usd0(
  TSP_ELECTIVE_DEFERRAL_LIMIT_2026
)} limit is per person, not per plan — a TSP and a civilian 401(k) in the same calendar year share one limit.`;

/**
 * Service money does not eat into your own limit — it counts only toward the
 * separate § 415(c) ceiling on everything landing in the account.
 */
export const TSP_AGENCY_MONEY_NOTE = `BRS service money — the automatic 1% plus up to 4% match — is on top: it never counts against your ${usd0(
  TSP_ELECTIVE_DEFERRAL_LIMIT_2026
)}, only toward the separate ${usd0(
  TSP_ANNUAL_ADDITIONS_LIMIT_2026
)} annual cap on everything added to the account.`;

/** The most actionable warning for anyone maxing out early in the year. */
export const TSP_MAX_EARLY_WARNING = `Reaching ${usd0(
  TSP_ELECTIVE_DEFERRAL_LIMIT_2026
)} before December stops your contributions — and the match that rides on them — for the rest of the year.`;

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
