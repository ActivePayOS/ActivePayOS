import { NextRequest, NextResponse } from "next/server";
import basepay2026 from "@/data/basepay/2026.json";
import { BRANCHES, BranchId, Track, START_GRADES } from "@/data/promotion/timing";
import { buildPromotionTimeline, TimelineInputs } from "@/lib/promotion/timeline";
import { BasePayDataset } from "@/lib/pay/basepay-lookup";
import { generateTimelineCsv } from "@/lib/export/timeline-csv";
import { generateTimelineTxt } from "@/lib/export/timeline-txt";
import { generateTimelinePdf } from "@/lib/export/timeline-pdf";

export const runtime = "nodejs"; // pdf-lib needs Node runtime

type ExportFormat = "csv" | "txt" | "pdf";

type Payload = Partial<TimelineInputs> & { format?: ExportFormat };

function fileResponse(body: string | Uint8Array, contentType: string, filename: string) {
  let payload: BodyInit;
  if (typeof body === "string") {
    payload = body;
  } else {
    const bytes = new Uint8Array(body.length);
    bytes.set(body);
    payload = new Blob([bytes], { type: contentType });
  }
  return new NextResponse(payload, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

function isISODate(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

// Reject oversized bodies before parsing (cheap DoS guard on a compute route).
const MAX_BODY_BYTES = 32 * 1024;

export async function POST(req: NextRequest) {
  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Request body too large" }, { status: 413 });
  }

  let body: Payload;
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "Request body too large" }, { status: 413 });
    }
    body = JSON.parse(raw) as Payload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const branch = body.branch as BranchId;
  if (!branch || !(branch in BRANCHES)) {
    return NextResponse.json({ error: "Invalid branch" }, { status: 400 });
  }
  const track: Track = body.track === "officer" ? "officer" : "enlisted";

  const startGrade = String(body.startGrade ?? "");
  if (!START_GRADES[track].includes(startGrade)) {
    return NextResponse.json({ error: "Invalid start grade for track" }, { status: 400 });
  }

  if (!isISODate(body.accessionDate)) {
    return NextResponse.json({ error: "Invalid accession date" }, { status: 400 });
  }

  const contractYears = Number(body.contractYears);
  if (!Number.isFinite(contractYears) || contractYears < 1 || contractYears > 30) {
    return NextResponse.json({ error: "Invalid contract length" }, { status: 400 });
  }

  const todayISO = isISODate(body.todayISO)
    ? body.todayISO
    : new Date().toISOString().slice(0, 10);

  const inputs: TimelineInputs = {
    branch,
    track,
    startGrade,
    accessionDate: body.accessionDate,
    contractYears,
    todayISO,
  };

  const generatedOn = todayISO;
  const format: ExportFormat = body.format === "pdf" || body.format === "txt" ? body.format : "csv";
  // branch and startGrade are validated against allow-lists above, so the
  // filename is safe to build from them directly.
  const nameBase = `activepayos_PromotionTimeline_${branch}_${startGrade}`;

  try {
    const result = buildPromotionTimeline(inputs, basepay2026 as unknown as BasePayDataset);
    if (format === "csv") {
      return fileResponse(generateTimelineCsv(result, inputs, generatedOn), "text/csv; charset=utf-8", `${nameBase}.csv`);
    }
    if (format === "txt") {
      return fileResponse(generateTimelineTxt(result, inputs, generatedOn), "text/plain; charset=utf-8", `${nameBase}.txt`);
    }
    const pdf = await generateTimelinePdf(result, inputs, generatedOn);
    return fileResponse(pdf, "application/pdf", `${nameBase}.pdf`);
  } catch (err) {
    console.error("[export-timeline] file generation failed:", err);
    return NextResponse.json({ error: "Could not generate the export file." }, { status: 500 });
  }
}
