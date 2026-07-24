// lib/export/timeline-pdf.ts
// Vertical timeline PDF of promotions + milestones, drawn with pdf-lib.
// Paginates automatically for long (e.g. 20-year) projections.

import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from "pdf-lib";
import { TimelineResult, TimelineInputs, EventKind } from "@/lib/promotion/timeline";
import { formatUsd } from "./summary";

const PAGE_W = 612;
const PAGE_H = 792;
const M = 50;
const RIGHT = PAGE_W - M;

const INK = rgb(0.11, 0.13, 0.16);
const MUTED = rgb(0.45, 0.48, 0.53);
const LINE = rgb(0.82, 0.85, 0.88);
const NAVY = rgb(0.07, 0.13, 0.29);
const WHITE = rgb(1, 1, 1);
const SUBTLE_WHITE = rgb(0.76, 0.81, 0.89);

type Rgb = ReturnType<typeof rgb>;
type Fonts = { reg: PDFFont; bold: PDFFont };

const KIND_COLOR: Record<EventKind, Rgb> = {
  start: rgb(0.2, 0.22, 0.27),
  promotion: rgb(0.05, 0.42, 0.38),
  "early-promotion": rgb(0.85, 0.55, 0.1),
  "gi-bill": rgb(0.15, 0.35, 0.7),
  service: rgb(0.5, 0.53, 0.58),
  retirement: rgb(0.5, 0.2, 0.55),
  today: rgb(0.8, 0.15, 0.2),
};

const SPINE_X = 168;
const DATE_RIGHT = SPINE_X - 16;
const TEXT_X = SPINE_X + 16;
const TEXT_W = RIGHT - TEXT_X;
const BOTTOM = 64;

function rightText(page: PDFPage, text: string, rx: number, y: number, size: number, font: PDFFont, color: Rgb) {
  page.drawText(text, { x: rx - font.widthOfTextAtSize(text, size), y, size, font, color });
}

function wrap(text: string, font: PDFFont, size: number, maxW: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const trial = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(trial, size) <= maxW) cur = trial;
    else {
      if (cur) lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function drawHeader(
  page: PDFPage,
  f: Fonts,
  result: TimelineResult,
  inputs: TimelineInputs,
  generatedOn: string,
  first: boolean
): number {
  const bandH = first ? 96 : 50;
  page.drawRectangle({ x: 0, y: PAGE_H - bandH, width: PAGE_W, height: bandH, color: NAVY });
  page.drawRectangle({ x: 0, y: PAGE_H - bandH, width: PAGE_W, height: 4, color: KIND_COLOR.promotion });

  page.drawText("Career Milestone Planner", { x: M, y: PAGE_H - 34, size: first ? 19 : 14, font: f.bold, color: WHITE });
  if (first) {
    const sub = `${result.branchLabel}  -  ${inputs.track === "officer" ? "Officer sketch" : "Enlisted planning"}  -  start ${result.startGrade}  ->  20-yr scenario ${result.finalGrade}`;
    page.drawText(sub, { x: M, y: PAGE_H - 54, size: 10, font: f.reg, color: SUBTLE_WHITE });
    page.drawText(`Start ${inputs.accessionDate}   Current obligation ${inputs.contractYears} yr`, { x: M, y: PAGE_H - 72, size: 9, font: f.reg, color: SUBTLE_WHITE });
    rightText(page, `Generated ${generatedOn}`, RIGHT, PAGE_H - 34, 9, f.reg, SUBTLE_WHITE);
  }
  return PAGE_H - bandH - 28;
}

function drawFooter(page: PDFPage, f: Fonts, pageNum: number) {
  page.drawLine({ start: { x: M, y: 50 }, end: { x: RIGHT, y: 50 }, thickness: 0.5, color: LINE });
  page.drawText("Planning estimates - not official. Verify branch policy, DFAS, VA, and your chain of command.", { x: M, y: 38, size: 7.5, font: f.reg, color: MUTED });
  rightText(page, `Page ${pageNum}`, RIGHT, 38, 7.5, f.reg, MUTED);
}

function rowHeight(detailLines: number, hasPay: boolean): number {
  return 18 + (hasPay ? 13 : 0) + detailLines * 10 + 12;
}

export async function generateTimelinePdf(
  result: TimelineResult,
  inputs: TimelineInputs,
  generatedOn: string
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`ActivePayOS Career Milestone Planner - ${result.branchLabel} ${result.startGrade}`);
  doc.setCreator("ActivePayOS");

  const f: Fonts = {
    reg: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };

  let pageNum = 1;
  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = drawHeader(page, f, result, inputs, generatedOn, true);
  let prevNodeY: number | null = null;

  for (const e of result.events) {
    const detailLines = e.detail ? wrap(e.detail, f.reg, 8, TEXT_W) : [];
    const hasPay = e.monthlyBasePay != null;
    const h = rowHeight(detailLines.length, hasPay);

    if (y - h < BOTTOM) {
      drawFooter(page, f, pageNum);
      pageNum += 1;
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = drawHeader(page, f, result, inputs, generatedOn, false);
      prevNodeY = null;
    }

    const nodeY = y - 6;
    if (prevNodeY != null) {
      page.drawLine({ start: { x: SPINE_X, y: prevNodeY - 5 }, end: { x: SPINE_X, y: nodeY + 5 }, thickness: 1.2, color: LINE });
    }

    const color = KIND_COLOR[e.kind];
    if (e.kind === "today") {
      page.drawCircle({ x: SPINE_X, y: nodeY, size: 5, borderColor: color, borderWidth: 1.8, color: WHITE });
    } else {
      page.drawCircle({ x: SPINE_X, y: nodeY, size: 4.5, color });
    }

    // Left column: date + time-in-service
    rightText(page, e.dateISO, DATE_RIGHT, nodeY - 3, 9, f.bold, INK);
    rightText(page, e.sinceStart, DATE_RIGHT, nodeY - 14, 7.5, f.reg, MUTED);

    // Right column: title (+ estimate marker), pay, detail
    const title = e.estimate ? `${e.title}  *` : e.title;
    page.drawText(title, { x: TEXT_X, y: nodeY - 3, size: 10, font: f.bold, color: INK });

    let ty = nodeY - 16;
    if (hasPay) {
      const payStr = `${formatUsd(e.monthlyBasePay as number)}/mo`;
      const deltaStr =
        e.payDelta != null && e.payDelta !== 0
          ? `   ${e.payDelta > 0 ? "+" : ""}${formatUsd(e.payDelta)}`
          : "";
      page.drawText(payStr, { x: TEXT_X, y: ty, size: 9, font: f.bold, color });
      if (deltaStr) {
        const px = TEXT_X + f.bold.widthOfTextAtSize(payStr, 9);
        page.drawText(deltaStr, { x: px, y: ty, size: 9, font: f.reg, color: MUTED });
      }
      ty -= 13;
    }
    for (const dl of detailLines) {
      page.drawText(dl, { x: TEXT_X, y: ty, size: 8, font: f.reg, color: MUTED });
      ty -= 10;
    }

    prevNodeY = nodeY;
    y -= h;
  }

  // Source + legend note near the end of the last page (or its own area).
  if (y - 40 < BOTTOM) {
    drawFooter(page, f, pageNum);
    pageNum += 1;
    page = doc.addPage([PAGE_W, PAGE_H]);
    y = drawHeader(page, f, result, inputs, generatedOn, false);
  }
  y -= 6;
  page.drawLine({ start: { x: M, y }, end: { x: RIGHT, y }, thickness: 0.5, color: LINE });
  y -= 16;
  page.drawText("*  Planning estimate; strongest for enlisted planning. Officer mode is a broad sketch.", { x: M, y, size: 8, font: f.reg, color: MUTED });
  y -= 13;
  page.drawText(`Promotion timing source: ${result.source.label}`, { x: M, y, size: 8, font: f.reg, color: MUTED });
  y -= 11;
  page.drawText(result.source.url, { x: M, y, size: 8, font: f.reg, color: KIND_COLOR["gi-bill"] });

  drawFooter(page, f, pageNum);
  return doc.save();
}
