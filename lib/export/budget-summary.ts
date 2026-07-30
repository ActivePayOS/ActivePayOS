// lib/export/budget-summary.ts
// Minimalist budget exports (CSV / TXT) plus a combined Pay + Budget report.
// Pure string builders — generated entirely in the browser so the Budget
// Builder's "nothing sent to a server" promise holds for exports too.

import { PaySummary, formatUsd, formatPlain } from "./summary";
import { budgetOverview } from "./overview";
import { glossaryFor } from "./glossary";

export type BudgetLine = { label: string; monthly: number };

export type BudgetExport = {
  generatedOn: string; // YYYY-MM-DD
  income: BudgetLine[];
  expenses: BudgetLine[];
  totalIncome: number;
  totalExpense: number;
  leftover: number; // income - expense
  // When present, the export is a combined Pay + Budget report.
  pay?: PaySummary;
};

// -------------------------------------------------------------------- CSV ---

function csvCell(value: string | number): string {
  let s = String(value);
  // Neutralize spreadsheet formula injection (mirrors lib/export/csv.ts).
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

export function generateBudgetCsv(b: BudgetExport): string {
  const lines: string[] = [];

  lines.push(row(["ActivePayOS Budget"]));
  lines.push(row(["Generated", b.generatedOn]));

  // High-level summary first: leftover / income / expenses with what they mean.
  lines.push("");
  lines.push(row(["SUMMARY", "", ""]));
  lines.push(row(["Item", "Value", "What it means"]));
  for (const item of budgetOverview(b)) {
    lines.push(row([item.label, item.value, item.explanation]));
  }

  if (b.pay) {
    lines.push("");
    lines.push(row(["Pay context", ""]));
    lines.push(row(["Year", b.pay.year]));
    lines.push(row(["Grade", b.pay.grade]));
    lines.push(row(["Years of Service", b.pay.yosLabel]));
    lines.push(row(["Location", b.pay.location]));
    lines.push(row(["State of Legal Residence", b.pay.stateOfLegalResidence]));
  }

  lines.push("");
  lines.push(row(["Income", "Monthly (USD)", "Annual (USD)", "What it is"]));
  for (const l of b.income) {
    lines.push(row([l.label, formatPlain(l.monthly), formatPlain(l.monthly * 12), glossaryFor(l.label) ?? ""]));
  }
  lines.push(row(["Total income", formatPlain(b.totalIncome), formatPlain(b.totalIncome * 12), ""]));

  lines.push("");
  lines.push(row(["Expense", "Monthly (USD)", "Annual (USD)", "What it is"]));
  for (const l of b.expenses) {
    lines.push(row([l.label, formatPlain(l.monthly), formatPlain(l.monthly * 12), glossaryFor(l.label) ?? ""]));
  }
  lines.push(row(["Total expenses", formatPlain(b.totalExpense), formatPlain(b.totalExpense * 12), ""]));

  lines.push("");
  lines.push(row(["Leftover (income - expenses)", formatPlain(b.leftover), formatPlain(b.leftover * 12)]));

  // Money flow — the Sankey as data: each source into the pool, then out to each
  // category. Lets a spreadsheet or another tool reconstruct the diagram.
  lines.push("");
  lines.push(row(["Money flow"]));
  lines.push(row(["From", "To", "Monthly (USD)"]));
  for (const l of b.income) {
    lines.push(row([l.label, "Total Income", formatPlain(l.monthly)]));
  }
  for (const l of b.expenses) {
    lines.push(row(["Total Income", l.label, formatPlain(l.monthly)]));
  }
  if (b.leftover > 0) {
    lines.push(row(["Total Income", "Leftover / Unallocated", formatPlain(b.leftover)]));
  } else if (b.leftover < 0) {
    // Overspent: outflows exceed income, so a shortfall edge feeds the pool —
    // income + overspend = expenses, and a reconstructed Sankey balances.
    lines.push(row(["Overspent (not covered by income)", "Total Income", formatPlain(-b.leftover)]));
  }

  return lines.join("\n") + "\n";
}

// -------------------------------------------------------------------- TXT ---

function padRight(s: string, width: number): string {
  return s.length >= width ? s : s + " ".repeat(width - s.length);
}
function padLeft(s: string, width: number): string {
  return s.length >= width ? s : " ".repeat(width - s.length) + s;
}

function section(title: string, rows: BudgetLine[], total: BudgetLine): string[] {
  const all = [...rows, total];
  const nameWidth = Math.max(title.length, ...all.map((l) => l.label.length)) + 2;
  const monthlyStrs = all.map((l) => formatUsd(l.monthly));
  const annualStrs = all.map((l) => formatUsd(l.monthly * 12));
  const mW = Math.max("Monthly".length, ...monthlyStrs.map((s) => s.length)) + 2;
  const aW = Math.max("Annual".length, ...annualStrs.map((s) => s.length)) + 2;
  const rule = nameWidth + mW + aW;

  const tRow = (name: string, m: string, a: string) =>
    padRight(name, nameWidth) + padLeft(m, mW) + padLeft(a, aW);

  const out: string[] = [];
  out.push(tRow(title, "Monthly", "Annual"));
  out.push("-".repeat(rule));
  rows.forEach((l, i) => {
    out.push(tRow(l.label, monthlyStrs[i], annualStrs[i]));
    const note = glossaryFor(l.label);
    if (note) out.push(`    - ${note}`);
  });
  out.push("-".repeat(rule));
  out.push(tRow(total.label, monthlyStrs[all.length - 1], annualStrs[all.length - 1]));
  return out;
}

export function generateBudgetTxt(b: BudgetExport): string {
  const out: string[] = [];
  out.push("ActivePayOS - Budget Summary");
  out.push("============================");
  out.push("");

  // Headline block first: leftover / income / expenses with what they mean.
  out.push("SUMMARY");
  const overview = budgetOverview(b);
  const ovWidth = Math.max(...overview.map((o) => o.label.length)) + 2;
  for (const o of overview) {
    out.push(`${padRight(o.label + ":", ovWidth)} ${o.value}`);
    out.push(`${" ".repeat(ovWidth + 1)}- ${o.explanation}`);
  }
  out.push("");

  if (b.pay) {
    const ctx: Array<[string, string]> = [
      ["Year", String(b.pay.year)],
      ["Grade", b.pay.grade],
      ["Years of Service", b.pay.yosLabel],
      ["Location", b.pay.location],
      ["State of Legal Residence", b.pay.stateOfLegalResidence],
      ["Generated", b.generatedOn],
    ];
    const w = Math.max(...ctx.map(([k]) => k.length)) + 2;
    for (const [k, v] of ctx) out.push(`${padRight(k + ":", w)} ${v}`);
  } else {
    out.push(`Generated: ${b.generatedOn}`);
  }
  out.push("");

  out.push(...section("Income", b.income, { label: "Total income", monthly: b.totalIncome }));
  out.push("");
  out.push(...section("Expenses", b.expenses, { label: "Total expenses", monthly: b.totalExpense }));
  out.push("");

  const verb = b.leftover < 0 ? "Overspent" : "Leftover";
  out.push(`${verb}: ${formatUsd(Math.abs(b.leftover))}/mo (${formatUsd(Math.abs(b.leftover) * 12)}/yr)`);
  out.push("");

  out.push("Planning estimate only - the numbers are whatever you entered.");
  out.push("Verify pay figures against your LES / myPay.");
  out.push("Generated by ActivePayOS - https://activepayos.com");
  out.push("");

  return out.join("\n");
}
