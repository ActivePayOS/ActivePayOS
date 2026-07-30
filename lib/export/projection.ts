// lib/export/projection.ts
// Wealth Projector exports (CSV / TXT). Pure string builders — generated
// entirely in the browser, mirroring lib/export/budget-summary.ts.
// Summary-first: totals, fees, and the Roth verdict lead; the year-by-year
// table is detail that follows.

import { formatPlain, formatUsd } from "./summary";
import { projectionOverview } from "./overview";
import { glossaryFor } from "./glossary";

export type ProjectionYearLine = {
  year: number;
  age: number;
  serving: boolean;
  grade: string;
  basePayMonthly: number;
  tsp: number;
  ira: number;
  k401: number;
  invest: number;
  savings: number;
  total: number;
  realTotal: number;
};

/** Fund/management fee disclosure carried into the report. */
export type FeeSection = {
  tspExpenseRatioPct: number;
  iraExpenseRatioPct: number | null;
  /** Estimated dollars lost to fees over the horizon (fee-free minus net). */
  estimatedFeeDrag: number;
  notes: string[];
};

/** Roth vs. Traditional trade-space summary carried into the report. */
export type RothSection = {
  monthlyContribution: number;
  yearsContributing: number;
  yearsToWithdrawal: number;
  annualReturnPct: number;
  taxRateNowPct: number;
  taxRateAtWithdrawalPct: number;
  preTaxBalance: number;
  taxPaidUpFront: number; // Roth path
  deferredTaxBill: number; // Traditional path
  rothAfterTax: number;
  tradAfterTax: number;
  winner: "roth" | "traditional" | "even";
  advantage: number;
};

/** Long-term analysis extras (decade milestones, sustainable income). */
export type LongTermSection = {
  milestones: { age: number; year: number; total: number; realTotal: number }[];
  /** 4%-rule style sustainable annual withdrawal at the horizon. */
  fourPercentAnnual: number;
  fourPercentMonthly: number;
  fourPercentMonthlyReal: number;
  notes: string[];
};

export type ProjectionExport = {
  generatedOn: string; // YYYY-MM-DD
  scenario: {
    branchLabel: string;
    track: string;
    grade: string;
    yos: number;
    currentAge: number;
    serviceYears: number;
    projectionYears: number;
    endYear: number;
    tspPct: number; // decimal
    brs: boolean;
    tspReturnPct: number;
    invReturnPct: number;
    savApyPct: number;
    iraMonthly?: number;
    iraUntilAge?: number;
    iraReturnPct?: number;
    k401Monthly?: number;
    k401UntilAge?: number;
    k401ReturnPct?: number;
    /** Roth/Traditional election assumed for the civilian 401(k). */
    k401Type?: "traditional" | "roth";
    inflationPct: number;
    payRaisePct: number;
    modelPromotions: boolean;
  };
  /**
   * Which optional accounts are switched ON in the tool (mirrors the
   * on-screen table): builders should drop the Investments/Savings columns
   * when the account is off. Absent = both on (legacy payloads).
   */
  activeAccounts?: { invest: boolean; savings: boolean };
  promotions: { year: number; grade: string; competitive: boolean }[];
  years: ProjectionYearLine[];
  totals: {
    final: number;
    finalReal: number;
    atSeparation: number | null;
    separationYear: number | null;
    contributed: number;
    growth: number;
    agencyMatch: number;
    /** Member's own TSP contributions over the service window (pairs with agencyMatch). */
    employeeTsp?: number;
  };
  /** High-3 pension ballpark, present when the scenario reaches 20+ total years. */
  pension?: {
    /** 2.5 (legacy High-3) or 2.0 (BRS) percent per year of service. */
    multiplierPct: number;
    serviceYearsTotal: number;
    /** Final projected base pay, used as the High-3 proxy. */
    high3MonthlyBase: number;
    monthlyPension: number;
    note: string;
  };
  fees?: FeeSection;
  rothTradeoff?: RothSection;
  longTerm?: LongTermSection;
};

/** Whether any year holds IRA / 401(k) money (drives optional columns). */
export function activeExtraAccounts(p: ProjectionExport): { ira: boolean; k401: boolean } {
  return {
    ira: p.years.some((y) => y.ira > 0.5),
    k401: p.years.some((y) => y.k401 > 0.5),
  };
}

/**
 * Full column gating, aligned with the on-screen table: IRA/401(k) appear when
 * funded; Investments/Savings hide when the tool switched the account off
 * (activeAccounts flag) AND it never holds money.
 */
export function activeColumns(p: ProjectionExport): {
  ira: boolean;
  k401: boolean;
  invest: boolean;
  savings: boolean;
} {
  const extras = activeExtraAccounts(p);
  return {
    ...extras,
    invest: (p.activeAccounts?.invest ?? true) || p.years.some((y) => y.invest > 0.5),
    savings: (p.activeAccounts?.savings ?? true) || p.years.some((y) => y.savings > 0.5),
  };
}

// -------------------------------------------------------------------- CSV ---

function csvCell(value: string | number): string {
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s) && !/^[-+]?(?:\d+\.?\d*|\.\d+)$/.test(s)) {
    s = `'${s}`;
  }
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function row(cells: Array<string | number>): string {
  return cells.map(csvCell).join(",");
}

export function generateProjectionCsv(p: ProjectionExport): string {
  const s = p.scenario;
  const lines: string[] = [];

  lines.push(row(["ActivePayOS Wealth Projection"]));
  lines.push(row(["Generated", p.generatedOn]));

  // High-level summary first — every headline number with what it means.
  lines.push("");
  lines.push(row(["SUMMARY", "", ""]));
  lines.push(row(["Item", "Value", "What it means"]));
  for (const item of projectionOverview(p)) {
    lines.push(row([item.label, item.value, item.explanation]));
  }

  lines.push("");
  lines.push(row(["Scenario", ""]));
  lines.push(row(["Branch", s.branchLabel]));
  lines.push(row(["Track", s.track]));
  lines.push(row(["Current grade", s.grade]));
  lines.push(row(["Current years of service", s.yos]));
  lines.push(row(["Current age", s.currentAge]));
  lines.push(row(["Years staying in", s.serviceYears]));
  lines.push(row(["Projection horizon (years)", s.projectionYears]));
  lines.push(row(["Projected through", s.endYear]));
  lines.push(row(["TSP contribution (% of base pay)", s.tspPct * 100]));
  lines.push(row(["BRS agency contributions", s.brs ? "Yes" : "No"]));
  lines.push(row(["Assumed TSP return (%/yr)", s.tspReturnPct]));
  lines.push(row(["Assumed investment return (%/yr)", s.invReturnPct]));
  lines.push(row(["Savings APY (%)", s.savApyPct]));
  if (s.iraMonthly && s.iraMonthly > 0) {
    lines.push(row(["Civilian IRA contribution (USD/mo)", formatPlain(s.iraMonthly)]));
    if (s.iraUntilAge) lines.push(row(["IRA contributions until age", s.iraUntilAge]));
    if (typeof s.iraReturnPct === "number")
      lines.push(row(["Assumed IRA return, net of fees (%/yr)", s.iraReturnPct]));
  }
  if (s.k401Monthly && s.k401Monthly > 0) {
    lines.push(row(["Civilian 401(k) after service (USD/mo, incl. employer match)", formatPlain(s.k401Monthly)]));
    if (s.k401UntilAge) lines.push(row(["401(k) contributions until age", s.k401UntilAge]));
    if (typeof s.k401ReturnPct === "number")
      lines.push(row(["Assumed 401(k) return (%/yr)", s.k401ReturnPct]));
    if (s.k401Type)
      lines.push(row(["401(k) type assumed", s.k401Type === "roth" ? "Roth" : "Traditional"]));
  }
  lines.push(row(["Inflation assumption (%/yr)", s.inflationPct]));
  lines.push(row(["Assumed annual military pay raise (%)", s.payRaisePct]));
  lines.push(row(["Typical promotions modeled", s.modelPromotions ? "Yes" : "No"]));

  if (p.promotions.length > 0) {
    lines.push("");
    lines.push(row(["Projected promotions", ""]));
    for (const promo of p.promotions) {
      lines.push(
        row([promo.grade, promo.year, promo.competitive ? "board/exam-driven (not guaranteed)" : "largely time-based"])
      );
    }
  }

  // ---- Totals, fees, and the Roth verdict — hoisted ABOVE the year table
  // so the conclusions come before the detail. Each line carries a
  // plain-English note where the glossary knows the term.
  lines.push("");
  lines.push(row(["Totals", "", "What it is"]));
  const totalRow = (label: string, value: string) =>
    lines.push(row([label, value, glossaryFor(label) ?? ""]));
  if (p.totals.atSeparation !== null && p.totals.separationYear !== null) {
    totalRow(`At separation (${p.totals.separationYear})`, formatPlain(p.totals.atSeparation));
  }
  totalRow(`Projected total (${s.endYear})`, formatPlain(p.totals.final));
  totalRow("In today's dollars", formatPlain(p.totals.finalReal));
  totalRow("Total contributed (incl. starting balances)", formatPlain(p.totals.contributed));
  totalRow("Market growth", formatPlain(p.totals.growth));
  totalRow("BRS agency match received", formatPlain(p.totals.agencyMatch));
  if (typeof p.totals.employeeTsp === "number" && p.totals.employeeTsp > 0) {
    totalRow("Your TSP contributions while serving", formatPlain(p.totals.employeeTsp));
  }
  if (p.pension) {
    lines.push(
      row([
        `Estimated military pension at ${p.pension.serviceYearsTotal} years (USD/mo)`,
        formatPlain(p.pension.monthlyPension),
        p.pension.note,
      ])
    );
  }

  if (p.fees) {
    lines.push("");
    lines.push(row(["Fund management fees", ""]));
    lines.push(row(["TSP expense ratio (%/yr)", p.fees.tspExpenseRatioPct]));
    if (p.fees.iraExpenseRatioPct !== null) {
      lines.push(row(["IRA expense ratio (%/yr)", p.fees.iraExpenseRatioPct]));
    }
    lines.push(row(["Estimated dollars lost to fees over the horizon", formatPlain(p.fees.estimatedFeeDrag)]));
    for (const n of p.fees.notes) lines.push(row([n]));
  }

  if (p.rothTradeoff) {
    const r = p.rothTradeoff;
    lines.push("");
    lines.push(row(["Roth vs Traditional trade space", ""]));
    lines.push(row(["Monthly contribution (same both ways)", formatPlain(r.monthlyContribution)]));
    lines.push(row(["Years contributing / to withdrawal", `${r.yearsContributing} / ${r.yearsToWithdrawal}`]));
    lines.push(row(["Assumed return (%/yr)", r.annualReturnPct]));
    lines.push(row(["Marginal tax rate today (%)", r.taxRateNowPct]));
    lines.push(row(["Assumed tax rate at withdrawal (%)", r.taxRateAtWithdrawalPct]));
    lines.push(row(["Pre-tax balance at horizon (same both ways)", formatPlain(r.preTaxBalance)]));
    lines.push(row(["Roth: taxes paid up front", formatPlain(r.taxPaidUpFront)]));
    lines.push(row(["Roth: after-tax value at horizon", formatPlain(r.rothAfterTax)]));
    lines.push(row(["Traditional: deferred tax bill at withdrawal", formatPlain(r.deferredTaxBill)]));
    lines.push(row(["Traditional: after-tax value at horizon", formatPlain(r.tradAfterTax)]));
    lines.push(
      row([
        "Verdict",
        r.winner === "even"
          ? "Effectively even at these tax rates"
          : `${r.winner === "roth" ? "Roth" : "Traditional"} ahead by ~${formatPlain(r.advantage)} (net of the up-front tax)`,
      ])
    );
  }

  // ---- Year-by-year detail (after the conclusions) ----
  const cols = activeColumns(p);
  lines.push("");
  lines.push(row(["Year by year", ""]));
  lines.push(
    row([
      "Year",
      "Age",
      "Serving",
      "Grade",
      "Base pay (monthly USD)",
      "TSP (USD)",
      ...(cols.ira ? ["IRA (USD)"] : []),
      ...(cols.k401 ? ["401(k) (USD)"] : []),
      ...(cols.invest ? ["Investments (USD)"] : []),
      ...(cols.savings ? ["Savings (USD)"] : []),
      "Total (USD)",
      "Total (today's USD)",
    ])
  );
  for (const yLine of p.years) {
    lines.push(
      row([
        yLine.year,
        yLine.age,
        yLine.serving ? "Yes" : "No",
        yLine.serving ? yLine.grade : "",
        yLine.serving ? formatPlain(yLine.basePayMonthly) : "",
        formatPlain(yLine.tsp),
        ...(cols.ira ? [formatPlain(yLine.ira)] : []),
        ...(cols.k401 ? [formatPlain(yLine.k401)] : []),
        ...(cols.invest ? [formatPlain(yLine.invest)] : []),
        ...(cols.savings ? [formatPlain(yLine.savings)] : []),
        formatPlain(yLine.total),
        formatPlain(yLine.realTotal),
      ])
    );
  }

  if (p.longTerm) {
    lines.push("");
    lines.push(row(["Long-term analysis", ""]));
    lines.push(row(["Age", "Year", "Total (USD)", "Total (today's USD)"]));
    for (const m of p.longTerm.milestones) {
      lines.push(row([m.age, m.year, formatPlain(m.total), formatPlain(m.realTotal)]));
    }
    lines.push(row(["Sustainable withdrawal at ~4%/yr (annual)", formatPlain(p.longTerm.fourPercentAnnual)]));
    lines.push(row(["Sustainable withdrawal at ~4%/yr (monthly)", formatPlain(p.longTerm.fourPercentMonthly)]));
    lines.push(
      row(["Sustainable monthly withdrawal in today's dollars", formatPlain(p.longTerm.fourPercentMonthlyReal)])
    );
    for (const n of p.longTerm.notes) lines.push(row([n]));
  }

  lines.push("");
  lines.push(
    row([
      "Planning estimate only. Assumed returns are not guarantees; verify data at tsp.gov and DFAS. Generated by ActivePayOS - activepayos.com",
    ])
  );

  // \n across every CSV/TXT builder (one convention product-wide).
  return lines.join("\n") + "\n";
}

// -------------------------------------------------------------------- TXT ---

export function generateProjectionTxt(p: ProjectionExport): string {
  const s = p.scenario;
  const w = 74;
  const div = "-".repeat(w);
  const kv = (label: string, value: string) => `${label.padEnd(44)}${value}`;
  const lines: string[] = [];

  lines.push("ACTIVEPAYOS WEALTH PROJECTION");
  lines.push(`Generated ${p.generatedOn}`);
  lines.push(div);

  // Headline block first: every big number with what it means. The year-by-
  // year table and full trade-space sections follow as detail.
  lines.push("SUMMARY");
  for (const o of projectionOverview(p)) {
    lines.push(kv(o.label, o.value));
    lines.push(`  - ${o.explanation}`);
  }
  lines.push(div);
  lines.push(kv("Scenario", `${s.branchLabel} ${s.grade}, ${s.yos} YOS, age ${s.currentAge}`));
  lines.push(kv("Staying in", `${s.serviceYears} more year(s)`));
  lines.push(kv("Projected through", `${s.endYear} (age ${s.currentAge + s.projectionYears})`));
  lines.push(
    kv("TSP", `${Math.round(s.tspPct * 100)}% of base pay${s.brs ? " + BRS match" : ""} at ${s.tspReturnPct}%/yr`)
  );
  lines.push(kv("Investments / Savings returns", `${s.invReturnPct}%/yr / ${s.savApyPct}% APY`));
  if (s.iraMonthly && s.iraMonthly > 0) {
    lines.push(
      kv(
        "Civilian IRA",
        `${formatUsd(s.iraMonthly)}/mo until age ${s.iraUntilAge ?? "-"} at ${s.iraReturnPct ?? "-"}%/yr (net of fees)`
      )
    );
  }
  if (s.k401Monthly && s.k401Monthly > 0) {
    lines.push(
      kv(
        "Civilian 401(k) after service",
        `${formatUsd(s.k401Monthly)}/mo (incl. match) until age ${s.k401UntilAge ?? "-"} at ${s.k401ReturnPct ?? "-"}%/yr${
          s.k401Type ? ` (${s.k401Type === "roth" ? "Roth" : "Traditional"})` : ""
        }`
      )
    );
  }
  lines.push(kv("Inflation / annual pay raise", `${s.inflationPct}% / ${s.payRaisePct}%`));
  if (p.promotions.length > 0) {
    lines.push(
      kv(
        "Projected promotions",
        p.promotions.map((x) => `${x.grade} ${x.year}${x.competitive ? "*" : ""}`).join(", ") +
          "   (* board-driven, not guaranteed)"
      )
    );
  }
  if (p.fees) {
    lines.push(div);
    lines.push("FUND MANAGEMENT FEES");
    lines.push(kv("TSP expense ratio", `${p.fees.tspExpenseRatioPct}%/yr (~$${(p.fees.tspExpenseRatioPct * 10).toFixed(2)} per $1,000/yr)`));
    if (p.fees.iraExpenseRatioPct !== null) {
      lines.push(kv("IRA expense ratio", `${p.fees.iraExpenseRatioPct}%/yr`));
    }
    lines.push(kv("Est. dollars lost to fees over horizon", formatUsd(p.fees.estimatedFeeDrag)));
    for (const n of p.fees.notes) lines.push(`  - ${n}`);
  }

  if (p.rothTradeoff) {
    const r = p.rothTradeoff;
    lines.push(div);
    lines.push("ROTH VS TRADITIONAL TRADE SPACE");
    lines.push(
      kv(
        "Scenario",
        `${formatUsd(r.monthlyContribution)}/mo for ${r.yearsContributing} yrs, withdrawn after ${r.yearsToWithdrawal} yrs at ${r.annualReturnPct}%/yr`
      )
    );
    lines.push(kv("Tax rate today / at withdrawal", `${r.taxRateNowPct}% / ${r.taxRateAtWithdrawalPct}%`));
    lines.push(kv("Pre-tax balance (same both ways)", formatUsd(r.preTaxBalance)));
    lines.push(kv("Roth: taxes paid up front", formatUsd(r.taxPaidUpFront)));
    lines.push(kv("Roth: after-tax at horizon", formatUsd(r.rothAfterTax)));
    lines.push(kv("Traditional: deferred tax bill", formatUsd(r.deferredTaxBill)));
    lines.push(kv("Traditional: after-tax at horizon", formatUsd(r.tradAfterTax)));
    lines.push(
      kv(
        "Verdict",
        r.winner === "even"
          ? "Effectively even at these tax rates"
          : `${r.winner === "roth" ? "Roth" : "Traditional"} ahead by ~${formatUsd(r.advantage)}`
      )
    );
  }

  // ---- Year-by-year detail (after the conclusions) ----
  const cols = activeColumns(p);
  lines.push(div);
  lines.push("YEAR BY YEAR");
  lines.push(
    [
      "Year",
      "Age",
      "Grade",
      "TSP",
      ...(cols.ira ? ["IRA"] : []),
      ...(cols.k401 ? ["401k"] : []),
      ...(cols.invest ? ["Invest"] : []),
      ...(cols.savings ? ["Savings"] : []),
      "Total",
      "Today's $",
    ]
      .map((h, i) => (i < 3 ? h.padEnd(i === 0 ? 6 : 5) : h.padStart(10)))
      .join("")
  );
  for (const yLine of p.years) {
    lines.push(
      [
        String(yLine.year).padEnd(6),
        String(yLine.age).padEnd(5),
        (yLine.serving ? yLine.grade : "-").padEnd(5),
        formatUsd(yLine.tsp).padStart(10),
        ...(cols.ira ? [formatUsd(yLine.ira).padStart(10)] : []),
        ...(cols.k401 ? [formatUsd(yLine.k401).padStart(10)] : []),
        ...(cols.invest ? [formatUsd(yLine.invest).padStart(10)] : []),
        ...(cols.savings ? [formatUsd(yLine.savings).padStart(10)] : []),
        formatUsd(yLine.total).padStart(10),
        formatUsd(yLine.realTotal).padStart(10),
      ].join("")
    );
  }

  if (p.longTerm) {
    lines.push(div);
    lines.push("LONG-TERM ANALYSIS");
    for (const m of p.longTerm.milestones) {
      lines.push(kv(`Age ${m.age} (${m.year})`, `${formatUsd(m.total)}  (${formatUsd(m.realTotal)} today's $)`));
    }
    lines.push(kv("~4%-rule withdrawal (annual)", formatUsd(p.longTerm.fourPercentAnnual)));
    lines.push(
      kv(
        "~4%-rule withdrawal (monthly)",
        `${formatUsd(p.longTerm.fourPercentMonthly)}  (${formatUsd(p.longTerm.fourPercentMonthlyReal)} today's $)`
      )
    );
    for (const n of p.longTerm.notes) lines.push(`  - ${n}`);
  }

  lines.push(div);
  lines.push("Planning estimate only. Assumed returns are not guarantees; markets vary");
  lines.push("year to year. Verify data at tsp.gov and DFAS.");
  lines.push("Generated by ActivePayOS - activepayos.com");

  // \n across every CSV/TXT builder (one convention product-wide).
  return lines.join("\n") + "\n";
}
