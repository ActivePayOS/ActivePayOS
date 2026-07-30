// lib/export/overview.ts
// Shared high-level summary blocks: every export format leads with one of
// these so the big picture comes before the detail tables ("summary up top,
// detail after"). Each item pairs a headline number with a plain-English
// explanation, rendered per format as:
//   CSV  - a SUMMARY section with a "What it means" column
//   TXT  - a headline block with indented explanations
//   PDF  - a stat band (the pattern proven in lib/export/projection-pdf.ts)
//   XLSX - a computed "Summary" sheet

import { PaySummary, formatUsd } from "./summary";
import type { BudgetExport } from "./budget-summary";
import type { ProjectionExport } from "./projection";
import type { TimelineResult, TimelineInputs } from "@/lib/promotion/timeline";

export type OverviewItem = { label: string; value: string; explanation: string };

// ------------------------------------------------------------------- pay ---

export function payOverview(summary: PaySummary): OverviewItem[] {
  const allowances = summary.lines
    .filter((l) => /^ba[hs]\b/i.test(l.label))
    .reduce((a, l) => a + l.monthly, 0);
  return [
    {
      label: "Total monthly pay",
      value: formatUsd(summary.total.monthly),
      explanation:
        "Base pay plus allowances - gross monthly pay before taxes and deductions.",
    },
    {
      label: "Annual total",
      value: formatUsd(summary.total.annual),
      explanation:
        "The monthly total x 12. Actual annual figures vary with mid-year raises, promotions, and PCS moves.",
    },
    ...(allowances > 0
      ? [
          {
            label: "Tax-free allowances (BAH + BAS)",
            value: `${formatUsd(allowances)}/mo`,
            explanation:
              "BAH and BAS are allowances, not taxable wages - they are not subject to federal income tax.",
          },
        ]
      : []),
    {
      label: "Scenario",
      value: `${summary.grade} - ${summary.yosLabel} YOS - ${summary.year}`,
      explanation:
        "Grade and years of service set base pay in the DFAS table; the duty ZIP and dependency status set BAH.",
    },
  ];
}

// ---------------------------------------------------------------- budget ---

export function budgetOverview(b: BudgetExport): OverviewItem[] {
  const over = b.leftover < 0;
  return [
    {
      label: over ? "Overspent" : "Leftover (income - expenses)",
      value: `${formatUsd(Math.abs(b.leftover))}/mo (${formatUsd(Math.abs(b.leftover) * 12)}/yr)`,
      explanation: over
        ? "Expenses exceed income by this much every month - trim categories or add income to balance the plan."
        : "Money without a job yet - assign it to savings, investing, or a goal so it doesn't drift away.",
    },
    {
      label: "Total income",
      value: `${formatUsd(b.totalIncome)}/mo`,
      explanation: `Everything coming in each month across ${b.income.length} income source${b.income.length === 1 ? "" : "s"}.`,
    },
    {
      label: "Total expenses",
      value: `${formatUsd(b.totalExpense)}/mo`,
      explanation: `Everything going out each month across ${b.expenses.length} categor${b.expenses.length === 1 ? "y" : "ies"}, including taxes and savings you assign.`,
    },
    ...(b.totalIncome > 0
      ? [
          {
            label: "Share of income unspent",
            value: `${Math.round((b.leftover / b.totalIncome) * 100)}%`,
            explanation:
              "Leftover as a share of income - a quick health check; 20% or more headed to savings is a strong position.",
          },
        ]
      : []),
  ];
}

// ------------------------------------------------------------ projection ---

export function projectionOverview(p: ProjectionExport): OverviewItem[] {
  const s = p.scenario;
  const t = p.totals;
  const r = p.rothTradeoff;
  return [
    {
      label: `Projected total (${s.endYear})`,
      value: formatUsd(t.final),
      explanation:
        "Everything combined - TSP, IRA, 401(k), investments, and savings - at the end of the horizon, in future (nominal) dollars.",
    },
    {
      label: "In today's dollars",
      value: formatUsd(t.finalReal),
      explanation: `The same total deflated by the ${s.inflationPct}%/yr inflation assumption - what it would buy in today's money.`,
    },
    ...(t.atSeparation !== null && t.separationYear !== null
      ? [
          {
            label: `At separation (${t.separationYear})`,
            value: formatUsd(t.atSeparation),
            explanation:
              "Your combined balance the year you leave the service - after this, military pay and TSP contributions stop and balances keep compounding.",
          },
        ]
      : []),
    {
      label: "Total contributed",
      value: formatUsd(t.contributed),
      explanation: "Every dollar put in over the horizon, including starting balances.",
    },
    {
      label: "Market growth",
      value: formatUsd(t.growth),
      explanation: "Projected total minus contributions - the part compound growth did.",
    },
    {
      label: "BRS agency match received",
      value: formatUsd(t.agencyMatch),
      explanation:
        "BRS agency money: 1% of base pay automatic plus a match worth up to another 4% when you contribute at least 5%.",
    },
    ...(typeof t.employeeTsp === "number" && t.employeeTsp > 0
      ? [
          {
            label: "Your TSP contributions while serving",
            value: formatUsd(t.employeeTsp),
            explanation:
              "What you put into the TSP from base pay over the service window - the agency match line is what the government added on top.",
          },
        ]
      : []),
    ...(p.pension
      ? [
          {
            label: `Estimated military pension (${p.pension.serviceYearsTotal} yrs)`,
            value: `${formatUsd(p.pension.monthlyPension)}/mo`,
            explanation: p.pension.note,
          },
        ]
      : []),
    ...(p.fees
      ? [
          {
            label: "Estimated fee drag",
            value: formatUsd(p.fees.estimatedFeeDrag),
            explanation:
              "What fund expense ratios cost in ending balance over this horizon, versus fee-free growth.",
          },
        ]
      : []),
    ...(r
      ? [
          {
            label: "Roth vs Traditional",
            value:
              r.winner === "even"
                ? "Effectively even at these tax rates"
                : `${r.winner === "roth" ? "Roth" : "Traditional"} ahead by ~${formatUsd(r.advantage)}`,
            explanation:
              "Same dollars in either way - the winner is decided by which tax rate is higher, today's or retirement's.",
          },
        ]
      : []),
  ];
}

// -------------------------------------------------------------- timeline ---

export function timelineOverview(result: TimelineResult, inputs: TimelineInputs): OverviewItem[] {
  const lastPaid = result.events
    .filter((e) => e.monthlyBasePay != null)
    .sort((a, b) => a.monthsFromStart - b.monthsFromStart)
    .pop();
  return [
    {
      label: "Projected path",
      value: `${result.branchLabel}: ${result.startGrade} -> ${result.finalGrade}`,
      explanation:
        "Start grade to the final grade a typical 20-year career reaches on this branch's promotion timing - board/exam-driven steps are not guaranteed.",
    },
    {
      label: "Contract end (ETS / EAOS)",
      value: result.etsDateISO,
      explanation: `End of the ${inputs.contractYears}-year service commitment - the first big stay-or-go decision point.`,
    },
    ...(lastPaid && lastPaid.monthlyBasePay != null
      ? [
          {
            label: `Final base pay (20-yr scenario${lastPaid.grade ? `, ${lastPaid.grade}` : ""})`,
            value: `${formatUsd(lastPaid.monthlyBasePay)}/mo`,
            explanation:
              "Monthly base pay at the final projected grade, in today's pay-table dollars - allowances (BAH/BAS) come on top.",
          },
        ]
      : []),
    {
      label: "20-year retirement eligibility",
      value: result.retirementDateISO,
      explanation: "Twenty years of service - the earliest date a military retirement pension can start.",
    },
  ];
}
