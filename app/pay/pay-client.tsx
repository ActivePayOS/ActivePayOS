"use client";

import { useMemo, useRef, useState } from "react";
import { getBahLookup } from "@/lib/pay/bah";
import SankeySvg from "@/components/sankey/SankeySvg";
import { useThemeColors, type ThemeColors } from "@/components/sankey/useThemeColors";
import { buildFlowGraph } from "@/lib/sankey/model";
import { downloadPng, downloadSvg, svgToPngBytes } from "@/lib/sankey/export";
import CompareChart from "@/components/charts/CompareChart";
import {
  computeTakeHome,
  SGLI_OPTIONS,
  type FilingStatus,
  type TspType,
} from "@/lib/pay/takehome";
import { SPECIAL_PAY_PRESETS, SPECIAL_PAY_COLORS, type SpecialPay } from "@/lib/pay/special-pays";
import { BRANCHES, getBranch, type BranchId } from "@/lib/pay/branches";
import { buildPaySummary } from "@/lib/export/summary";
import { generatePayPdf } from "@/lib/export/pdf";
import {
  getStateTaxContext,
  stateTaxContexts,
  stateTaxReferenceLinks,
} from "@/data/state-tax-context";

type PayGrade =
  | "O-1" | "O-2" | "O-3" | "O-4" | "O-5" | "O-6" | "O-7" | "O-8" | "O-9" | "O-10"
  | "W-1" | "W-2" | "W-3" | "W-4" | "W-5"
  | "E-1" | "E-2" | "E-3" | "E-4" | "E-5" | "E-6" | "E-7" | "E-8" | "E-9"
  | "O-1E" | "O-2E" | "O-3E";

const YEARS = [2026] as const;

type ExportFormat = "xlsx" | "csv" | "pdf" | "txt";
type PdfLayout = "classic" | "modern" | "compact";

// Minimalist formats first; the full Excel workbook stays available last.
const EXPORT_FORMATS: { value: ExportFormat; label: string }[] = [
  { value: "csv", label: "CSV — minimal (any spreadsheet)" },
  { value: "pdf", label: "PDF — printable summary" },
  { value: "txt", label: "Text — plain summary" },
  { value: "xlsx", label: "Excel — full budget workbook" },
];

const EXPORT_EXT: Record<ExportFormat, string> = {
  xlsx: "xlsx",
  csv: "csv",
  txt: "txt",
  pdf: "pdf",
};

const YOS_OPTIONS = [
  { label: "< 2", value: 0 },
  { label: "Over 2", value: 2 },
  { label: "Over 3", value: 3 },
  { label: "Over 4", value: 4 },
  { label: "Over 6", value: 6 },
  { label: "Over 8", value: 8 },
  { label: "Over 10", value: 10 },
  { label: "Over 12", value: 12 },
  { label: "Over 14", value: 14 },
  { label: "Over 16", value: 16 },
  { label: "Over 18", value: 18 },
  { label: "Over 20", value: 20 },
  { label: "Over 22", value: 22 },
  { label: "Over 24", value: 24 },
  { label: "Over 26", value: 26 },
  { label: "Over 28", value: 28 },
  { label: "Over 30", value: 30 },
  { label: "Over 32", value: 32 },
  { label: "Over 34", value: 34 },
  { label: "Over 36", value: 36 },
  { label: "Over 38", value: 38 },
  { label: "Over 40", value: 40 },
] as const;

const SOCIAL_SECURITY_RATE = 0.062;
const MEDICARE_RATE = 0.0145;

const STATE_RESIDENCY_OPTIONS = stateTaxContexts.map((item) => item.state);

const GRADES: PayGrade[] = [
  "O-1", "O-2", "O-3", "O-4", "O-5", "O-6", "O-7", "O-8", "O-9", "O-10",
  "O-1E", "O-2E", "O-3E",
  "W-1", "W-2", "W-3", "W-4", "W-5",
  "E-1", "E-2", "E-3", "E-4", "E-5", "E-6", "E-7", "E-8", "E-9",
];

// A fixed light palette for chart images embedded in the (white) PDF, so the
// export looks clean regardless of the on-screen theme.
const LIGHT_EXPORT_COLORS: ThemeColors = {
  foreground: "#07183b",
  muted: "#526176",
  line: "#d8e0ec",
  card: "#ffffff",
  cardMuted: "#f1f5f9",
  brandBlue: "#0b5cff",
};

type ResultsView = "summary" | "visuals" | "compare" | "civilian" | "statetax";
const RESULT_TABS: { value: ResultsView; label: string }[] = [
  { value: "summary", label: "Summary" },
  { value: "visuals", label: "Visuals" },
  { value: "compare", label: "Compare salary" },
  { value: "civilian", label: "Civilian-equivalent salary" },
  { value: "statetax", label: "State tax disclaimer" },
];

type BasePayData = {
  year: number;
  tables: Record<string, Partial<Record<PayGrade, Array<number | null>>>>;
};

type BasData = {
  year?: number;
  data?: {
    year?: number;
    rates?: {
      officers?: number;
      enlisted?: number;
    };
  };
  rates?: {
    officers?: number;
    enlisted?: number;
  };
};

function isEnlisted(g: PayGrade) {
  return g.startsWith("E-");
}

function fmtUSD(v: number | null | undefined) {
  return typeof v === "number" && Number.isFinite(v) && v >= 0
    ? new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
      }).format(v)
    : "-";
}

function fmtUSD0(v: number | null | undefined) {
  return typeof v === "number" && Number.isFinite(v) && v >= 0
    ? new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
      }).format(v)
    : "-";
}

function tableKeyForGrade(g: PayGrade) {
  if (g.startsWith("W-")) return "WO";
  if (g.startsWith("E-")) return "EM";
  if (g.startsWith("O-") && g.endsWith("E")) return "CO_FE";
  return "CO";
}

function yosToIndex(yos: number) {
  if (yos === 0) return 0;
  const breaks = [2, 3, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40];
  const idx = breaks.indexOf(yos);
  return idx === -1 ? 0 : idx + 1;
}

function getBasePayFromData(basepay: BasePayData, year: number, grade: PayGrade, yos: number): number {
  if (!basepay || basepay.year !== year) return 0;
  const key = tableKeyForGrade(grade);
  const row: (number | null)[] | undefined = basepay?.tables?.[key]?.[grade];
  if (!row) return 0;
  const idx = yosToIndex(yos);
  const v = row[idx];
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function getBasFromData(bas: BasData, year: number, grade: PayGrade): number {
  if (!bas) return 0;

  const src =
    bas?.year === year
      ? bas
      : bas?.data?.year === year
      ? bas.data
      : bas;

  const rates = src?.rates;
  if (!rates) return 0;

  const v = isEnlisted(grade) ? rates.enlisted : rates.officers;
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

export default function PayClient({
  initialYear,
  basepay,
  bas,
}: {
  initialYear: number;
  basepay: BasePayData;
  bas: BasData;
}) {
  const initialSupportedYear = YEARS.find((y) => y === initialYear) ?? YEARS[0];
  const [year, setYear] = useState<(typeof YEARS)[number]>(initialSupportedYear);
  const [grade, setGrade] = useState<PayGrade>("O-1");
  const [branch, setBranch] = useState<BranchId | "">("");
  const [yos, setYos] = useState<number>(0);
  const [zip, setZip] = useState<string>("");
  const [receivesBah, setReceivesBah] = useState<boolean>(true);
  const [dependents, setDependents] = useState<boolean>(false);
  const [stateOfLegalResidence, setStateOfLegalResidence] = useState<string>("");
  const stateTaxContext = useMemo(
    () => getStateTaxContext(stateOfLegalResidence),
    [stateOfLegalResidence]
  );

  // Budget-export knobs (used by the Excel export payload)
  const [savingsTargetPct] = useState<number>(0.20);
  const [housingTargetPct] = useState<number>(1.0);
  const [foodTargetPct] = useState<number>(1.0);

  // Take-home estimate inputs
  const [filingStatus, setFilingStatus] = useState<FilingStatus>("single");
  const [tspPct, setTspPct] = useState<number>(0.05);
  const [tspType, setTspType] = useState<TspType>("traditional");
  const [sgliMonthly, setSgliMonthly] = useState<number>(31);
  const [stateTaxPct, setStateTaxPct] = useState<number>(0);

  // Special & incentive pays
  const [specialPays, setSpecialPays] = useState<SpecialPay[]>([]);
  const [showSpecial, setShowSpecial] = useState(false);
  const specialIdRef = useRef(0);

  // Rank / scenario comparator
  const [showCompare, setShowCompare] = useState(true);
  const [bGrade, setBGrade] = useState<PayGrade>("O-2");
  const [bYos, setBYos] = useState<number>(0);

  const basePay = useMemo(
    () => getBasePayFromData(basepay, year, grade, yos),
    [basepay, year, grade, yos]
  );

  const basRate = useMemo(
    () => getBasFromData(bas, year, grade),
    [bas, year, grade]
  );

  const bahLookup = useMemo(() => getBahLookup(zip, grade, dependents), [zip, grade, dependents]);
  const bahRate = bahLookup.rate;
  const bah = receivesBah ? bahRate : 0;

  const bahError = useMemo(() => {
    if (!receivesBah) return null;
    if (!zip || zip.trim().length === 0) return null;
    if (bahLookup.status === "ok") return null;
    if (bahLookup.status === "invalid_zip") {
      return "Enter a valid 5-digit ZIP code, or ZIP+4 format like 02139-1234.";
    }
    if (bahLookup.status === "nonstandard_mha") {
      return "This ZIP is in the official 2026 ZIP-to-MHA file, but it maps to a non-standard area that is not in the local BAH rate table. Standard BAH may not apply; check OHA/non-locality guidance or your finance office.";
    }
    return "This ZIP is not available in the 2026 local BAH rate data used here. Check the ZIP, try ZIP+4 only if valid, or verify with the official BAH calculator.";
  }, [receivesBah, zip, bahLookup.status]);

  const specialTaxable = specialPays.reduce((a, s) => a + (s.taxable && s.monthly > 0 ? s.monthly : 0), 0);
  const specialNonTax = specialPays.reduce((a, s) => a + (!s.taxable && s.monthly > 0 ? s.monthly : 0), 0);
  const specialTotal = specialTaxable + specialNonTax;

  const branchInfo = getBranch(branch);
  // Branch-specific pays are surfaced additively; universal pays always show.
  const visibleSpecialPresets = SPECIAL_PAY_PRESETS.filter(
    (preset) => !preset.branches || (branch && preset.branches.includes(branch))
  );

  const taxableIncomeMonthly = basePay + specialTaxable;
  const nonTaxableIncomeMonthly = (bah ?? 0) + basRate + specialNonTax;
  const total = taxableIncomeMonthly + nonTaxableIncomeMonthly;

  const estimatedSocialSecurity = taxableIncomeMonthly * SOCIAL_SECURITY_RATE;
  const estimatedMedicare = taxableIncomeMonthly * MEDICARE_RATE;
  const estimatedFicaTotal = estimatedSocialSecurity + estimatedMedicare;

  const estimatedTakeHomeBeforeWithholding = total - estimatedFicaTotal;

  const annual = {
    basePay: basePay * 12,
    bah: (bah ?? 0) * 12,
    bas: basRate * 12,
    taxableIncome: taxableIncomeMonthly * 12,
    nonTaxableIncome: nonTaxableIncomeMonthly * 12,
    fica: estimatedFicaTotal * 12,
    total: total * 12,
    takeHomeBeforeWithholding: estimatedTakeHomeBeforeWithholding * 12,
  };

  const denomTotal = total > 0 ? total : 1;
  const pctBase = (basePay / denomTotal) * 100;
  const pctBah = ((bah ?? 0) / denomTotal) * 100;
  const pctBas = (basRate / denomTotal) * 100;
  const pctSpecial = (specialTotal / denomTotal) * 100;
  const pctTaxable = (taxableIncomeMonthly / denomTotal) * 100;
  const pctNonTax = (nonTaxableIncomeMonthly / denomTotal) * 100;

  const parts = useMemo(() => {
    const p: { label: string; value: number | null; hint: string }[] = [
      { label: "Base Pay", value: basePay, hint: "Taxable. From DFAS pay tables (grade + YOS)." },
      {
        label: "BAH",
        value: bah,
        hint: receivesBah
          ? "Usually non-taxable. From DTMO (ZIP + dependent status)."
          : "Set to $0 because barracks/government housing is selected.",
      },
      { label: "BAS", value: basRate, hint: "Usually non-taxable. Standard DFAS rate (not location-based)." },
      ...(specialTotal > 0
        ? [
            {
              label: "Special & incentive pays",
              value: specialTotal,
              hint: "Special pays you added (e.g., flight, sea, jump). Taxability varies.",
            },
          ]
        : []),
    ];
    const sum = p.reduce((a, x) => a + (x.value ?? 0), 0);
    return { p, sum };
  }, [basePay, bah, basRate, receivesBah, specialTotal]);

  const yosLabel = useMemo(() => {
    const found = YOS_OPTIONS.find((o) => o.value === yos);
    return found?.label ?? "< 2";
  }, [yos]);

  const [exporting, setExporting] = useState(false);
  const [format, setFormat] = useState<ExportFormat>("csv");
  const [pdfLayout] = useState<PdfLayout>("modern");
  const [resultsView, setResultsView] = useState<ResultsView>("summary");
  // Default to side-by-side on wide screens; the wrapper's `lg:` grid keeps
  // phones single-column (stacked) regardless of this value.
  const [splitLayout, setSplitLayout] = useState(true);

  // Full take-home estimate (federal + state tax, FICA, TSP, SGLI).
  const takeHome = useMemo(
    () =>
      computeTakeHome({
        basePayMonthly: basePay,
        bahMonthly: bah ?? 0,
        basMonthly: basRate,
        otherTaxableMonthly: specialTaxable,
        otherNonTaxableMonthly: specialNonTax,
        filingStatus,
        tspPct,
        tspType,
        sgliMonthly,
        stateTaxRatePct: stateTaxPct,
      }),
    [basePay, bah, basRate, specialTaxable, specialNonTax, filingStatus, tspPct, tspType, sgliMonthly, stateTaxPct]
  );

  // Scenario B (comparator): same duty location, settings, and special pays —
  // different grade and years of service (covers "next rank" and officer↔enlisted).
  const compare = useMemo(() => {
    const bBase = getBasePayFromData(basepay, year, bGrade, bYos);
    const bBasRate = getBasFromData(bas, year, bGrade);
    const bBah = receivesBah ? getBahLookup(zip, bGrade, dependents).rate ?? 0 : 0;
    const bTakeHome = computeTakeHome({
      basePayMonthly: bBase,
      bahMonthly: bBah,
      basMonthly: bBasRate,
      otherTaxableMonthly: specialTaxable,
      otherNonTaxableMonthly: specialNonTax,
      filingStatus,
      tspPct,
      tspType,
      sgliMonthly,
      stateTaxRatePct: stateTaxPct,
    });
    const bGross = bBase + bBah + bBasRate + specialTotal;
    return { bBase, bBah, bBasRate, bGross, bTakeHome };
  }, [
    basepay, bas, year, bGrade, bYos, zip, dependents, receivesBah,
    specialTaxable, specialNonTax, specialTotal,
    filingStatus, tspPct, tspType, sgliMonthly, stateTaxPct,
  ]);

  // Inflow Sankey for the Visuals tab: pay components → monthly pay → take-home + deductions.
  const sankeyColors = useThemeColors();
  const paySvgRef = useRef<SVGSVGElement>(null);
  const exportSankeyRef = useRef<SVGSVGElement>(null);
  const compareSvgRef = useRef<SVGSVGElement>(null);
  const payFlow = useMemo(
    () =>
      buildFlowGraph(
        [
          { id: "base", label: "Base Pay", value: basePay, color: "#3b82f6" },
          { id: "bah", label: "BAH", value: bah ?? 0, color: "#10b981" },
          { id: "bas", label: "BAS", value: basRate, color: "#f59e0b" },
          ...specialPays.map((s, i) => ({
            id: `sp-${s.id}`,
            label: s.label,
            value: Math.max(0, s.monthly),
            color: SPECIAL_PAY_COLORS[i % SPECIAL_PAY_COLORS.length],
          })),
        ],
        [
          { id: "takehome", label: "Take-home", value: takeHome.takeHomeMonthly, color: "#22c55e" },
          { id: "fed", label: "Federal tax", value: takeHome.federalTaxMonthly, color: "#ef4444" },
          { id: "state", label: "State tax", value: takeHome.stateTaxMonthly, color: "#f97316" },
          { id: "fica", label: "FICA", value: takeHome.ficaMonthly, color: "#eab308" },
          { id: "tsp", label: "TSP", value: takeHome.tspMonthly, color: "#8b5cf6" },
          { id: "sgli", label: "SGLI", value: takeHome.sgliMonthly, color: "#06b6d4" },
        ],
        { poolColor: sankeyColors.muted, poolLabel: "Monthly Pay" }
      ),
    [basePay, bah, basRate, specialPays, takeHome, sankeyColors.muted]
  );

  // Civilian-equivalent salary: tax-free allowances make total comp worth more
  // than the headline number, so a civilian needs a higher gross to match it.
  const civilianEquivalent = useMemo(() => {
    const grossAnnual = takeHome.grossMonthly * 12;
    const taxAnnual =
      (takeHome.federalTaxMonthly + takeHome.stateTaxMonthly + takeHome.ficaMonthly) * 12;
    const afterTax = grossAnnual - taxAnnual;
    const combinedMarginal = Math.min(0.6, takeHome.federalMarginalRate + stateTaxPct + 0.0765);
    const equivAnnual = combinedMarginal < 1 ? afterTax / (1 - combinedMarginal) : afterTax;
    return { equivAnnual, combinedMarginal };
  }, [takeHome, stateTaxPct]);

  function exportPaySankey() {
    if (paySvgRef.current) {
      downloadPng(paySvgRef.current, `activepayos_pay_flow_${grade}_${year}.png`, 2, sankeyColors.card);
    }
  }

  async function downloadBudget() {
    try {
      if (receivesBah && (!zip || zip.trim().length === 0)) {
        alert("Enter a duty ZIP code for BAH, or select Barracks / government housing (no BAH) before downloading the budget sheet.");
        return;
      }

      if (receivesBah && bah === null) {
        alert("Enter a valid duty ZIP code for BAH, or select Barracks / government housing (no BAH) before downloading the budget sheet.");
        return;
      }

      setExporting(true);

      // PDF is generated entirely in the browser (with the pay-flow chart
      // embedded), so nothing leaves the device for the PDF export.
      if (format === "pdf") {
        const zip5 = receivesBah
          ? String(zip ?? "").trim().match(/^(\d{5})(?:-\d{4})?$/)?.[1]
          : undefined;
        const summary = buildPaySummary({
          year,
          grade,
          yosLabel,
          zip5,
          receivesBah,
          dependents,
          stateOfLegalResidence,
          baseMonthly: basePay,
          bahMonthly: bah ?? 0,
          basMonthly: basRate,
          otherMonthly: specialTotal,
          generatedOn: new Date().toISOString().slice(0, 10),
        });
        let chartPng: Uint8Array | undefined;
        if (exportSankeyRef.current) {
          try {
            chartPng = await svgToPngBytes(exportSankeyRef.current, 2, "#ffffff");
          } catch {
            // fall back to a chartless PDF
          }
        }
        const pdfBytes = await generatePayPdf(summary, "modern", chartPng);
        const safeZipPdf = receivesBah
          ? String(zip ?? "").trim().slice(0, 10).replace(/[^0-9-]/g, "")
          : "NoBAH";
        const pdfBlob = new Blob([new Uint8Array(pdfBytes)], { type: "application/pdf" });
        const pdfUrl = window.URL.createObjectURL(pdfBlob);
        const pa = document.createElement("a");
        pa.href = pdfUrl;
        pa.download = `activepayos_Pay_${safeZipPdf || "ZIP"}_${grade}_${year}.pdf`;
        document.body.appendChild(pa);
        pa.click();
        pa.remove();
        window.URL.revokeObjectURL(pdfUrl);
        return;
      }

      const payload = {
        year,
        grade,
        yosLabel,
        zip: receivesBah ? zip : "",
        withDependents: dependents,
        receivesBah,
        stateOfLegalResidence,

        basePayMonthly: basePay,
        bahMonthly: bah ?? 0,
        basMonthly: basRate,
        otherIncomeMonthly: specialTotal,

        housingTargetPct,
        foodTargetPct,
        savingsTargetPct,
        tspPct,
        stateTaxPct,

        format,
        pdfLayout,
      };

      const res = await fetch("/api/export-budget", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const msg = await res.text().catch(() => "");
        const userMessage =
          msg.includes("Invalid ZIP")
            ? "Enter a duty ZIP code for BAH, or select Barracks / government housing (no BAH) before downloading the budget sheet."
            : "Export failed. Please check your inputs and try again.";
        alert(userMessage);
        return;
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);

      const safeZip = receivesBah
        ? String(zip ?? "").trim().slice(0, 10).replace(/[^0-9-]/g, "")
        : "NoBAH";
      const stem = format === "xlsx" ? "Budget" : "Pay";
      const a = document.createElement("a");
      a.href = url;
      a.download = `activepayos_${stem}_${safeZip || "ZIP"}_${grade}_${year}.${EXPORT_EXT[format]}`;
      document.body.appendChild(a);
      a.click();
      a.remove();

      window.URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  return (
    <main className="space-y-10">
      <section className="rounded-3xl border bg-white p-6 md:p-8 shadow-sm">
        {branchInfo && (
          <div
            className="mb-4 h-1.5 w-20 rounded-full"
            style={{ backgroundColor: branchInfo.accent }}
          />
        )}
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-semibold tracking-tight">Pay Calculator</h1>
              {branchInfo && (
                <span
                  className="rounded-full px-3 py-1 text-xs font-semibold"
                  style={{ backgroundColor: branchInfo.accent, color: branchInfo.onAccent }}
                >
                  {branchInfo.name}
                </span>
              )}
            </div>
            <p className="mt-2 text-sm text-gray-600">
              Monthly pay components with a clear taxable vs non-taxable breakdown.
            </p>
            <p className="mt-2 text-xs text-gray-500">
              2026 base pay, BAS, and BAH data last verified on April 29, 2026.
            </p>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 md:mt-0">
            <span
              className="hidden items-center rounded-full border p-1 text-xs lg:inline-flex"
              role="group"
              aria-label="Layout"
              title="Side-by-side is available on wider screens"
            >
              <button
                type="button"
                onClick={() => setSplitLayout(false)}
                className={`rounded-full px-3 py-1 font-medium transition ${
                  !splitLayout ? "bg-[var(--field-bg)] text-[var(--field-text)]" : "text-gray-600 hover:text-gray-900"
                }`}
              >
                Stacked
              </button>
              <button
                type="button"
                onClick={() => setSplitLayout(true)}
                className={`rounded-full px-3 py-1 font-medium transition ${
                  splitLayout ? "bg-[var(--field-bg)] text-[var(--field-text)]" : "text-gray-600 hover:text-gray-900"
                }`}
              >
                Side by side
              </button>
            </span>

            <span className="rounded-full border bg-gray-50 px-3 py-1 text-xs text-gray-700">
              Data: Base Pay + BAS + BAH (Live)
            </span>

            <label className="sr-only" htmlFor="export-format">
              Export format
            </label>
            <select
              id="export-format"
              value={format}
              onChange={(e) => setFormat(e.target.value as ExportFormat)}
              className="field rounded-full px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-black/20"
              title="Choose the file type to download"
            >
              {EXPORT_FORMATS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={downloadBudget}
              disabled={exporting}
              className="rounded-full border border-black bg-black px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
              title="Download your pay summary in the selected format."
            >
              {exporting ? "Preparing..." : "Download"}
            </button>
          </div>
        </div>
      </section>

      <div className={splitLayout ? "grid gap-6 lg:grid-cols-2 lg:items-start" : "space-y-10"}>
        <section className="rounded-3xl border bg-white p-6 md:p-8 shadow-sm">
          <h2 className="text-lg font-semibold">Inputs (Start Here!)</h2>
        <p className="mt-1 text-sm text-gray-600">
          Set your year, grade, and time in service.
        </p>

        <div className="mt-6 grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label htmlFor="branch" className="block text-sm font-medium">Branch</label>
              <select
                id="branch"
                className="field mt-1 w-full rounded-xl px-3 py-2"
                value={branch}
                onChange={(e) => setBranch(e.target.value as BranchId | "")}
              >
                <option value="">Select branch</option>
                {BRANCHES.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium">Year</label>
              <select
                className="field mt-1 w-full rounded-xl px-3 py-2"
                value={year}
                onChange={(e) => setYear(Number(e.target.value) as (typeof YEARS)[number])}
              >
                {YEARS.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium">Pay Grade</label>
              <select
                className="field mt-1 w-full rounded-xl px-3 py-2"
                value={grade}
                onChange={(e) => setGrade(e.target.value as PayGrade)}
              >
                {[
                  "O-1","O-2","O-3","O-4","O-5","O-6","O-7","O-8","O-9","O-10",
                  "O-1E","O-2E","O-3E",
                  "W-1","W-2","W-3","W-4","W-5",
                  "E-1","E-2","E-3","E-4","E-5","E-6","E-7","E-8","E-9",
                ].map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium">
                Years of Service (YOS)
              </label>
              <select
                className="field mt-1 w-full rounded-xl px-3 py-2"
                value={yos}
                onChange={(e) => setYos(Number(e.target.value))}
              >
                {YOS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              
            </div>

            <div>
              <label htmlFor="state-of-legal-residence" className="block text-sm font-medium">
                State of Legal Residence
              </label>
              <select
                id="state-of-legal-residence"
                className="field mt-1 w-full rounded-xl px-3 py-2"
                value={stateOfLegalResidence}
                onChange={(e) => setStateOfLegalResidence(e.target.value)}
              >
                <option value="">Select state</option>
                {STATE_RESIDENCY_OPTIONS.map((state) => (
                  <option key={state} value={state}>
                    {state}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500">
                Used for state tax context. State withholding is not subtracted from the estimate yet.
              </p>
            </div>

            <div className="grid gap-3 sm:col-span-2 md:grid-cols-2 lg:col-span-4">
              <div className={!receivesBah ? "opacity-60" : ""}>
                <label className="block text-sm font-medium">
                  Duty ZIP (for BAH)
                </label>
                <input
                  className="field mt-1 w-full rounded-xl px-3 py-2"
                  placeholder="02139"
                  value={zip}
                  disabled={!receivesBah}
                  onChange={(e) => setZip(e.target.value)}
                />
                <p className="mt-1 text-xs text-gray-500">
                  {receivesBah
                    ? "Tip: ZIP+4 works too (e.g., 02139-1234)."
                    : "ZIP is not required when BAH is set to $0."}
                </p>
                {bahError && (
                  <p className="mt-2 text-sm text-red-600">
                    {bahError}
                  </p>
                )}
              </div>

              <div className="mt-6 space-y-3 text-sm">
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4"
                    checked={!receivesBah}
                    onChange={(e) => setReceivesBah(!e.target.checked)}
                  />
                  <span>
                    Barracks / government housing (no BAH)
                    <span className="mt-1 block text-xs text-gray-500">
                      Select this if you do not receive BAH. The budget sheet will use $0 for housing allowance.
                    </span>
                  </span>
                </label>

                <label className={`flex items-center gap-2 ${!receivesBah ? "opacity-60" : ""}`}>
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={dependents}
                    disabled={!receivesBah}
                    onChange={(e) => setDependents(e.target.checked)}
                  />
                  With dependents
                </label>
              </div>
            </div>

            <div className="rounded-2xl border bg-gray-50 p-4 text-xs text-gray-600 sm:col-span-2 lg:col-span-4">
              <div className="font-medium text-gray-900">Export options</div>
              <p className="mt-1">
                Use the format picker by the Download button. <strong>CSV</strong>, <strong>PDF</strong>, and{" "}
                <strong>Text</strong> give a minimalist summary of just your pay numbers (monthly + annual) — handy
                for importing elsewhere, printing, or filing with your LES. The PDF is a clean, printable
                summary.
              </p>
              <p className="mt-2">
                <strong>Excel</strong> gives the full budget workbook: a &quot;Start Here&quot; tab that pre-fills your
                pay and suggests a hybrid plan (Housing about BAH, Food about BAS, Savings target %). You can edit
                everything.
              </p>
            </div>
          </div>

          <div className="mt-8 border-t pt-6">
            <h2 className="text-lg font-semibold">Estimate your take-home (optional)</h2>
            <p className="mt-1 text-sm text-gray-600">
              Adds federal &amp; state tax, FICA, TSP, and SGLI to estimate what actually lands in
              your bank account.
            </p>
            <div className="mt-6 grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label htmlFor="filing-status" className="block text-sm font-medium">
                  Tax filing status
                </label>
                <select
                  id="filing-status"
                  className="field mt-1 w-full rounded-xl px-3 py-2"
                  value={filingStatus}
                  onChange={(e) => setFilingStatus(e.target.value as FilingStatus)}
                >
                  <option value="single">Single</option>
                  <option value="married">Married filing jointly</option>
                </select>
              </div>

              <div>
                <label htmlFor="tsp-pct" className="block text-sm font-medium">
                  TSP contribution
                </label>
                <div className="field mt-1 flex items-center rounded-xl px-3 py-2">
                  <input
                    id="tsp-pct"
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={Math.round(tspPct * 100)}
                    onChange={(e) =>
                      setTspPct(Math.max(0, Math.min(100, Number(e.target.value) || 0)) / 100)
                    }
                    className="w-full bg-transparent outline-none"
                  />
                  <span className="text-sm text-gray-500">% of base</span>
                </div>
              </div>

              <div>
                <label htmlFor="tsp-type" className="block text-sm font-medium">
                  TSP type
                </label>
                <select
                  id="tsp-type"
                  className="field mt-1 w-full rounded-xl px-3 py-2"
                  value={tspType}
                  onChange={(e) => setTspType(e.target.value as TspType)}
                >
                  <option value="traditional">Traditional (pre-tax)</option>
                  <option value="roth">Roth (post-tax)</option>
                </select>
              </div>

              <div>
                <label htmlFor="sgli" className="block text-sm font-medium">
                  SGLI coverage
                </label>
                <select
                  id="sgli"
                  className="field mt-1 w-full rounded-xl px-3 py-2"
                  value={sgliMonthly}
                  onChange={(e) => setSgliMonthly(Number(e.target.value))}
                >
                  {SGLI_OPTIONS.map((o) => (
                    <option key={o.coverage} value={o.monthly}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="state-tax-pct" className="block text-sm font-medium">
                  Estimated state tax rate
                </label>
                <div className="field mt-1 flex items-center rounded-xl px-3 py-2">
                  <input
                    id="state-tax-pct"
                    type="number"
                    min={0}
                    max={20}
                    step={0.5}
                    value={Math.round(stateTaxPct * 1000) / 10}
                    onChange={(e) =>
                      setStateTaxPct(Math.max(0, Math.min(20, Number(e.target.value) || 0)) / 100)
                    }
                    className="w-full bg-transparent outline-none"
                  />
                  <span className="text-sm text-gray-500">%</span>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  {stateTaxContext?.category === "no_broad_wage_income_tax"
                    ? `${stateTaxContext.state} has no broad income tax — 0% is typical.`
                    : stateOfLegalResidence
                    ? "Rough effective rate on military wages (see State Tax Context below)."
                    : "Pick your state of legal residence above for guidance."}
                </p>
              </div>
            </div>
            <p className="mt-3 text-xs text-gray-500">
              Federal tax assumes the {year} standard deduction and no other income or credits; state
              tax uses the flat rate you enter. Estimates only — your LES is the source of truth.
            </p>
          </div>

          <div className="mt-8 border-t pt-6">
            <button
              type="button"
              onClick={() => setShowSpecial((v) => !v)}
              className="flex w-full items-center justify-between text-left"
            >
              <span className="text-lg font-semibold">
                Special &amp; incentive pays
                {specialTotal > 0 && (
                  <span className="ml-2 text-sm font-normal text-gray-500">
                    +{fmtUSD0(specialTotal)}/mo
                  </span>
                )}
              </span>
              <span className="text-sm text-gray-500">{showSpecial ? "Hide" : "Add"}</span>
            </button>

            {showSpecial && (
              <div className="mt-4 space-y-3">
                <p className="text-xs text-gray-500">
                  Flight, sea, jump, hazardous-duty, language, SDAP, and more. Amounts are editable
                  estimates and taxability varies — set the Taxable toggle to match your situation.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    aria-label="Add a special pay"
                    value=""
                    onChange={(e) => {
                      const preset = visibleSpecialPresets[Number(e.target.value)];
                      if (!preset) return;
                      specialIdRef.current += 1;
                      setSpecialPays((prev) => [
                        ...prev,
                        { id: `sp-${specialIdRef.current}`, label: preset.label, monthly: preset.monthly, taxable: preset.taxable },
                      ]);
                    }}
                    className="field rounded-xl px-3 py-2 text-sm"
                  >
                    <option value="">Add a pay…</option>
                    {visibleSpecialPresets.map((p, i) => (
                      <option key={p.label} value={i}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      specialIdRef.current += 1;
                      setSpecialPays((prev) => [
                        ...prev,
                        { id: `sp-${specialIdRef.current}`, label: "Other pay", monthly: 0, taxable: true },
                      ]);
                    }}
                    className="rounded-xl border border-dashed px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900"
                  >
                    + Custom
                  </button>
                </div>

                {specialPays.length > 0 && (
                  <div className="space-y-2">
                    {specialPays.map((sp) => (
                      <div key={sp.id} className="flex flex-wrap items-center gap-2">
                        <input
                          type="text"
                          value={sp.label}
                          onChange={(e) =>
                            setSpecialPays((prev) =>
                              prev.map((x) => (x.id === sp.id ? { ...x, label: e.target.value } : x))
                            )
                          }
                          className="field min-w-0 flex-1 rounded-lg px-2.5 py-1.5 text-sm"
                          aria-label="Special pay label"
                        />
                        <div className="field flex items-center rounded-lg px-2 py-1.5">
                          <span className="text-sm text-gray-500">$</span>
                          <input
                            type="number"
                            min={0}
                            step={10}
                            value={sp.monthly === 0 ? "" : sp.monthly}
                            placeholder="0"
                            onChange={(e) => {
                              const v = e.target.value === "" ? 0 : Number(e.target.value);
                              setSpecialPays((prev) =>
                                prev.map((x) =>
                                  x.id === sp.id ? { ...x, monthly: Number.isFinite(v) ? Math.max(0, v) : 0 } : x
                                )
                              );
                            }}
                            className="w-20 bg-transparent text-right text-sm outline-none"
                            aria-label="Special pay amount"
                          />
                        </div>
                        <label className="flex items-center gap-1 text-xs text-gray-600">
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={sp.taxable}
                            onChange={(e) =>
                              setSpecialPays((prev) =>
                                prev.map((x) => (x.id === sp.id ? { ...x, taxable: e.target.checked } : x))
                              )
                            }
                          />
                          Taxable
                        </label>
                        <button
                          type="button"
                          onClick={() => setSpecialPays((prev) => prev.filter((x) => x.id !== sp.id))}
                          className="rounded-lg border px-2 py-1.5 text-sm text-gray-500 hover:text-gray-900"
                          aria-label={`Remove ${sp.label}`}
                          title="Remove"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        <section className="rounded-3xl border bg-white p-6 md:p-8 shadow-sm">
          <h2 className="text-lg font-semibold">Results</h2>
          <p className="mt-1 text-sm text-gray-600">
            Monthly totals with a clearer take-home picture.
          </p>

          <div className="mt-6 rounded-3xl border bg-white p-6 md:p-8 shadow-sm">
            <div className="text-sm text-gray-600">
              Estimated monthly total
            </div>
            <div className="mt-2 text-4xl font-bold tracking-tight">
              {fmtUSD(total)}
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <div className="text-sm text-gray-600">Annual</div>
              <div className="text-base font-semibold text-gray-900">
                {fmtUSD0(annual.total)}
              </div>
            </div>
            <p className="mt-2 text-xs text-gray-500">
              Total = Base Pay + BAH + BAS
            </p>

            <p className="mt-2 text-xs text-gray-500">
              Includes {fmtUSD(nonTaxableIncomeMonthly)} in generally non-taxable allowances (BAH + BAS).
            </p>
          </div>

          {/* Results view tabs */}
          <div className="mt-6 flex flex-wrap gap-1 rounded-2xl border p-1 text-sm">
            {RESULT_TABS.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setResultsView(t.value)}
                className={`rounded-full px-3 py-1.5 font-medium transition ${
                  resultsView === t.value
                    ? "bg-[var(--field-bg)] text-[var(--field-text)]"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {resultsView === "visuals" && (
            <div className="mt-6 space-y-6">
              <div className="rounded-2xl border p-4">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="text-sm font-medium">
                    Where your pay comes from — and what&apos;s left
                  </span>
                  <button
                    type="button"
                    onClick={exportPaySankey}
                    className="rounded-full border px-3 py-1 text-xs font-medium hover:bg-gray-100"
                    title="Download this chart as a PNG (generated in your browser)"
                  >
                    Export PNG
                  </button>
                </div>
                <div className="overflow-hidden rounded-xl border">
                  <SankeySvg
                    graph={payFlow}
                    colors={sankeyColors}
                    svgRef={paySvgRef}
                    leftCaption="PAY COMPONENTS"
                    rightCaption="TAKE-HOME & TAX"
                  />
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  Your pay components flow into your monthly pay, then out to federal &amp; state tax,
                  FICA, TSP, SGLI, and take-home. Estimates only — verify with your LES.
                </p>
              </div>

              <div className="grid gap-6 sm:grid-cols-2 sm:items-center">
                <div className="flex items-center justify-center">
                  <div className="relative h-44 w-44">
                    <div
                      className="h-full w-full rounded-full"
                      style={{
                        background: `conic-gradient(var(--brand-blue) 0 ${pctBase}%, #10b981 ${pctBase}% ${pctBase + pctBah}%, #f59e0b ${pctBase + pctBah}% ${pctBase + pctBah + pctBas}%, #8b5cf6 ${pctBase + pctBah + pctBas}% 100%)`,
                      }}
                    />
                    <div className="absolute inset-[20%] flex flex-col items-center justify-center rounded-full bg-white text-center shadow-sm">
                      <span className="text-xs text-gray-500">Monthly</span>
                      <span className="text-lg font-bold">{fmtUSD0(total)}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  {[
                    { label: "Base Pay", value: basePay, color: "var(--brand-blue)", pct: pctBase },
                    { label: "BAH", value: bah ?? 0, color: "#10b981", pct: pctBah },
                    { label: "BAS", value: basRate, color: "#f59e0b", pct: pctBas },
                    ...(specialTotal > 0
                      ? [{ label: "Special pays", value: specialTotal, color: "#8b5cf6", pct: pctSpecial }]
                      : []),
                  ].map((s) => (
                    <div key={s.label} className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-sm">
                        <span
                          className="inline-block h-3 w-3 rounded-full"
                          style={{ backgroundColor: s.color }}
                        />
                        {s.label}
                      </div>
                      <div className="text-sm font-semibold">
                        {fmtUSD(s.value)} <span className="text-gray-500">· {s.pct.toFixed(0)}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="font-medium">Taxable vs non-taxable (monthly)</span>
                  <span className="text-gray-500">{pctNonTax.toFixed(0)}% non-taxable</span>
                </div>
                <div className="flex h-4 w-full overflow-hidden rounded-full bg-gray-200">
                  <div
                    className="h-full bg-[var(--brand-blue)]"
                    style={{ width: `${pctTaxable}%` }}
                    title="Taxable"
                  />
                  <div
                    className="h-full bg-emerald-500"
                    style={{ width: `${pctNonTax}%` }}
                    title="Non-taxable"
                  />
                </div>
                <div className="mt-2 flex justify-between text-xs text-gray-500">
                  <span>Taxable {fmtUSD(taxableIncomeMonthly)}</span>
                  <span>Non-taxable {fmtUSD(nonTaxableIncomeMonthly)}</span>
                </div>
              </div>

              <div className="rounded-2xl border p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Annual total</span>
                  <span className="text-lg font-bold">{fmtUSD0(annual.total)}</span>
                </div>
                <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-gray-200">
                  <div className="h-full bg-[var(--brand-blue)]" style={{ width: `${pctTaxable}%` }} />
                  <div className="h-full bg-emerald-500" style={{ width: `${pctNonTax}%` }} />
                </div>
                <div className="mt-2 text-xs text-gray-500">
                  {fmtUSD0(annual.taxableIncome)} taxable + {fmtUSD0(annual.nonTaxableIncome)} non-taxable
                  per year.
                </div>
              </div>

              <p className="text-xs text-gray-500">
                Visuals reflect your current inputs. BAH is included only when a valid duty ZIP is
                entered.
              </p>
            </div>
          )}

          {resultsView === "summary" && (
            <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border p-4">
              <div className="text-sm font-medium">Taxable Income</div>
              <div className="mt-1 text-xs text-gray-500">Usually just base pay for this calculator.</div>
              <div className="mt-3 text-2xl font-bold">{fmtUSD(taxableIncomeMonthly)}</div>
              <div className="mt-1 text-xs text-gray-500">Annual {fmtUSD0(annual.taxableIncome)}</div>
            </div>

            <div className="rounded-2xl border p-4">
              <div className="text-sm font-medium">Non-Taxable Income</div>
              <div className="mt-1 text-xs text-gray-500">BAH + BAS are generally non-taxable allowances.</div>
              <div className="mt-3 text-2xl font-bold">{fmtUSD(nonTaxableIncomeMonthly)}</div>
              <div className="mt-1 text-xs text-gray-500">Annual {fmtUSD0(annual.nonTaxableIncome)}</div>
            </div>

            <div className="rounded-2xl border p-4">
              <div className="text-sm font-medium">Total Monthly Deductions</div>
              <div className="mt-1 text-xs text-gray-500">Federal + state tax, FICA, TSP, and SGLI.</div>
              <div className="mt-3 text-2xl font-bold">{fmtUSD(takeHome.totalDeductionsMonthly)}</div>
              <div className="mt-1 text-xs text-gray-500">
                Effective tax rate ~{(takeHome.effectiveTaxRate * 100).toFixed(1)}% (tax + FICA ÷ gross)
              </div>
            </div>

            <div className="rounded-2xl border-2 border-emerald-500/60 p-4">
              <div className="text-sm font-medium">Estimated Monthly Take-Home</div>
              <div className="mt-1 text-xs text-gray-500">
                After federal &amp; state tax, FICA, TSP, and SGLI.
              </div>
              <div className="mt-3 text-2xl font-bold">{fmtUSD(takeHome.takeHomeMonthly)}</div>
              <div className="mt-1 text-xs text-gray-500">
                Annual {fmtUSD0(takeHome.takeHomeMonthly * 12)}
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border p-5">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">Monthly take-home breakdown</div>
              <div className="text-xs text-gray-500">Gross {fmtUSD(takeHome.grossMonthly)}</div>
            </div>
            <div className="mt-4 space-y-2 text-sm">
              {[
                { label: "Federal income tax (est.)", value: takeHome.federalTaxMonthly, color: "#ef4444" },
                { label: "State income tax (est.)", value: takeHome.stateTaxMonthly, color: "#f97316" },
                { label: "FICA (Social Security + Medicare)", value: takeHome.ficaMonthly, color: "#eab308" },
                { label: `TSP (${Math.round(tspPct * 100)}% ${tspType})`, value: takeHome.tspMonthly, color: "#8b5cf6" },
                { label: "SGLI", value: takeHome.sgliMonthly, color: "#06b6d4" },
              ].map((d) => (
                <div key={d.label} className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-gray-600">
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                    {d.label}
                  </span>
                  <span className="font-medium">− {fmtUSD(d.value)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between border-t pt-2">
                <span className="flex items-center gap-2 font-medium">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  Take-home
                </span>
                <span className="font-bold">{fmtUSD(takeHome.takeHomeMonthly)}</span>
              </div>
            </div>
          </div>

            </>
          )}

          {resultsView === "civilian" && (
            <>
          <div className="mt-6 rounded-2xl border p-5">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">Civilian-equivalent salary</div>
              <span className="rounded-full border bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700">
                Estimate
              </span>
            </div>
            <div className="mt-3 text-3xl font-bold">
              {fmtUSD0(civilianEquivalent.equivAnnual)}
              <span className="text-base font-normal text-gray-500"> /yr</span>
            </div>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              Because BAH and BAS are tax-free, your military pay is worth more than the headline
              number. A civilian would need roughly this gross salary to take home the same amount, at
              about a {(civilianEquivalent.combinedMarginal * 100).toFixed(0)}% combined marginal rate
              (federal + state + FICA).
            </p>
            <p className="mt-2 text-xs text-gray-500">
              Rough estimate. It excludes the value of military healthcare, the BRS pension and TSP
              match, and other benefits — so your true total compensation is higher.
            </p>
          </div>

            </>
          )}

          {resultsView === "compare" && (
            <>
          <div className="mt-6 rounded-2xl border p-5">
            <button
              type="button"
              onClick={() => setShowCompare((v) => !v)}
              className="flex w-full items-center justify-between text-left"
            >
              <span className="text-sm font-medium">Compare to another rank / scenario</span>
              <span className="text-sm text-gray-500">{showCompare ? "Hide" : "Compare"}</span>
            </button>

            {showCompare && (
              <div className="mt-4 space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600">Compare grade</label>
                    <select
                      value={bGrade}
                      onChange={(e) => setBGrade(e.target.value as PayGrade)}
                      className="field mt-1 w-full rounded-lg px-2 py-1.5 text-sm"
                    >
                      {GRADES.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600">Years of service</label>
                    <select
                      value={bYos}
                      onChange={(e) => setBYos(Number(e.target.value))}
                      className="field mt-1 w-full rounded-lg px-2 py-1.5 text-sm"
                    >
                      {YOS_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={() => {
                        const i = GRADES.indexOf(grade);
                        if (i >= 0 && i < GRADES.length - 1) setBGrade(GRADES[i + 1]);
                        setBYos(yos);
                      }}
                      className="rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-gray-100"
                    >
                      Next grade ↑
                    </button>
                  </div>
                </div>

                <div className="overflow-hidden rounded-xl border text-sm">
                  <div className="grid grid-cols-4 gap-2 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-500">
                    <span />
                    <span className="text-right">You ({grade})</span>
                    <span className="text-right">{bGrade}</span>
                    <span className="text-right">Δ</span>
                  </div>
                  {[
                    { label: "Gross / mo", a: total, b: compare.bGross },
                    { label: "Take-home / mo", a: takeHome.takeHomeMonthly, b: compare.bTakeHome.takeHomeMonthly },
                    { label: "Gross / yr", a: total * 12, b: compare.bGross * 12 },
                  ].map((row) => {
                    const d = row.b - row.a;
                    return (
                      <div key={row.label} className="grid grid-cols-4 gap-2 border-t px-3 py-2">
                        <span className="text-gray-600">{row.label}</span>
                        <span className="text-right">{fmtUSD0(row.a)}</span>
                        <span className="text-right">{fmtUSD0(row.b)}</span>
                        <span
                          className="text-right font-medium"
                          style={{ color: d < 0 ? "#ef4444" : "#15803d" }}
                        >
                          {d >= 0 ? "+" : "−"}
                          {fmtUSD0(Math.abs(d))}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-gray-500">
                  Same duty location, dependents, TSP, and special pays — only grade and years of
                  service change. Pick any grade to compare a promotion, or officer vs. enlisted.
                </p>

                <div className="overflow-hidden rounded-2xl border">
                  <CompareChart
                    gradeA={grade}
                    gradeB={bGrade}
                    metrics={[
                      { label: "Gross / mo", a: total, b: compare.bGross },
                      { label: "Take-home / mo", a: takeHome.takeHomeMonthly, b: compare.bTakeHome.takeHomeMonthly },
                    ]}
                    colors={sankeyColors}
                    svgRef={compareSvgRef}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (compareSvgRef.current)
                        downloadPng(
                          compareSvgRef.current,
                          `activepayos_compare_${grade}_vs_${bGrade}.png`,
                          2,
                          sankeyColors.card
                        );
                    }}
                    className="rounded-full border border-black bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
                  >
                    Export PNG
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (compareSvgRef.current)
                        downloadSvg(compareSvgRef.current, `activepayos_compare_${grade}_vs_${bGrade}.svg`);
                    }}
                    className="rounded-full border px-4 py-2 text-sm font-medium hover:bg-gray-100"
                  >
                    Export SVG
                  </button>
                  <span className="text-xs text-gray-500">
                    Generated in your browser — the image never leaves your device.
                  </span>
                </div>
              </div>
            )}
          </div>

            </>
          )}

          {resultsView === "summary" && (
            <>
          <div className="mt-6 rounded-2xl border bg-gray-50 p-4 text-xs text-gray-600">
            <div className="font-medium text-gray-900">Important note</div>
            <p className="mt-1">
              Take-home is an estimate. Federal tax assumes the standard deduction (using the filing
              status above) and no other income or credits; state tax uses the flat rate you entered;
              traditional TSP is treated as pre-tax. Your actual LES will differ based on your W-4,
              special pays, and other deductions.
            </p>
          </div>

          <div className="mt-6 space-y-4">
            {parts.p.map((x) => {
              const denom = parts.sum > 0 ? parts.sum : 0;
              const v = x.value ?? 0;
              const pct = denom > 0 ? (v / denom) * 100 : 0;

              return (
                <div key={x.label} className="rounded-2xl border p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-sm font-medium">
                        {x.label}
                      </div>
                      <div className="mt-1 text-xs text-gray-500">
                        {x.hint}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold">
                        {fmtUSD(x.value ?? 0)}
                      </div>
                      <div className="mt-1 text-xs text-gray-500">
                        {parts.sum > 0 ? `${pct.toFixed(0)}%` : "-"}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-gray-200">
                    <div
                      className="h-full bg-black/70"
                      style={{
                        width: `${Math.max(0, Math.min(100, pct))}%`,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

            </>
          )}

          {resultsView === "statetax" && (
            <>
          <div className="mt-6 rounded-2xl border bg-white p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-sm font-medium">State Tax Context</div>
                <div className="mt-1 text-xs text-gray-500">
                  Based on state of legal residence, not BAH duty ZIP.
                </div>
              </div>
              <span className="w-fit rounded-full border bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700">
                Not included in total
              </span>
            </div>

            {stateTaxContext ? (
              <div className="mt-4 space-y-4">
                <div>
                  <div className="text-lg font-semibold">
                    {stateTaxContext.state} ({stateTaxContext.abbreviation})
                  </div>
                  <div className="mt-1 text-sm font-medium text-gray-700">
                    {stateTaxContext.headline}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-gray-600">
                    {stateTaxContext.summary}
                  </p>
                </div>

                <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-gray-600">
                  {stateTaxContext.planningNotes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>

                <div className="flex flex-wrap gap-3 text-sm">
                  <a
                    href={stateTaxContext.stateTaxAgencyUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium underline underline-offset-2 hover:text-gray-700"
                  >
                    State tax agency -&gt;
                  </a>
                  {stateTaxReferenceLinks.map((link) => (
                    <a
                      key={link.href}
                      href={link.href}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium underline underline-offset-2 hover:text-gray-700"
                    >
                      {link.label} -&gt;
                    </a>
                  ))}
                </div>
              </div>
            ) : (
              <p className="mt-4 text-sm leading-6 text-gray-600">
                Select your state of legal residence to see state-specific planning context.
                Your LES should show the state you are claiming for tax withholding.
              </p>
            )}
          </div>
            </>
          )}
        </section>
      </div>

      <section className="rounded-3xl border bg-gray-50 p-8">
      <h2 className="text-lg font-semibold">Understanding Your Military Pay (LES)</h2>
      <p className="mt-2 text-sm text-gray-600">
        The Leave and Earnings Statement (LES) is the military version of a pay stub.
        It shows your pay, allowances, taxes, and deductions each month.
      </p>

      <p className="mt-2 text-xs text-gray-500">
        New to military pay? See <a href="/terms" className="underline">Terms Explained</a>.
      </p>

      <div className="mt-6 grid gap-4 md:grid-cols-2">

        <div className="rounded-2xl border p-4">
          <div className="font-medium">Base Pay</div>
          <p className="mt-1 text-sm text-gray-600">
            Your primary salary based on rank and years of service. Base pay is taxable.
          </p>
        </div>

        <div className="rounded-2xl border p-4">
          <div className="font-medium">BAH (Housing Allowance)</div>
          <p className="mt-1 text-sm text-gray-600">
            A housing allowance based on duty location, rank, and dependent status.
            BAH is generally non-taxable.
          </p>
        </div>

        <div className="rounded-2xl border p-4">
          <div className="font-medium">BAS (Food Allowance)</div>
          <p className="mt-1 text-sm text-gray-600">
            BAS is a food allowance for service members and is usually non-taxable.
          </p>
        </div>

        <div className="rounded-2xl border p-4">
          <div className="font-medium">Deductions</div>
          <p className="mt-1 text-sm text-gray-600">
            Deductions include taxes, SGLI life insurance, TSP retirement contributions,
            and other allotments.
          </p>
        </div>

      </div>

      <p className="mt-6 text-xs text-gray-500">
        Official pay information is available through DFAS and your LES.
      </p>
    </section>

      {/* Offscreen, light-themed chart used only for the PDF export (works from any tab). */}
      <div aria-hidden className="pointer-events-none absolute -left-[9999px] top-0 w-[920px]">
        <SankeySvg
          graph={payFlow}
          colors={LIGHT_EXPORT_COLORS}
          svgRef={exportSankeyRef}
          leftCaption="PAY COMPONENTS"
          rightCaption="TAKE-HOME & TAX"
        />
      </div>
    </main>
  );
}
