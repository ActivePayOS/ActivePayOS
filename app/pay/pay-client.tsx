"use client";

import { useMemo, useState } from "react";
import { getBahLookup } from "@/lib/pay/bah";
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

const PDF_LAYOUTS: { value: PdfLayout; label: string }[] = [
  { value: "classic", label: "Classic" },
  { value: "modern", label: "Modern" },
  { value: "compact", label: "Compact card" },
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
  const [yos, setYos] = useState<number>(0);
  const [zip, setZip] = useState<string>("");
  const [receivesBah, setReceivesBah] = useState<boolean>(true);
  const [dependents, setDependents] = useState<boolean>(false);
  const [stateOfLegalResidence, setStateOfLegalResidence] = useState<string>("");
  const stateTaxContext = useMemo(
    () => getStateTaxContext(stateOfLegalResidence),
    [stateOfLegalResidence]
  );

  // "Premium export" knobs (hidden for now, but ready)
  const [tspPct] = useState<number>(0.10);
  const [savingsTargetPct] = useState<number>(0.20);
  const [housingTargetPct] = useState<number>(1.0);
  const [foodTargetPct] = useState<number>(1.0);
  const [stateTaxPct] = useState<number>(0);

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

  const taxableIncomeMonthly = basePay;
  const nonTaxableIncomeMonthly = (bah ?? 0) + basRate;
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
    ];
    const sum = p.reduce((a, x) => a + (x.value ?? 0), 0);
    return { p, sum };
  }, [basePay, bah, basRate, receivesBah]);

  const yosLabel = useMemo(() => {
    const found = YOS_OPTIONS.find((o) => o.value === yos);
    return found?.label ?? "< 2";
  }, [yos]);

  const [exporting, setExporting] = useState(false);
  const [format, setFormat] = useState<ExportFormat>("csv");
  const [pdfLayout, setPdfLayout] = useState<PdfLayout>("classic");
  const [resultsView, setResultsView] = useState<"summary" | "visuals">("summary");

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
        otherIncomeMonthly: 0,

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
      const layoutSuffix = format === "pdf" ? `_${pdfLayout}` : "";
      const a = document.createElement("a");
      a.href = url;
      a.download = `activepayos_${stem}_${safeZip || "ZIP"}_${grade}_${year}${layoutSuffix}.${EXPORT_EXT[format]}`;
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
      <header className="rounded-3xl border bg-white p-6 md:p-8 shadow-sm">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              Pay Calculator
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              Monthly pay components with a clear taxable vs non-taxable breakdown.
            </p>
            <p className="mt-2 text-xs text-gray-500">
              2026 base pay, BAS, and BAH data last verified on April 29, 2026.
            </p>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 md:mt-0">
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

            {format === "pdf" && (
              <select
                aria-label="PDF layout"
                value={pdfLayout}
                onChange={(e) => setPdfLayout(e.target.value as PdfLayout)}
                className="field rounded-full px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-black/20"
                title="Choose a PDF layout"
              >
                {PDF_LAYOUTS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label} layout
                  </option>
                ))}
              </select>
            )}

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
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-3xl border bg-white p-6 md:p-8 shadow-sm">
          <h2 className="text-lg font-semibold">Inputs (Start Here!)</h2>
          <p className="mt-1 text-sm text-gray-600">
            Set your year, grade, and time in service.
          </p>

          <div className="mt-6 grid gap-4">
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
              <label htmlFor="years-of-service" className="block text-sm font-medium">
                Years of Service (YOS)
              </label>
              <select
                id="years-of-service"
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

            <div className="grid gap-3 md:grid-cols-2">
              <div className={!receivesBah ? "opacity-60" : ""}>
                <label htmlFor="duty-zip" className="block text-sm font-medium">
                  Duty ZIP (for BAH)
                </label>
                <input
                  id="duty-zip"
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

            <div className="rounded-2xl border bg-gray-50 p-4 text-xs text-gray-600">
              <div className="font-medium text-gray-900">Export options</div>
              <p className="mt-1">
                Use the format picker by the Download button. <strong>CSV</strong>, <strong>PDF</strong>, and{" "}
                <strong>Text</strong> give a minimalist summary of just your pay numbers (monthly + annual) — handy
                for importing elsewhere, printing, or filing with your LES. The PDF offers Classic, Modern, and
                Compact layouts.
              </p>
              <p className="mt-2">
                <strong>Excel</strong> gives the full budget workbook: a &quot;Start Here&quot; tab that pre-fills your
                pay and suggests a hybrid plan (Housing about BAH, Food about BAS, Savings target %). You can edit
                everything.
              </p>
            </div>
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
          <div className="mt-6 inline-flex rounded-full border p-1 text-sm">
            <button
              type="button"
              onClick={() => setResultsView("summary")}
              className={`rounded-full px-4 py-1.5 font-medium transition ${
                resultsView === "summary"
                  ? "bg-[var(--field-bg)] text-[var(--field-text)]"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Summary
            </button>
            <button
              type="button"
              onClick={() => setResultsView("visuals")}
              className={`rounded-full px-4 py-1.5 font-medium transition ${
                resultsView === "visuals"
                  ? "bg-[var(--field-bg)] text-[var(--field-text)]"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Visuals
            </button>
          </div>

          {resultsView === "visuals" && (
            <div className="mt-6 space-y-6">
              <div className="grid gap-6 sm:grid-cols-2 sm:items-center">
                <div className="flex items-center justify-center">
                  <div className="relative h-44 w-44">
                    <div
                      className="h-full w-full rounded-full"
                      style={{
                        background: `conic-gradient(var(--brand-blue) 0 ${pctBase}%, #10b981 ${pctBase}% ${pctBase + pctBah}%, #f59e0b ${pctBase + pctBah}% 100%)`,
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
              <div className="text-sm font-medium">Estimated FICA Tax</div>
              <div className="mt-1 text-xs text-gray-500">Social Security (6.2%) + Medicare (1.45%) on base pay.</div>
              <div className="mt-3 text-2xl font-bold">{fmtUSD(estimatedFicaTotal)}</div>
              <div className="mt-1 text-xs text-gray-500">
                SS: {fmtUSD(estimatedSocialSecurity)} - Medicare: {fmtUSD(estimatedMedicare)}
              </div>
            </div>

            <div className="rounded-2xl border p-4">
              <div className="text-sm font-medium">Income After FICA</div>
              <div className="mt-1 text-xs text-gray-500">
                Before federal/state withholding, TSP, SGLI, and other deductions.
              </div>
              <div className="mt-3 text-2xl font-bold">{fmtUSD(estimatedTakeHomeBeforeWithholding)}</div>
              <div className="mt-1 text-xs text-gray-500">
                Annual {fmtUSD0(annual.takeHomeBeforeWithholding)}
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border bg-gray-50 p-4 text-xs text-gray-600">
            <div className="font-medium text-gray-900">Important note</div>
            <p className="mt-1">
              This view shows a cleaner split between taxable and non-taxable military pay.
              Base pay is taxable. BAH and BAS are generally non-taxable. Actual take-home pay
              depends on federal withholding, state of legal residence, TSP contributions, SGLI,
              and any special pays or deductions on your LES.
            </p>
          </div>

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
    </main>
  );
}
