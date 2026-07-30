// lib/export/timeline-csv.ts
// Flat CSV of the promotion + milestone timeline. Leads with a SUMMARY block
// (path, contract end, final pay) so the conclusions come before the events.

import { TimelineResult, TimelineInputs, EventKind } from "@/lib/promotion/timeline";
import { formatPlain } from "./summary";
import { timelineOverview } from "./overview";

const KIND_LABEL: Record<EventKind, string> = {
  start: "Start",
  promotion: "Promotion",
  "early-promotion": "Early promotion",
  "gi-bill": "GI Bill",
  service: "Service milestone",
  retirement: "Retirement",
  today: "Today",
};

function cell(value: string | number): string {
  let s = String(value);
  // Neutralize spreadsheet formula injection (leading = + - @ / tab / CR),
  // leaving plain numbers alone. See lib/export/csv.ts for rationale.
  if (/^[=+\-@\t\r]/.test(s) && !/^[-+]?(?:\d+\.?\d*|\.\d+)$/.test(s)) {
    s = `'${s}`;
  }
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function row(cells: Array<string | number>): string {
  return cells.map(cell).join(",");
}

export function generateTimelineCsv(
  result: TimelineResult,
  inputs: TimelineInputs,
  generatedOn: string
): string {
  const lines: string[] = [];

  // High-level summary first — where the path leads, when the contract ends,
  // and what the final pay looks like.
  lines.push(row(["SUMMARY", "", ""]));
  lines.push(row(["Item", "Value", "What it means"]));
  for (const item of timelineOverview(result, inputs)) {
    lines.push(row([item.label, item.value, item.explanation]));
  }
  lines.push("");

  lines.push(row(["Field", "Value"]));
  lines.push(row(["Branch", result.branchLabel]));
  lines.push(row(["Track", inputs.track === "officer" ? "Officer" : "Enlisted"]));
  lines.push(row(["Start grade", result.startGrade]));
  lines.push(row([inputs.track === "officer" ? "Date commissioned" : "Date entered service", inputs.accessionDate]));
  lines.push(row(["Current obligation (years)", inputs.contractYears]));
  lines.push(row(["20-year scenario final grade", result.finalGrade]));
  lines.push(row(["Generated", generatedOn]));
  lines.push(row(["Assumptions", "Planning estimate; strongest for enlisted planning. Officer mode is a broad commissioned-service sketch."]));

  lines.push("");
  lines.push(
    row(["Date", "Time in service", "Event", "Detail", "Grade", "Monthly base pay", "Change", "Type", "Estimate"])
  );
  for (const e of result.events) {
    lines.push(
      row([
        e.dateISO,
        e.sinceStart,
        e.title,
        e.detail ?? "",
        e.grade ?? "",
        e.monthlyBasePay != null ? formatPlain(e.monthlyBasePay) : "",
        e.payDelta != null ? formatPlain(e.payDelta) : "",
        KIND_LABEL[e.kind],
        e.estimate ? "Yes" : "No",
      ])
    );
  }

  return lines.join("\n") + "\n";
}
