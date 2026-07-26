"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import PlanFlow from "@/components/PlanFlow";
import { mapPayBranch, mapPayGrade, savePaySnapshot } from "@/lib/profile/handoff";
import { getBahLookup } from "@/lib/pay/bah";
import SankeySvg from "@/components/sankey/SankeySvg";
import { useThemeColors, type ThemeColors } from "@/components/sankey/useThemeColors";
import { buildFlowGraph } from "@/lib/sankey/model";
import { downloadPng, downloadSvg, svgToPngBytes } from "@/lib/sankey/export";
import CompareChart from "@/components/charts/CompareChart";
import {
  computeTakeHome,
  SGLI_OPTIONS,
  TSP_ELECTIVE_DEFERRAL_LIMIT_2026,
  type FilingStatus,
  type TspType,
} from "@/lib/pay/takehome";
import {
  computeCivilianEquivalent,
  CIVILIAN_EQUIVALENT_ASSUMPTIONS,
  CIVILIAN_EQUIVALENT_SOURCES,
  type ReceiptLine,
} from "@/lib/pay/civilian";
import { SPECIAL_PAY_PRESETS, SPECIAL_PAY_COLORS, type SpecialPay } from "@/lib/pay/special-pays";
import { BRANCHES, getBranch, type BranchId } from "@/lib/pay/branches";
import { buildPaySummary } from "@/lib/export/summary";
import { generatePayPdf } from "@/lib/export/pdf";
import {
  getStateTaxContext,
  stateTaxContexts,
  stateTaxReferenceLinks,
} from "@/data/state-tax-context";
import { saveTransfer, type PayTransfer } from "@/lib/budget/transfer";
import { formatPayDataLastVerified } from "@/data/verification";

type PayGrade =
  | "O-1" | "O-2" | "O-3" | "O-4" | "O-5" | "O-6" | "O-7" | "O-8" | "O-9" | "O-10"
  | "W-1" | "W-2" | "W-3" | "W-4" | "W-5"
  | "E-1" | "E-2" | "E-3" | "E-4" | "E-5" | "E-6" | "E-7" | "E-8" | "E-9"
  | "O-1E" | "O-2E" | "O-3E"
  // Pseudo-grades handled specially (not direct pay-table rows):
  | "E-1 <4mo"   // E-1 with under 4 months of service (lower published rate)
  | "Cadet";     // Service academy cadet / midshipman

// Cadet / midshipman monthly pay is set by statute at 35% of O-1 (<2 yr) basic
// pay (DoD FMR Vol. 7A, Ch. 38). Cadets receive room, board, and uniforms in
// kind, so they draw no BAH or BAS.
const CADET_PAY_FRACTION_OF_O1 = 0.35;
function isCadet(g: PayGrade) {
  return g === "Cadet";
}
function isSpecialGrade(g: PayGrade) {
  return g === "Cadet" || g === "E-1 <4mo";
}
// Which real grade to use for allowance (BAH/BAS) lookups on a pseudo-grade.
// Returns a standard grade so it stays assignable to the allowance lookups.
// (Cadets draw no allowances, so their mapping is unused — it just keeps the
// type real.)
type StandardGrade = Exclude<PayGrade, "Cadet" | "E-1 <4mo">;
function allowanceGradeFor(g: PayGrade): StandardGrade {
  if (g === "E-1 <4mo" || g === "Cadet") return "E-1";
  return g;
}

const YEARS = [2026] as const;

// The Hybrid/Stacked input layouts are built but disabled for now — flip this to
// true to expose the Row/Hybrid/Stacked toggle again. Defaults to Row.
const SHOW_LAYOUT_OPTIONS = false;

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
const SS_WAGE_BASE_2026 = 184500; // 2026 Social Security wage base
const ADDL_MEDICARE_RATE = 0.009; // extra 0.9% on wages above $200k/yr
const ADDL_MEDICARE_THRESHOLD_MONTHLY = 200000 / 12;

const STATE_RESIDENCY_OPTIONS = stateTaxContexts.map((item) => item.state);

const GRADES: PayGrade[] = [
  "O-1", "O-2", "O-3", "O-4", "O-5", "O-6", "O-7", "O-8", "O-9", "O-10",
  "O-1E", "O-2E", "O-3E",
  "W-1", "W-2", "W-3", "W-4", "W-5",
  "E-1", "E-2", "E-3", "E-4", "E-5", "E-6", "E-7", "E-8", "E-9",
];

// Options for the primary Pay Grade dropdown. Includes the two pseudo-grades
// (label differs from value); the rank comparator keeps using GRADES only.
const GRADE_OPTIONS: { value: PayGrade; label: string }[] = [
  { value: "Cadet", label: "Service Academy Cadet / Midshipman" },
  ...GRADES.flatMap((g): { value: PayGrade; label: string }[] =>
    g === "E-1"
      ? [
          { value: "E-1 <4mo", label: "E-1 < 4 months" },
          { value: "E-1", label: "E-1" },
        ]
      : [{ value: g, label: g }]
  ),
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
  // DFAS publishes a lower E-1 rate for members with under 4 months of service.
  e1UnderFourMonthsMonthly?: number;
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

function hasBasePayForYos(basepay: BasePayData, year: number, grade: PayGrade, yos: number) {
  if (!basepay || basepay.year !== year) return false;
  const key = tableKeyForGrade(grade);
  const row: (number | null)[] | undefined = basepay?.tables?.[key]?.[grade];
  const v = row?.[yosToIndex(yos)];
  return typeof v === "number" && Number.isFinite(v);
}

function firstSupportedYos(basepay: BasePayData, year: number, grade: PayGrade, fallback: number) {
  return YOS_OPTIONS.find((o) => hasBasePayForYos(basepay, year, grade, o.value))?.value ?? fallback;
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
  const router = useRouter();
  const initialSupportedYear = YEARS.find((y) => y === initialYear) ?? YEARS[0];
  const [year, setYear] = useState<(typeof YEARS)[number]>(initialSupportedYear);
  // The select starts unselected ("Rank" placeholder); downstream math uses a
  // typed PayGrade fallback, but results/exports stay gated until a real pick.
  const [gradeChoice, setGradeChoice] = useState<PayGrade | "">("");
  const gradeSelected = gradeChoice !== "";
  const grade: PayGrade = gradeChoice === "" ? "O-1" : gradeChoice;
  const [branch, setBranch] = useState<BranchId | "">("");
  const [yos, setYos] = useState<number>(0);
  const [zip, setZip] = useState<string>("");
  const [receivesBah, setReceivesBah] = useState<boolean>(true);
  // Family size includes the member. BAH pays the "with dependents" rate when
  // the member has at least one dependent (family size of 2 or more).
  const [familySize, setFamilySize] = useState<number>(1);
  const dependents = familySize >= 2;
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
  const [sgliMonthly, setSgliMonthly] = useState<number>(26);
  const [stateTaxPct, setStateTaxPct] = useState<number>(0);

  // Special & incentive pays
  const [specialPays, setSpecialPays] = useState<SpecialPay[]>([]);
  const [showSpecial, setShowSpecial] = useState(false);
  const specialIdRef = useRef(0);

  // Rank / scenario comparator
  const [showCompare, setShowCompare] = useState(true);
  const [bGrade, setBGrade] = useState<PayGrade>("O-2");
  const [bYos, setBYos] = useState<number>(0);

  const cadet = isCadet(grade);
  // Cadets/midshipmen draw no housing or food allowance.
  const effectiveReceivesBah = receivesBah && !cadet;

  const basePay = useMemo(() => {
    if (grade === "E-1 <4mo") {
      return typeof basepay.e1UnderFourMonthsMonthly === "number"
        ? basepay.e1UnderFourMonthsMonthly
        : getBasePayFromData(basepay, year, "E-1", 0);
    }
    if (grade === "Cadet") {
      const o1 = getBasePayFromData(basepay, year, "O-1", 0);
      return Math.round(o1 * CADET_PAY_FRACTION_OF_O1 * 100) / 100;
    }
    return getBasePayFromData(basepay, year, grade, yos);
  }, [basepay, year, grade, yos]);
  const basePayAvailable = useMemo(
    () => isSpecialGrade(grade) || hasBasePayForYos(basepay, year, grade, yos),
    [basepay, year, grade, yos]
  );

  const basRate = useMemo(
    () => (cadet ? 0 : getBasFromData(bas, year, allowanceGradeFor(grade))),
    [bas, year, grade, cadet]
  );

  const bahLookup = useMemo(
    () => getBahLookup(zip, allowanceGradeFor(grade), dependents),
    [zip, grade, dependents]
  );
  const bahRate = bahLookup.rate;
  const bah = effectiveReceivesBah ? bahRate : 0;

  const bahError = useMemo(() => {
    if (!effectiveReceivesBah) return null;
    if (!zip || zip.trim().length === 0) return null;
    if (bahLookup.status === "ok") return null;
    if (bahLookup.status === "invalid_zip") {
      return "Enter a valid 5-digit ZIP code, or ZIP+4 format like 02139-1234.";
    }
    if (bahLookup.status === "nonstandard_mha") {
      return "This ZIP is in the official 2026 ZIP-to-MHA file, but it maps to a non-standard area that is not in the local BAH rate table. Standard BAH may not apply; check OHA/non-locality guidance or your finance office.";
    }
    return "This ZIP is not available in the 2026 local BAH rate data used here. Check the ZIP, try ZIP+4 only if valid, or verify with the official BAH calculator.";
  }, [effectiveReceivesBah, zip, bahLookup.status]);

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

  const estimatedSocialSecurity =
    Math.min(taxableIncomeMonthly, SS_WAGE_BASE_2026 / 12) * SOCIAL_SECURITY_RATE;
  const estimatedMedicare =
    taxableIncomeMonthly * MEDICARE_RATE +
    Math.max(0, taxableIncomeMonthly - ADDL_MEDICARE_THRESHOLD_MONTHLY) * ADDL_MEDICARE_RATE;
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

  // Silently snapshot the career-shaped inputs so the Wealth Projector and the
  // journey strip pick them up — localStorage only, nothing leaves the browser.
  useEffect(() => {
    if (!gradeSelected) return;
    const mapped = mapPayGrade(grade);
    if (!mapped) return; // warrant/cadet grades aren't modeled by the projector
    savePaySnapshot({
      branch: mapPayBranch(branch || undefined),
      track: mapped.track,
      grade: mapped.grade,
      yos,
      tspPct,
      grossMonthly: total,
    });
  }, [gradeSelected, grade, branch, yos, tspPct, total]);

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
        hint: effectiveReceivesBah
          ? "Usually non-taxable. From DTMO (ZIP + dependent status)."
          : cadet
          ? "Cadets/midshipmen receive housing in kind, so no BAH is added."
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
  }, [basePay, bah, basRate, effectiveReceivesBah, cadet, specialTotal]);

  const yosLabel = useMemo(() => {
    const found = YOS_OPTIONS.find((o) => o.value === yos);
    return found?.label ?? "< 2";
  }, [yos]);

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [format, setFormat] = useState<ExportFormat>("csv");
  const [pdfLayout] = useState<PdfLayout>("modern");
  const [resultsView, setResultsView] = useState<ResultsView>("summary");
  // Default to stacked; users can switch to side-by-side on wide screens.
  const [splitLayout, setSplitLayout] = useState(false);
  // Input layout: row (wide multi-column), hybrid (balanced two-up), or stacked
  // (single column). Governs both the primary inputs and the take-home inputs so
  // they stay visually consistent.
  const [inputLayout, setInputLayout] = useState<"horizontal" | "hybrid" | "vertical">(
    "horizontal"
  );
  const inputGridClass =
    inputLayout === "vertical"
      ? "max-w-sm grid-cols-1 items-start"
      : inputLayout === "hybrid"
      ? "max-w-2xl grid-cols-1 sm:grid-cols-2 items-start"
      : "items-end sm:grid-cols-2 lg:grid-cols-5";
  const takeHomeGridClass =
    inputLayout === "vertical"
      ? "max-w-sm grid-cols-1"
      : inputLayout === "hybrid"
      ? "max-w-2xl grid-cols-1 sm:grid-cols-2"
      : "sm:grid-cols-2 lg:grid-cols-4";
  // Full-width span for the helper line + the nested ZIP/family block.
  const inputSpanFull =
    inputLayout === "vertical" ? "" : inputLayout === "hybrid" ? "sm:col-span-2" : "sm:col-span-2 lg:col-span-5";
  const nestedInputGridClass =
    inputLayout === "vertical"
      ? "grid-cols-1"
      : inputLayout === "hybrid"
      ? "sm:col-span-2 md:grid-cols-2"
      : "sm:col-span-2 md:grid-cols-2 lg:col-span-5";

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

  // TSP annual elective-deferral limit tracking. `tspPct` is a % of base pay;
  // payroll stops contributions once the yearly cap is hit.
  const tspAnnualUncapped = Math.max(0, basePay) * tspPct * 12;
  const tspPctToMax =
    TSP_ELECTIVE_DEFERRAL_LIMIT_2026 > 0 ? tspAnnualUncapped / TSP_ELECTIVE_DEFERRAL_LIMIT_2026 : 0;
  // Set the % that lands exactly on the annual limit, so the user needn't guess.
  function maxTsp() {
    const annualBase = Math.max(0, basePay) * 12;
    if (annualBase <= 0) return;
    setTspPct(Math.min(1, TSP_ELECTIVE_DEFERRAL_LIMIT_2026 / annualBase));
  }

  // Scenario B (comparator): same duty location, settings, and special pays —
  // different grade and years of service (covers "next rank" and officer↔enlisted).
  const compare = useMemo(() => {
    const bBase = getBasePayFromData(basepay, year, bGrade, bYos);
    const bBasRate = getBasFromData(bas, year, bGrade);
    const bBah = receivesBah ? getBahLookup(zip, allowanceGradeFor(bGrade), dependents).rate ?? 0 : 0;
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
  // Solved exactly (not a marginal-rate gross-up) with a full receipts trail —
  // method, sources, and the check line live in lib/pay/civilian.ts.
  const civilianEquivalent = useMemo(
    () =>
      computeCivilianEquivalent({
        takeHome,
        filingStatus,
        stateTaxRatePct: stateTaxPct,
        tspType,
      }),
    [takeHome, filingStatus, stateTaxPct, tspType]
  );

  function exportPaySankey() {
    if (paySvgRef.current) {
      downloadPng(paySvgRef.current, `activepayos_pay_flow_${grade}_${year}.png`, 2, sankeyColors.card);
    }
  }

  // Hand the current pay figures to the Budget Builder. The payload is stashed
  // in localStorage (nothing leaves the browser) and the Budget page offers to
  // import it, choosing combined vs. by-source income there.
  function sendToBudget() {
    const zip5 = effectiveReceivesBah
      ? String(zip ?? "").trim().match(/^(\d{5})(?:-\d{4})?$/)?.[1]
      : undefined;
    const transfer: PayTransfer = {
      v: 1,
      generatedOn: new Date().toISOString().slice(0, 10),
      meta: {
        year,
        grade,
        yosLabel,
        location: effectiveReceivesBah ? zip5 ?? "-" : "No BAH / barracks",
        dependents,
        stateOfLegalResidence: stateOfLegalResidence || "Not selected",
        receivesBah: effectiveReceivesBah,
      },
      income: {
        base: basePay,
        bah: bah ?? 0,
        bas: basRate,
        specials: specialPays
          .filter((s) => s.monthly > 0)
          .map((s) => ({ label: s.label, monthly: s.monthly })),
      },
      deductions: {
        federal: takeHome.federalTaxMonthly,
        state: takeHome.stateTaxMonthly,
        fica: takeHome.ficaMonthly,
        sgli: takeHome.sgliMonthly,
        tsp: takeHome.tspMonthly,
        tspPct,
        tspType,
      },
      grossMonthly: total,
      takeHomeMonthly: takeHome.takeHomeMonthly,
    };
    saveTransfer(transfer);
    router.push("/budget");
  }

  async function downloadBudget() {
    setExportError(null);
    try {
      if (effectiveReceivesBah && (!zip || zip.trim().length === 0)) {
        setExportError("Enter a duty ZIP code for BAH, or select Barracks / government housing (no BAH) before downloading the budget sheet.");
        return;
      }

      if (effectiveReceivesBah && bah === null) {
        setExportError("Enter a valid duty ZIP code for BAH, or select Barracks / government housing (no BAH) before downloading the budget sheet.");
        return;
      }

      setExporting(true);

      // PDF is generated entirely in the browser (with the pay-flow chart
      // embedded), so nothing leaves the device for the PDF export.
      if (format === "pdf") {
        const zip5 = effectiveReceivesBah
          ? String(zip ?? "").trim().match(/^(\d{5})(?:-\d{4})?$/)?.[1]
          : undefined;
        const summary = buildPaySummary({
          year,
          grade,
          yosLabel,
          zip5,
          receivesBah: effectiveReceivesBah,
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
        const safeZipPdf = effectiveReceivesBah
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
        zip: effectiveReceivesBah ? zip : "",
        withDependents: dependents,
        receivesBah: effectiveReceivesBah,
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
        setExportError(userMessage);
        return;
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);

      const safeZip = effectiveReceivesBah
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
      <PlanFlow current="pay" />
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
              2026 base pay, BAS, and BAH data last verified on{" "}
              {formatPayDataLastVerified()}.
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
              disabled={exporting || !gradeSelected}
              className="rounded-full border border-black bg-black px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
              title={
                gradeSelected
                  ? "Download your pay summary in the selected format."
                  : "Select your rank first to download a pay summary."
              }
            >
              {exporting ? "Preparing..." : "Download"}
            </button>

            {exportError && (
              <p
                role="alert"
                className="basis-full text-sm text-red-600 md:text-right"
              >
                {exportError}
              </p>
            )}
          </div>
        </div>

        <details className="mt-4 text-xs text-gray-500">
          <summary className="cursor-pointer font-medium text-gray-700 hover:text-[var(--brand-blue)]">
            What&apos;s in each export?
          </summary>
          <div className="mt-2 space-y-2">
            <p>
              <strong>CSV</strong>, <strong>PDF</strong>, and <strong>Text</strong> give a minimalist
              summary of just your pay numbers (monthly + annual) — handy for importing elsewhere,
              printing, or filing with your LES. The PDF is a clean, printable summary with your
              pay-flow chart.
            </p>
            <p>
              <strong>Excel</strong> gives the full budget workbook: a &quot;Start Here&quot; tab that
              pre-fills your pay and suggests a hybrid plan (Housing about BAH, Food about BAS, Savings
              target %). You can edit everything.
            </p>
          </div>
        </details>
      </section>

      <div className={splitLayout ? "grid gap-6 lg:grid-cols-2 lg:items-start" : "space-y-10"}>
        <section className="rounded-3xl border bg-white p-6 md:p-8 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Inputs (Start Here!)</h2>
              <p className="mt-1 text-sm text-gray-600">
                Set your year, grade, and time in service.
              </p>
            </div>
            {SHOW_LAYOUT_OPTIONS && (
              <span
                className="inline-flex w-fit shrink-0 items-center rounded-full border p-1 text-xs"
                role="group"
                aria-label="Input layout"
              >
                {([
                  { value: "horizontal", label: "Row" },
                  { value: "hybrid", label: "Hybrid" },
                  { value: "vertical", label: "Stacked" },
                ] as const).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setInputLayout(opt.value)}
                    className={`rounded-full px-3 py-1 font-medium transition ${
                      inputLayout === opt.value
                        ? "bg-[var(--field-bg)] text-[var(--field-text)]"
                        : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </span>
            )}
          </div>

        <div className={`mt-6 grid gap-4 ${inputGridClass}`}>
            <div>
              <label htmlFor="branch" className="block text-sm font-medium">Branch</label>
              <select
                id="branch"
                className="field mt-1 w-full rounded-xl px-3 py-2"
                value={branch}
                onChange={(e) => setBranch(e.target.value as BranchId | "")}
              >
                <option value="">Service branch</option>
                {BRANCHES.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="pay-year" className="block text-sm font-medium">Year</label>
              <select
                id="pay-year"
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
              <label htmlFor="pay-grade" className="block text-sm font-medium">Pay Grade</label>
              <select
                id="pay-grade"
                className="field mt-1 w-full rounded-xl px-3 py-2"
                value={gradeChoice}
                onChange={(e) => {
                  const nextChoice = e.target.value as PayGrade | "";
                  setGradeChoice(nextChoice);
                  if (nextChoice === "") return;
                  if (!isSpecialGrade(nextChoice) && !hasBasePayForYos(basepay, year, nextChoice, yos)) {
                    setYos(firstSupportedYos(basepay, year, nextChoice, yos));
                  }
                }}
              >
                <option value="">Rank</option>
                {GRADE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="years-of-service" className="block text-sm font-medium">
                Years of Service (YOS)
              </label>
              <select
                id="years-of-service"
                className="field mt-1 w-full rounded-xl px-3 py-2"
                value={yos}
                disabled={isSpecialGrade(grade)}
                onChange={(e) => setYos(Number(e.target.value))}
              >
                {YOS_OPTIONS.map((o) => {
                  const supported = hasBasePayForYos(basepay, year, grade, o.value);
                  return (
                  <option key={o.value} value={o.value} disabled={!supported}>
                    {o.label}
                  </option>
                  );
                })}
              </select>
              {isSpecialGrade(grade) ? (
                <p className="mt-2 text-xs text-[var(--muted)]">
                  {cadet
                    ? "Cadet / midshipman pay is a flat rate (35% of O-1) and does not vary by years of service."
                    : "This rate is for the first 4 months of service and does not vary by years of service."}
                </p>
              ) : (
                !basePayAvailable && (
                  <p className="mt-2 text-xs text-amber-700">
                    DFAS does not publish base pay for this grade at this years-of-service step.
                  </p>
                )
              )}
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
            </div>

            <p className={`mt-1 text-xs text-gray-500 ${inputSpanFull}`}>
              Used for the State tax disclaimer; set your state rate under take-home to include it.
            </p>

            <div className={`grid gap-3 ${nestedInputGridClass}`}>
              <div className={!receivesBah ? "opacity-60" : ""}>
                <label htmlFor="duty-zip" className="block text-sm font-medium">
                  Duty ZIP (for BAH)
                </label>
                <input
                  id="duty-zip"
                  className="field mt-1 w-full rounded-xl px-3 py-2 sm:w-44"
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
                {cadet ? (
                  <p className="text-xs text-[var(--muted)]">
                    Cadets and midshipmen receive housing, meals, and uniforms in kind, so no BAH or
                    BAS is added here.
                  </p>
                ) : (
                  <>
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

                    <div className={!receivesBah ? "opacity-60" : ""}>
                      <label htmlFor="family-size" className="block text-sm font-medium">
                        Family size, including yourself
                      </label>
                      <input
                        id="family-size"
                        type="number"
                        min={1}
                        max={20}
                        step={1}
                        className="field mt-1 w-full rounded-xl px-3 py-2 sm:w-40"
                        value={familySize}
                        disabled={!receivesBah}
                        onChange={(e) =>
                          setFamilySize(Math.max(1, Math.min(20, Math.floor(Number(e.target.value) || 1))))
                        }
                      />
                      <span className="mt-1 block text-xs text-gray-500">
                        {dependents
                          ? "Uses the BAH with-dependents rate."
                          : "Enter 2 or more to use the BAH with-dependents rate."}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="mt-8 border-t pt-6">
            <h2 className="text-lg font-semibold">Estimate your take-home (optional)</h2>
            <p className="mt-1 text-sm text-gray-600">
              Adds federal &amp; state tax, FICA, TSP, and SGLI to estimate what actually lands in
              your bank account.
            </p>
            <div className={`mt-6 grid items-start gap-4 ${takeHomeGridClass}`}>
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
                <div className="mt-1 flex items-center gap-2">
                  <div className="field flex flex-1 items-center rounded-xl px-3 py-2">
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
                  <button
                    type="button"
                    onClick={maxTsp}
                    disabled={basePay <= 0}
                    className="shrink-0 rounded-xl border px-3 py-2 text-sm font-medium hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                    title={`Set the % that reaches the ${fmtUSD0(TSP_ELECTIVE_DEFERRAL_LIMIT_2026)} annual limit.`}
                  >
                    Max
                  </button>
                </div>

                {/* Annual elective-deferral limit progress */}
                <div className="mt-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">2026 annual limit</span>
                    <span className="text-gray-500">
                      {fmtUSD0(Math.min(tspAnnualUncapped, TSP_ELECTIVE_DEFERRAL_LIMIT_2026))} /{" "}
                      {fmtUSD0(TSP_ELECTIVE_DEFERRAL_LIMIT_2026)}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
                    <div
                      className="h-1.5 rounded-full"
                      style={{
                        width: `${Math.min(100, tspPctToMax * 100)}%`,
                        backgroundColor:
                          tspPctToMax > 1 ? "#ef4444" : tspPctToMax >= 0.95 ? "#f59e0b" : "#22c55e",
                      }}
                    />
                  </div>
                  {tspPctToMax > 1 && (
                    <p className="mt-1 text-xs text-red-600">
                      Over the annual limit — payroll stops contributions once you hit{" "}
                      {fmtUSD0(TSP_ELECTIVE_DEFERRAL_LIMIT_2026)}.
                    </p>
                  )}
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
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Results</h2>
              <p className="mt-1 text-sm text-gray-600">
                Monthly totals with a clearer take-home picture.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={sendToBudget}
                disabled={!gradeSelected}
                className="w-fit rounded-full border border-black bg-black px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
                title={
                  gradeSelected
                    ? "Send these pay numbers to the Budget Builder to auto-fill a budget."
                    : "Select your rank first to build a budget from your pay."
                }
              >
                Send to Budget →
              </button>
              {gradeSelected ? (
                <Link
                  href="/toolkits/wealth-projector"
                  className="w-fit rounded-full border px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-100"
                  title="Open the Wealth Projector pre-filled with this grade, time in service, and TSP percentage."
                >
                  Project my wealth →
                </Link>
              ) : (
                <span
                  className="w-fit cursor-not-allowed rounded-full border px-4 py-2 text-sm font-medium text-gray-400 opacity-60 shadow-sm"
                  title="Select your rank first — the projection starts from your pay."
                >
                  Project my wealth →
                </span>
              )}
            </div>
          </div>

          {!gradeSelected && (
            <div className="mt-6 rounded-3xl border border-dashed bg-gray-50 p-8 text-center">
              <p className="text-base font-medium text-gray-700">
                Select your rank to see your pay.
              </p>
              <p className="mt-1 text-sm text-gray-500">
                Choose a service branch and rank in the inputs above and your monthly
                and annual totals will appear here.
              </p>
            </div>
          )}

          {gradeSelected && (
          <>
          <div className="mt-6 rounded-3xl border bg-white p-6 md:p-8 shadow-sm">
            <div className="text-sm text-gray-600">
              Estimated monthly total
            </div>
            <div
              className="mt-2 cursor-help text-4xl font-bold tracking-tight"
              title="Base Pay + BAH + BAS + any special pays you added — your gross monthly military compensation before taxes and deductions."
            >
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
              {fmtUSD0(civilianEquivalent.salaryNeeded)}
              <span className="text-base font-normal text-gray-500"> /yr</span>
            </div>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              That is{" "}
              <span className="font-semibold">
                {fmtUSD0(civilianEquivalent.premiumOverGross)} (
                {(civilianEquivalent.premiumPct * 100).toFixed(1)}%)
              </span>{" "}
              more than your {fmtUSD0(civilianEquivalent.military.grossAnnual)} military cash total.
              A civilian salary is taxed on every dollar, while your{" "}
              {fmtUSD0(civilianEquivalent.military.nonTaxableAnnual)} in BAH, BAS, and non-taxable
              special pays is exempt from federal, state, and FICA tax — so a civilian job must pay
              more before tax to leave the same cash after tax.
            </p>
            <p className="mt-2 text-xs text-gray-500">
              Cash comparison only. It excludes military healthcare, the BRS pension and automatic +
              matching TSP contributions, and other benefits — so your true total compensation is
              higher than even this number.
            </p>
          </div>

          <div className="mt-4 rounded-2xl border p-5">
            <div className="text-sm font-medium">Side-by-side: where the difference comes from</div>
            <div className="mt-4 grid gap-6 sm:grid-cols-2">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Your military pay (annual)
                </div>
                <div className="mt-2 space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Cash compensation</span>
                    <span className="font-medium">{fmtUSD0(civilianEquivalent.military.grossAnnual)}</span>
                  </div>
                  <div className="flex items-center justify-between pl-4 text-xs text-gray-500">
                    <span>Taxable (base + taxable specials)</span>
                    <span>{fmtUSD0(civilianEquivalent.military.taxableAnnual)}</span>
                  </div>
                  <div className="flex items-center justify-between pl-4 text-xs text-gray-500">
                    <span>Tax-free (BAH + BAS + non-taxable)</span>
                    <span>{fmtUSD0(civilianEquivalent.military.nonTaxableAnnual)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-gray-600">
                      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#ef4444" }} />
                      Federal income tax (est.)
                    </span>
                    <span className="font-medium">− {fmtUSD0(civilianEquivalent.military.federalAnnual)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-gray-600">
                      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#f97316" }} />
                      State income tax (est.)
                    </span>
                    <span className="font-medium">− {fmtUSD0(civilianEquivalent.military.stateAnnual)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-gray-600">
                      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#eab308" }} />
                      FICA (taxable wages only)
                    </span>
                    <span className="font-medium">− {fmtUSD0(civilianEquivalent.military.ficaAnnual)}</span>
                  </div>
                  <div className="flex items-center justify-between border-t pt-2">
                    <span className="flex items-center gap-2 font-medium">
                      <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
                      After-tax cash
                    </span>
                    <span className="font-bold">{fmtUSD0(civilianEquivalent.military.afterTaxAnnual)}</span>
                  </div>
                  <div className="text-xs text-gray-500">
                    Effective tax rate on total cash:{" "}
                    {(civilianEquivalent.military.effectiveTaxRate * 100).toFixed(1)}%
                  </div>
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Civilian job to match it (annual)
                </div>
                <div className="mt-2 space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Salary needed (fully taxable)</span>
                    <span className="font-medium">{fmtUSD0(civilianEquivalent.civilian.salary)}</span>
                  </div>
                  <div className="flex items-center justify-between pl-4 text-xs text-gray-500">
                    <span>Taxable after 401(k) + standard deduction</span>
                    <span>{fmtUSD0(civilianEquivalent.civilian.federalTaxable)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-gray-600">
                      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#ef4444" }} />
                      Federal income tax
                    </span>
                    <span className="font-medium">− {fmtUSD0(civilianEquivalent.civilian.federal)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-gray-600">
                      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#f97316" }} />
                      State income tax
                    </span>
                    <span className="font-medium">− {fmtUSD0(civilianEquivalent.civilian.state)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-gray-600">
                      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#eab308" }} />
                      FICA (on the whole salary)
                    </span>
                    <span className="font-medium">− {fmtUSD0(civilianEquivalent.civilian.fica)}</span>
                  </div>
                  <div className="flex items-center justify-between border-t pt-2">
                    <span className="flex items-center gap-2 font-medium">
                      <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
                      After-tax cash
                    </span>
                    <span className="font-bold">{fmtUSD0(civilianEquivalent.civilian.afterTax)}</span>
                  </div>
                  <div className="text-xs text-gray-500">
                    Effective tax rate: {(civilianEquivalent.civilian.effectiveTaxRate * 100).toFixed(1)}%
                    {" · "}matched to your military after-tax cash within $
                    {civilianEquivalent.matchError < 0.01
                      ? "0.01"
                      : civilianEquivalent.matchError.toFixed(2)}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <details className="mt-4 rounded-2xl border p-5">
            <summary className="cursor-pointer text-sm font-medium">
              Show the math — full receipts
            </summary>
            <div className="mt-4 space-y-6">
              {[
                { title: "Step 1 — your military after-tax cash", lines: civilianEquivalent.militaryReceipt },
                { title: "Step 2 — solve and verify the civilian salary", lines: civilianEquivalent.civilianReceipt },
              ].map((section) => (
                <div key={section.title}>
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    {section.title}
                  </div>
                  <div className="mt-2 divide-y text-sm">
                    {section.lines.map((line: ReceiptLine) => (
                      <div key={line.id} className="py-2">
                        <div className="flex items-baseline justify-between gap-4">
                          <span className={line.kind === "result" || line.kind === "check" ? "font-medium" : "text-gray-600"}>
                            {line.label}
                          </span>
                          <span className={line.kind === "result" || line.kind === "check" ? "font-bold" : "font-medium"}>
                            {line.kind === "deduction" ? "− " : ""}
                            {fmtUSD0(line.value)}
                          </span>
                        </div>
                        <div className="mt-0.5 text-xs text-gray-500">{line.formula}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <p className="text-xs leading-5 text-gray-500">
                Both columns run through the same tax engine as the take-home tab (2026 federal
                brackets and standard deduction, your flat state rate, and statutory FICA rates), so
                the military figures here match your Summary tab to the dollar. The civilian salary is
                solved by bisection rather than a marginal-rate shortcut: a flat gross-up taxes every
                civilian dollar at a single rate, ignoring both the standard deduction on the first
                dollars and any higher brackets the larger civilian salary reaches. The solver&apos;s
                answer is verified above by recomputing the civilian&apos;s taxes at the solved salary.
              </p>
            </div>
          </details>

          <div className="mt-4 rounded-2xl border p-5">
            <div className="text-sm font-medium">Assumptions & limits</div>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-xs leading-5 text-gray-600">
              {CIVILIAN_EQUIVALENT_ASSUMPTIONS.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
            <div className="mt-4 text-sm font-medium">Sources</div>
            <ul className="mt-2 space-y-1.5 text-xs">
              {CIVILIAN_EQUIVALENT_SOURCES.map((s) => (
                <li key={s.href}>
                  <a
                    href={s.href}
                    target="_blank"
                    rel="noreferrer"
                    className="text-gray-600 underline decoration-gray-300 underline-offset-2 hover:text-[var(--brand-blue)]"
                  >
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
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
                      onChange={(e) => {
                        const nextGrade = e.target.value as PayGrade;
                        setBGrade(nextGrade);
                        if (!hasBasePayForYos(basepay, year, nextGrade, bYos)) {
                          setBYos(firstSupportedYos(basepay, year, nextGrade, bYos));
                        }
                      }}
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
                      {YOS_OPTIONS.map((o) => {
                        const supported = hasBasePayForYos(basepay, year, bGrade, o.value);
                        return (
                        <option key={o.value} value={o.value} disabled={!supported}>
                          {o.label}
                        </option>
                        );
                      })}
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
