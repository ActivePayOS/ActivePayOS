// Civilian IRA reference data.
//
// Shared by the Budget Builder (sweep leftover money into an IRA) and the
// Wealth Projector (IRA account that can keep receiving contributions after
// separation). Like lib/pay/tsp.ts, the dated IRS figure is isolated and
// flagged for annual verification.

// 2026 IRS IRA contribution limit (traditional + Roth combined, under age 50).
// VERIFY against IRS guidance each year (2025 = $7,000). Age-50+ catch-up is
// separate and not modeled here. Roth IRA eligibility also phases out at
// higher incomes — most junior/mid-career service members are unaffected.
export const IRA_CONTRIBUTION_LIMIT_2026 = 7500;

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
