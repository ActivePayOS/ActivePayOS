"use client";

import { useMemo, useState } from "react";
import { getBahRate } from "@/lib/pay/bah";

type PayGrade =
  | "O-1" | "O-2" | "O-3" | "O-4" | "O-5" | "O-6" | "O-7" | "O-8" | "O-9" | "O-10"
  | "W-1" | "W-2" | "W-3" | "W-4" | "W-5"
  | "E-1" | "E-2" | "E-3" | "E-4" | "E-5" | "E-6" | "E-7" | "E-8" | "E-9"
  | "O-1E" | "O-2E" | "O-3E";

const YEARS = [2026] as const;

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
    : "—";
}

function fmtUSD0(v: number | null | undefined) {
  return typeof v === "number" && Number.isFinite(v) && v >= 0
    ? new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
      }).format(v)
    : "—";
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

function getBasePayFromData(basepay: any, year: number, grade: PayGrade, yos: number): number {
  if (!basepay || basepay.year !== year) return 0;
  const key = tableKeyForGrade(grade);
  const row: (number | null)[] | undefined = basepay?.tables?.[key]?.[grade];
  if (!row) return 0;
  const idx = yosToIndex(yos);
  const v = row[idx];
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function getBasFromData(bas: any, year: number, grade: PayGrade): number {
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
  basepay: any;
  bas: any;
}) {
  const [year, setYear] = useState<(typeof YEARS)[number]>(
    (YEARS.includes(initialYear as any) ? (initialYear as any) : YEARS[0]) as any
  );
  const [grade, setGrade] = useState<PayGrade>("O-1");
  const [yos, setYos] = useState<number>(0);
  const [zip, setZip] = useState<string>("");
  const [dependents, setDependents] = useState<boolean>(false);

  // “Premium export” knobs (hidden for now, but ready)
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

  const bah = useMemo(() => getBahRate(zip, grade, dependents), [zip, grade, dependents]);

  const bahError = useMemo(() => {
    if (!zip || zip.trim().length === 0) return null;
    return bah === null
      ? "BAH data unavailable for this ZIP (invalid ZIP, unsupported territory/APO, or missing dataset). Try a nearby ZIP."
      : null;
  }, [zip, bah]);

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

  const parts = useMemo(() => {
    const p: { label: string; value: number | null; hint: string }[] = [
      { label: "Base Pay", value: basePay, hint: "Taxable. From DFAS pay tables (grade + YOS)." },
      { label: "BAH", value: bah, hint: "Usually non-taxable. From DTMO (ZIP + dependents)." },
      { label: "BAS", value: basRate, hint: "Usually non-taxable. Standard DFAS rate (not location-based)." },
    ];
    const sum = p.reduce((a, x) => a + (x.value ?? 0), 0);
    return { p, sum };
  }, [basePay, bah, basRate]);

  const yosLabel = useMemo(() => {
    const found = YOS_OPTIONS.find((o) => o.value === yos);
    return found?.label ?? "< 2";
  }, [yos]);

  const [exporting, setExporting] = useState(false);

  async function downloadBudgetXlsx() {
    try {
      setExporting(true);

      const payload = {
        year,
        grade,
        yosLabel,
        zip,
        withDependents: dependents,

        basePayMonthly: basePay,
        bahMonthly: bah ?? 0,
        basMonthly: basRate,
        otherIncomeMonthly: 0,

        housingTargetPct,
        foodTargetPct,
        savingsTargetPct,
        tspPct,
        stateTaxPct,
      };

      const res = await fetch("/api/export-budget", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const msg = await res.text().catch(() => "");
        alert(`Export failed. ${msg || "Check server logs."}`);
        return;
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);

      const safeZip = String(zip ?? "").trim().slice(0, 10).replace(/[^0-9-]/g, "");
      const a = document.createElement("a");
      a.href = url;
      a.download = `OfficerOS_Budget_${safeZip || "ZIP"}_${grade}_${year}.xlsx`;
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
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 md:mt-0">
            <span className="rounded-full border bg-gray-50 px-3 py-1 text-xs text-gray-700">
              Data: Base Pay + BAS + BAH (Live)
            </span>

            <button
            type="button"
            onClick={downloadBudgetXlsx}
            disabled={exporting}
            className="rounded-full border border-black bg-black px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
            title="Downloads an Excel budget workbook pre-filled with your pay + hybrid suggested plan."
          >
            {exporting ? "Preparing export…" : "Download Budget Sheet"}
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
              <label className="block text-sm font-medium">Year</label>
              <select
                className="mt-1 w-full rounded-xl border bg-white px-3 py-2"
                value={year}
                onChange={(e) => setYear(Number(e.target.value) as any)}
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
                className="mt-1 w-full rounded-xl border bg-white px-3 py-2"
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
                className="mt-1 w-full rounded-xl border bg-white px-3 py-2"
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

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium">
                  Duty ZIP (for BAH)
                </label>
                <input
                  className="mt-1 w-full rounded-xl border bg-white px-3 py-2"
                  placeholder="02139"
                  value={zip}
                  onChange={(e) => setZip(e.target.value)}
                />
                <p className="mt-1 text-xs text-gray-500">
                  Tip: ZIP+4 works too (e.g., 02139-1234).
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  Note: Many junior enlisted members living in barracks or government housing do not receive BAH.
                  Verify with your LES.
                </p>
                {bahError && (
                  <p className="mt-2 text-sm text-red-600">
                    {bahError}
                  </p>
                )}
              </div>

              <label className="mt-6 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={dependents}
                  onChange={(e) => setDependents(e.target.checked)}
                />
                With dependents
              </label>
            </div>

            <div className="rounded-2xl border bg-gray-50 p-4 text-xs text-gray-600">
              <div className="font-medium text-gray-900">Budget export</div>
              <p className="mt-1">
                The download includes a “Start Here” tab that pre-fills your pay and suggests
                a hybrid plan (Housing ≈ BAH, Food ≈ BAS, Savings target %). You can edit everything.
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
                SS: {fmtUSD(estimatedSocialSecurity)} · Medicare: {fmtUSD(estimatedMedicare)}
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
                        {parts.sum > 0 ? `${pct.toFixed(0)}%` : "—"}
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