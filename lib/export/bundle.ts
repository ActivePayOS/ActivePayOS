// lib/export/bundle.ts
// Cross-tool report bundle: any of the three money tools (Pay Calculator,
// Budget Builder, Wealth Projector) can export the other tools' reports.
//
// Live data always wins; missing sections load from the same localStorage
// hand-off contract the tools already share (lib/budget/transfer.ts,
// lib/profile/handoff.ts). Serializers lead with a grand REPORT SUMMARY block
// (every included tool's overview), then each tool's full detail in the fixed
// order pay, budget, projection — matching the site's journey strip.
//
// PDF choice (documented per the shared contract): pdf-lib CAN merge
// documents, so generateBundlePdf reuses the existing per-tool PDF drawing
// unchanged — it renders each tool's PDF, then copies the pages into one
// document behind a summary cover page. No per-tool zip fallback is needed.

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { buildPaySummary, type PaySummary } from "./summary";
import { generatePayCsv } from "./csv";
import { generatePayTxt } from "./txt";
import { generatePayPdf } from "./pdf";
import {
  generateBudgetCsv,
  generateBudgetTxt,
  type BudgetExport,
  type BudgetLine,
} from "./budget-summary";
import { generateBudgetPdf } from "./budget-pdf";
import {
  generateProjectionCsv,
  generateProjectionTxt,
  type ProjectionExport,
} from "./projection";
import { generateProjectionPdf } from "./projection-pdf";
import { payOverview, budgetOverview, projectionOverview, type OverviewItem } from "./overview";
import { loadTransfer, type PayTransfer } from "@/lib/budget/transfer";
import { BUDGET_KEY, loadProjectionSnapshot } from "@/lib/profile/handoff";

export type BundleSectionId = "pay" | "budget" | "projection";

export type BundleData = {
  pay?: PaySummary;
  budget?: BudgetExport;
  projection?: ProjectionExport;
};

/** Human labels in the site's canonical tool order (journey strip order). */
export const BUNDLE_SECTION_LABELS: Record<BundleSectionId, string> = {
  pay: "Pay Calculator",
  budget: "Budget",
  projection: "Wealth Projector",
};

const SECTION_ORDER: BundleSectionId[] = ["pay", "budget", "projection"];

// ---------------------------------------------------------------- sources ---

/**
 * The Pay Calculator's summary sheet rebuilt from a stored hand-off transfer.
 * (Moved here from app/budget/budget-client.tsx so every page can use it.)
 */
export function paySummaryFromTransfer(t: PayTransfer, generatedOn: string): PaySummary {
  return buildPaySummary({
    year: t.meta.year,
    grade: t.meta.grade,
    yosLabel: t.meta.yosLabel,
    zip5: t.meta.receivesBah && t.meta.location !== "-" ? t.meta.location : undefined,
    receivesBah: t.meta.receivesBah,
    dependents: t.meta.dependents,
    stateOfLegalResidence: t.meta.stateOfLegalResidence,
    baseMonthly: t.income.base,
    bahMonthly: t.income.bah,
    basMonthly: t.income.bas,
    otherMonthly: t.income.specials.reduce((a, s) => a + s.monthly, 0),
    generatedOn,
  });
}

/** The slice of the auto-saved budget ('activepayos:budget:v1') exports need. */
export type SavedBudgetState = {
  income: { id?: string; label?: string; amount?: number }[];
  expenses: { id?: string; label?: string; amount?: number }[];
  tspPct?: number;
  tspBaseId?: string;
  showTspPanel?: boolean;
  iraEnabled?: boolean;
  iraMonthly?: number;
  iraType?: "roth" | "traditional";
};

/** Read the saved budget rows from this device (null outside the browser). */
export function loadSavedBudgetState(): SavedBudgetState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(BUDGET_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.income) || !Array.isArray(parsed?.expenses)) return null;
    return parsed as SavedBudgetState;
  } catch {
    return null;
  }
}

/**
 * Pure: saved budget rows -> a BudgetExport, mirroring what the Budget
 * Builder's own export produces — including the synthesized TSP (% of the
 * chosen income row) and civilian IRA outflows the on-page chart adds.
 */
export function buildBudgetExportFromSaved(
  saved: SavedBudgetState,
  generatedOn: string
): BudgetExport | null {
  const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : 0);
  const income: BudgetLine[] = saved.income
    .filter((i) => num(i?.amount) > 0)
    .map((i) => ({ label: i.label || "Income", monthly: num(i.amount) }));
  const expenses: BudgetLine[] = saved.expenses
    .filter((e) => num(e?.amount) > 0)
    .map((e) => ({ label: e.label || "Expense", monthly: num(e.amount) }));
  if (income.length === 0 && expenses.length === 0) return null;

  // Synthesized outflows, exactly as the on-page Sankey adds them.
  const tspBase =
    saved.income.find((i) => i.id === saved.tspBaseId) ?? saved.income[0];
  const tspPct = num(saved.tspPct);
  const tspMonthly =
    saved.showTspPanel === false ? 0 : Math.max(0, num(tspBase?.amount)) * Math.max(0, tspPct);
  if (tspMonthly > 0) {
    expenses.push({ label: `TSP (${Math.round(tspPct * 100)}%)`, monthly: tspMonthly });
  }
  const iraMonthly = saved.iraEnabled ? Math.max(0, num(saved.iraMonthly)) : 0;
  if (iraMonthly > 0) {
    expenses.push({
      label: `IRA (${saved.iraType === "traditional" ? "Traditional" : "Roth"})`,
      monthly: iraMonthly,
    });
  }

  const totalIncome = income.reduce((a, l) => a + l.monthly, 0);
  const totalExpense = expenses.reduce((a, l) => a + l.monthly, 0);
  return {
    generatedOn,
    income,
    expenses,
    totalIncome,
    totalExpense,
    leftover: totalIncome - totalExpense,
  };
}

// ------------------------------------------------------------ availability ---

/**
 * Per-tool availability derived from what this device has stored, for the
 * ReportPanel `sections` prop. Pages mark their OWN tool available (live data
 * wins) and take the other two from here.
 */
export function availabilityForSections(): {
  id: BundleSectionId;
  available: boolean;
  hint?: string;
}[] {
  const pay = typeof window === "undefined" ? null : loadTransfer();
  const budget = loadSavedBudgetState();
  const projection = loadProjectionSnapshot();
  return [
    {
      id: "pay",
      available: !!pay,
      hint: pay
        ? undefined
        : "No pay data on this device yet - open the Pay Calculator and use 'Send to Budget'.",
    },
    {
      id: "budget",
      available: !!budget,
      hint: budget
        ? undefined
        : "No saved budget on this device yet - build one in the Budget Builder (it saves automatically).",
    },
    {
      id: "projection",
      available: !!projection,
      hint: projection
        ? undefined
        : "No projection on this device yet - open the Wealth Projector once (it snapshots automatically).",
    },
  ];
}

// ------------------------------------------------------------------- data ---

/**
 * Assemble the bundle: live values win; anything missing loads from the
 * stored hand-offs. `staleness` carries a note per section that came from
 * storage rather than the live page (pass it to the serializers so readers
 * know which numbers may be older).
 */
export function buildBundleData(live: Partial<BundleData>): {
  data: BundleData;
  staleness: Partial<Record<BundleSectionId, string>>;
} {
  const staleness: Partial<Record<BundleSectionId, string>> = {};
  const data: BundleData = { ...live };
  const today = new Date().toISOString().slice(0, 10);

  if (!data.pay) {
    const t = typeof window === "undefined" ? null : loadTransfer();
    if (t) {
      data.pay = paySummaryFromTransfer(t, t.generatedOn || today);
      staleness.pay = `Pay figures from the Pay Calculator hand-off saved ${t.generatedOn || "on this device"}.`;
    }
  }
  if (!data.budget) {
    const saved = loadSavedBudgetState();
    const b = saved ? buildBudgetExportFromSaved(saved, today) : null;
    if (b) {
      data.budget = b;
      staleness.budget = "Budget figures from the budget saved on this device.";
    }
  }
  if (!data.projection) {
    const snap = loadProjectionSnapshot();
    if (snap) {
      data.projection = snap.export;
      staleness.projection = `Projection from the Wealth Projector snapshot saved ${snap.generatedOn}.`;
    }
  }
  return { data, staleness };
}

// ------------------------------------------------------------- serializers ---

type Staleness = Partial<Record<BundleSectionId, string>>;

function sectionsIn(data: BundleData): BundleSectionId[] {
  return SECTION_ORDER.filter((id) => !!data[id]);
}

function overviewFor(data: BundleData, id: BundleSectionId): OverviewItem[] {
  if (id === "pay" && data.pay) return payOverview(data.pay);
  if (id === "budget" && data.budget) return budgetOverview(data.budget);
  if (id === "projection" && data.projection) return projectionOverview(data.projection);
  return [];
}

function bundleGeneratedOn(data: BundleData): string {
  return (
    data.pay?.generatedOn ??
    data.budget?.generatedOn ??
    data.projection?.generatedOn ??
    new Date().toISOString().slice(0, 10)
  );
}

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

function csvRow(cells: Array<string | number>): string {
  return cells.map(csvCell).join(",");
}

export function generateBundleCsv(data: BundleData, staleness: Staleness = {}): string {
  const ids = sectionsIn(data);
  const lines: string[] = [];

  lines.push(csvRow(["ActivePayOS Combined Report"]));
  lines.push(csvRow(["Generated", bundleGeneratedOn(data)]));
  lines.push(csvRow(["Includes", ids.map((id) => BUNDLE_SECTION_LABELS[id]).join(", ")]));

  // Grand summary: every included tool's overview, before any detail.
  lines.push("");
  lines.push(csvRow(["REPORT SUMMARY", "", "", ""]));
  lines.push(csvRow(["Tool", "Item", "Value", "What it means"]));
  for (const id of ids) {
    for (const item of overviewFor(data, id)) {
      lines.push(csvRow([BUNDLE_SECTION_LABELS[id], item.label, item.value, item.explanation]));
    }
    const note = staleness[id];
    if (note) lines.push(csvRow([BUNDLE_SECTION_LABELS[id], "Data source", note, ""]));
  }

  // Full per-tool detail, each tool's complete report in order.
  const detail: Partial<Record<BundleSectionId, string>> = {
    pay: data.pay ? generatePayCsv(data.pay) : undefined,
    budget: data.budget ? generateBudgetCsv(data.budget) : undefined,
    projection: data.projection ? generateProjectionCsv(data.projection) : undefined,
  };
  for (const id of ids) {
    lines.push("");
    lines.push(csvRow([`${BUNDLE_SECTION_LABELS[id].toUpperCase()} - FULL REPORT`]));
    lines.push(detail[id]!.replace(/\n+$/, ""));
  }

  return lines.join("\n") + "\n";
}

export function generateBundleTxt(data: BundleData, staleness: Staleness = {}): string {
  const ids = sectionsIn(data);
  const div = "=".repeat(74);
  const out: string[] = [];

  out.push("ACTIVEPAYOS COMBINED REPORT");
  out.push(`Generated ${bundleGeneratedOn(data)}`);
  out.push(`Includes: ${ids.map((id) => BUNDLE_SECTION_LABELS[id]).join(", ")}`);
  out.push(div);
  out.push("REPORT SUMMARY");
  for (const id of ids) {
    out.push("");
    out.push(`--- ${BUNDLE_SECTION_LABELS[id]} ---`);
    const items = overviewFor(data, id);
    const w = Math.max(...items.map((o) => o.label.length)) + 2;
    for (const o of items) {
      out.push(`${(o.label + ":").padEnd(w)} ${o.value}`);
      out.push(`${" ".repeat(w + 1)}- ${o.explanation}`);
    }
    const note = staleness[id];
    if (note) out.push(`  (${note})`);
  }

  const detail: Partial<Record<BundleSectionId, string>> = {
    pay: data.pay ? generatePayTxt(data.pay) : undefined,
    budget: data.budget ? generateBudgetTxt(data.budget) : undefined,
    projection: data.projection ? generateProjectionTxt(data.projection) : undefined,
  };
  for (const id of ids) {
    out.push(div);
    out.push(`${BUNDLE_SECTION_LABELS[id].toUpperCase()} - FULL REPORT`);
    out.push(div);
    out.push(detail[id]!.replace(/\n+$/, ""));
  }
  out.push("");

  return out.join("\n") + "\n";
}

/**
 * One combined PDF: a summary cover page, then each included tool's existing
 * PDF (drawn by its own generator, charts included when provided) merged in
 * order via pdf-lib page copying.
 */
export async function generateBundlePdf(
  data: BundleData,
  charts?: { pay?: Uint8Array; budget?: Uint8Array; projection?: Uint8Array },
  staleness: Staleness = {}
): Promise<Uint8Array> {
  const ids = sectionsIn(data);
  const merged = await PDFDocument.create();
  merged.setTitle("ActivePayOS Combined Report");
  merged.setCreator("ActivePayOS");
  merged.setProducer("ActivePayOS");

  const reg = await merged.embedFont(StandardFonts.Helvetica);
  const bold = await merged.embedFont(StandardFonts.HelveticaBold);

  const PAGE_W = 612;
  const PAGE_H = 792;
  const M = 50;
  const RIGHT = PAGE_W - M;
  const INK = rgb(0.11, 0.13, 0.16);
  const MUTED = rgb(0.45, 0.48, 0.53);
  const LINE = rgb(0.85, 0.87, 0.9);
  const NAVY = rgb(0.07, 0.13, 0.29);
  const ACCENT = rgb(0.05, 0.42, 0.38);
  const WHITE = rgb(1, 1, 1);
  const SUBTLE_WHITE = rgb(0.76, 0.81, 0.89);

  // ---- cover page: grand summary ----
  let cover = merged.addPage([PAGE_W, PAGE_H]);
  cover.drawRectangle({ x: 0, y: PAGE_H - 100, width: PAGE_W, height: 100, color: NAVY });
  cover.drawRectangle({ x: 0, y: PAGE_H - 100, width: PAGE_W, height: 5, color: ACCENT });
  cover.drawText("ActivePayOS", { x: M, y: PAGE_H - 50, size: 24, font: bold, color: WHITE });
  cover.drawText("Combined Report", { x: M, y: PAGE_H - 70, size: 12, font: reg, color: SUBTLE_WHITE });
  const genText = `Generated ${bundleGeneratedOn(data)}`;
  cover.drawText(genText, {
    x: RIGHT - reg.widthOfTextAtSize(genText, 9),
    y: PAGE_H - 50,
    size: 9,
    font: reg,
    color: SUBTLE_WHITE,
  });
  const inclText = ids.map((id) => BUNDLE_SECTION_LABELS[id]).join("  -  ");
  cover.drawText(inclText, {
    x: RIGHT - reg.widthOfTextAtSize(inclText, 9),
    y: PAGE_H - 68,
    size: 9,
    font: reg,
    color: SUBTLE_WHITE,
  });

  let y = PAGE_H - 100 - 34;
  const ensureSpace = (needed: number) => {
    if (y - needed < 96) {
      cover = merged.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - 60;
    }
  };

  for (const id of ids) {
    ensureSpace(46);
    cover.drawText(BUNDLE_SECTION_LABELS[id].toUpperCase(), { x: M, y, size: 10, font: bold, color: MUTED });
    y -= 6;
    cover.drawLine({ start: { x: M, y }, end: { x: RIGHT, y }, thickness: 1, color: LINE });
    y -= 18;
    for (const item of overviewFor(data, id)) {
      ensureSpace(26);
      cover.drawText(item.label, { x: M, y, size: 10, font: bold, color: INK });
      const v = item.value;
      cover.drawText(v, { x: RIGHT - bold.widthOfTextAtSize(v, 10), y, size: 10, font: bold, color: NAVY });
      y -= 11;
      cover.drawText(item.explanation, { x: M + 8, y, size: 7.5, font: reg, color: MUTED, maxWidth: RIGHT - M - 16 });
      y -= 15;
    }
    const note = staleness[id];
    if (note) {
      ensureSpace(14);
      cover.drawText(note, { x: M, y, size: 7.5, font: reg, color: MUTED, maxWidth: RIGHT - M });
      y -= 14;
    }
    y -= 10;
  }

  // Cover footer.
  cover.drawLine({ start: { x: M, y: 78 }, end: { x: RIGHT, y: 78 }, thickness: 0.5, color: LINE });
  cover.drawText("Planning estimates only - not an official DoD, DFAS, or U.S. military document.", {
    x: M, y: 64, size: 8, font: reg, color: MUTED,
  });
  cover.drawText("Verify against your LES / myPay. Generated by ActivePayOS - activepayos.com", {
    x: M, y: 53, size: 8, font: reg, color: MUTED,
  });

  // ---- per-tool pages, reusing each tool's own PDF generator ----
  const sections: Array<Promise<Uint8Array> | undefined> = [
    data.pay ? generatePayPdf(data.pay, "modern", charts?.pay) : undefined,
    data.budget ? generateBudgetPdf(data.budget, charts?.budget) : undefined,
    data.projection ? generateProjectionPdf(data.projection, charts?.projection) : undefined,
  ];
  for (const pending of sections) {
    if (!pending) continue;
    const src = await PDFDocument.load(await pending);
    const pages = await merged.copyPages(src, src.getPageIndices());
    for (const p of pages) merged.addPage(p);
  }

  return merged.save();
}
