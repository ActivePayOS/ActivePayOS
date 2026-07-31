// Civilian IRA reference data.
//
// Shared by the Budget Builder (sweep leftover money into an IRA) and the
// Wealth Projector (IRA account that can keep receiving contributions after
// separation). Like lib/pay/tsp.ts, the dated IRS figure is isolated and
// flagged for annual verification.

// 2026 IRS IRA contribution limit (26 U.S.C. § 219(b)(5)(A)) — traditional and
// Roth share this ONE limit across all your IRAs, under age 50. Confirmed by
// IRS Notice 2025-67 (2025 = $7,000). VERIFY annually.
//   https://www.irs.gov/pub/irs-drop/n-25-67.pdf
export const IRA_CONTRIBUTION_LIMIT_2026 = 7500;

// 2026 IRA age-50+ catch-up (26 U.S.C. § 219(b)(5)(B)(ii)) — extra room on top
// of the limit above. Notice 2025-67: "increased from $1,000 to $1,100".
// VERIFY annually against the source above.
export const IRA_CATCH_UP_LIMIT_50_PLUS_2026 = 1100;

// 2026 Roth IRA income (MAGI) phase-out ranges: contributions shrink across the
// range and stop entirely above it. Married-filing-separately is NOT indexed —
// Notice 2025-67 says it "remains between $0 and $10,000". Traditional-IRA
// DEDUCTION phase-outs are different numbers; do not reuse these for that.
// VERIFY annually against the source above.
export const ROTH_IRA_PHASEOUT_2026 = {
  single: { start: 153000, end: 168000 },
  married: { start: 242000, end: 252000 },
  marriedSeparate: { start: 0, end: 10000 },
} as const;

// ---------------------------------------------------------------------------
// Preformatted limit copy — see the matching block in lib/pay/tsp.ts. Surfaces
// render these strings so no dollar figure is ever restated as a literal.
// ---------------------------------------------------------------------------
const usd0 = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** "$7,500 ($8,600 if 50+)" — headline limit, catch-up as a secondary clause. */
export const IRA_LIMIT_SUMMARY = `${usd0(IRA_CONTRIBUTION_LIMIT_2026)} (${usd0(
  IRA_CONTRIBUTION_LIMIT_2026 + IRA_CATCH_UP_LIMIT_50_PLUS_2026
)} if 50+)`;

/** Lead sentence for any IRA explainer — states the limit first. */
export const IRA_LIMIT_SENTENCE = `2026 limit: ${IRA_LIMIT_SUMMARY} across all your IRAs, traditional and Roth combined.`;

/** Small always-visible hint under a contribution input. */
export const IRA_LIMIT_HINT = `2026 limit: ${IRA_LIMIT_SUMMARY} — ${usd0(
  IRA_CONTRIBUTION_LIMIT_2026 / 12
)}/mo. Separate from the TSP.`;

/** Its own limit, entirely separate from the TSP's. */
export const IRA_SEPARATE_FROM_TSP_NOTE = `This limit is separate from the TSP's — maxing one has no effect on the other.`;

/** Roth eligibility fades at high income; almost no member is affected. */
export const ROTH_IRA_PHASEOUT_NOTE = `Roth IRA contributions phase out from ${usd0(
  ROTH_IRA_PHASEOUT_2026.single.start
)}–${usd0(ROTH_IRA_PHASEOUT_2026.single.end)} of income filing single, ${usd0(
  ROTH_IRA_PHASEOUT_2026.married.start
)}–${usd0(ROTH_IRA_PHASEOUT_2026.married.end)} married filing jointly.`;

export type IraType = "traditional" | "roth";

export const IRA_TYPE_LABELS: Record<IraType, string> = {
  traditional: "Traditional (pre-tax)",
  roth: "Roth (post-tax)",
};

// Typical index-fund expense ratio used as the default fee drag in the
// projector. Broad-market index funds/ETFs at the big brokerages cluster in
// the 0.02%–0.10% range; actively-managed funds and robo/advisory services
// run far higher.
export const DEFAULT_IRA_EXPENSE_RATIO_PCT = 0.05;

// Rough context for what the large self-directed IRA providers charge.
// These are planning-level ranges for broad index funds/ETFs, not quotes —
// always confirm with the institution (see IRA_FEE_DISCLAIMER).
export const IRA_PROVIDER_CONTEXT: {
  name: string;
  indexExpenseRatioPct: string;
  accountFee: string;
  advisoryNote: string;
}[] = [
  {
    name: "Vanguard",
    indexExpenseRatioPct: "≈ 0.03–0.10%",
    accountFee: "$0 for most IRAs with e-delivery",
    advisoryNote: "Optional advisory service ≈ 0.30%/yr (Personal Advisor tiers vary).",
  },
  {
    name: "Charles Schwab",
    indexExpenseRatioPct: "≈ 0.02–0.08%",
    accountFee: "$0 account minimum / maintenance",
    advisoryNote: "Robo (Intelligent Portfolios) $0 advisory fee; premium tiers charge subscriptions.",
  },
  {
    name: "Fidelity",
    indexExpenseRatioPct: "≈ 0.00–0.08%",
    accountFee: "$0 account fee",
    advisoryNote: "Robo (Fidelity Go) free under $25k, then ≈ 0.35%/yr.",
  },
];

export const IRA_FEE_DISCLAIMER =
  "Fee ranges are planning-level estimates for broad index funds at large brokerages. Actual " +
  "expense ratios, advisory fees, trading costs, and account minimums differ by fund and " +
  "account type — confirm the exact numbers with your banking institution or brokerage " +
  "before investing.";

// What the expected-return default means, for UI hints.
export const IRA_RETURN_NOTE =
  "Default assumes a broad U.S. stock index fund (S&P 500-style) at its long-run average " +
  "return, before inflation. Any given year — or decade — can be far above or below it.";
