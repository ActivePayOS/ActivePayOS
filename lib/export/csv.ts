// lib/export/csv.ts
// Minimalist CSV: a SUMMARY block up top (headline numbers with plain-English
// notes), then the context block and the flat Monthly/Annual pay table.
// Universal and import-friendly (Excel, Google Sheets, YNAB, Monarch, etc.).

import { PaySummary, formatPlain } from "./summary";
import { payOverview } from "./overview";
import { glossaryFor } from "./glossary";

function csvCell(value: string | number): string {
  let s = String(value);
  // Neutralize spreadsheet formula injection: a cell beginning with = + - @
  // (or a tab/CR) can execute as a formula when opened in Excel/Sheets. Prefix
  // such cells with an apostrophe, but leave plain numbers (incl. negatives)
  // untouched so numeric columns still parse.
  if (/^[=+\-@\t\r]/.test(s) && !/^[-+]?(?:\d+\.?\d*|\.\d+)$/.test(s)) {
    s = `'${s}`;
  }
  // Quote when the cell contains a comma, quote, or newline (RFC 4180).
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function row(cells: Array<string | number>): string {
  return cells.map(csvCell).join(",");
}

export function generatePayCsv(summary: PaySummary): string {
  const lines: string[] = [];

  // High-level summary first — the big numbers with what they mean.
  lines.push(row(["SUMMARY", "", ""]));
  lines.push(row(["Item", "Value", "What it means"]));
  for (const item of payOverview(summary)) {
    lines.push(row([item.label, item.value, item.explanation]));
  }
  lines.push("");

  // Context block (Field,Value)
  lines.push(row(["Field", "Value"]));
  lines.push(row(["Year", summary.year]));
  lines.push(row(["Grade", summary.grade]));
  lines.push(row(["Years of Service", summary.yosLabel]));
  lines.push(row(["Location", summary.location]));
  lines.push(row(["Dependents", summary.dependents ? "Yes" : "No"]));
  lines.push(row(["State of Legal Residence", summary.stateOfLegalResidence]));
  lines.push(row(["Generated", summary.generatedOn]));

  // Blank separator row, then the pay table (with a plain-English note per
  // component, sourced from the site's i-dot popovers).
  lines.push("");
  lines.push(row(["Pay Component", "Monthly (USD)", "Annual (USD)", "What it is"]));
  for (const l of summary.lines) {
    lines.push(row([l.label, formatPlain(l.monthly), formatPlain(l.annual), glossaryFor(l.label) ?? ""]));
  }
  lines.push(
    row([
      summary.total.label,
      formatPlain(summary.total.monthly),
      formatPlain(summary.total.annual),
      glossaryFor(summary.total.label) ?? "",
    ])
  );

  // Trailing newline for well-behaved parsers.
  return lines.join("\n") + "\n";
}
