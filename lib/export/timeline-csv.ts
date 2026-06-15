// lib/export/timeline-csv.ts
// Flat CSV of the promotion + milestone timeline.

import { TimelineResult, TimelineInputs, EventKind } from "@/lib/promotion/timeline";
import { formatPlain } from "./summary";

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
  const s = String(value);
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

  lines.push(row(["Field", "Value"]));
  lines.push(row(["Branch", result.branchLabel]));
  lines.push(row(["Track", inputs.track === "officer" ? "Officer" : "Enlisted"]));
  lines.push(row(["Start grade", result.startGrade]));
  lines.push(row(["Accession date", inputs.accessionDate]));
  lines.push(row(["Contract length (years)", inputs.contractYears]));
  lines.push(row(["Projected final grade", result.finalGrade]));
  lines.push(row(["Generated", generatedOn]));

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
