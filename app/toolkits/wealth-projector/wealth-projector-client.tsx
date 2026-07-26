"use client";

import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { fmtUSD0 } from "@/lib/sankey/model";
import {
  DEFAULT_FUND_ALLOCATION,
  TSP_ELECTIVE_DEFERRAL_LIMIT_2026,
  TSP_FUNDS,
  type FundAllocation,
  type TspFundKey,
} from "@/lib/pay/tsp";
import { blendedAnnualReturn, brsAgencyPct, yearsToDouble } from "@/lib/projection/wealth";
import {
  projectCareerWealth,
  upcomingPromotions,
  type CareerProjectionInput,
} from "@/lib/projection/career";
import {
  applyAssignments,
  budgetContributionCandidates,
  type ContributionDestination,
} from "@/lib/projection/budget-link";
import { basePayFor, type BasePayDataset } from "@/lib/pay/basepay-lookup";
import { BRANCH_OPTIONS, type BranchId, type Track } from "@/data/promotion/timing";
import {
  ACCOUNT_COLORS,
  FlowsChart,
  GrowthChart,
  PayRankChart,
  gradeColor,
} from "@/components/charts/WealthCharts";
import fundPerformance from "@/data/tsp/fund-performance.json";
import PlanFlow from "@/components/PlanFlow";
import Explain from "@/components/Explain";
import InfoDot from "@/components/InfoDot";
import { loadPaySnapshot } from "@/lib/profile/handoff";
import {
  generateProjectionCsv,
  generateProjectionTxt,
  type ProjectionExport,
} from "@/lib/export/projection";
import { generateProjectionPdf } from "@/lib/export/projection-pdf";
import { downloadPng, downloadSvg, svgToPngBytes } from "@/lib/sankey/export";

const emptySubscribe = () => () => {};

type ReturnPreset = "longRun" | "tenYear" | "custom";
type HorizonMode = "separation" | "age";
type ResultTab = "growth" | "pay" | "flows" | "table";

const RESULT_TABS: { value: ResultTab; label: string }[] = [
  { value: "growth", label: "Growth" },
  { value: "pay", label: "Pay & Rank" },
  { value: "flows", label: "In vs. Growth" },
  { value: "table", label: "Table" },
];

type FundPerf = {
  asOf: string;
  funds: Record<TspFundKey, { name: string; longRunPct: number; tenYearPct: number }>;
  calendarReturnsPct: Record<string, Record<TspFundKey, number>>;
  otherAssets: {
    sp500LongRunPct: number;
    savingsApyPct: number;
    inflationPct: number;
  };
};
const PERF = fundPerformance as unknown as FundPerf;
const FUND_KEYS = TSP_FUNDS.map((f) => f.key);

const ENLISTED_GRADES = ["E-1", "E-2", "E-3", "E-4", "E-5", "E-6", "E-7", "E-8", "E-9"];
const OFFICER_GRADES = ["O-1", "O-2", "O-3", "O-4", "O-5", "O-6"];

// One-time read of the saved Budget Builder state (used for prefill and the
// "Use your budget" contribution assignments). Shape is best-effort — every
// consumer guards the fields it reads.
type StoredBudget = {
  income?: Array<{ id?: string; label?: string; amount?: number }>;
  expenses?: Array<{ id?: string; label?: string; amount?: number }>;
  tspPct?: number;
  tspBaseId?: string;
  fundAlloc?: FundAllocation;
};

function loadSavedBudgetRaw(): StoredBudget | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("activepayos:budget:v1");
    return raw ? (JSON.parse(raw) as StoredBudget) : null;
  } catch {
    return null;
  }
}

function loadBudgetPrefill(): { tspPct?: number; fundAlloc?: FundAllocation } {
  try {
    const parsed = loadSavedBudgetRaw();
    if (!parsed) return {};
    return {
      tspPct: typeof parsed?.tspPct === "number" && parsed.tspPct > 0 ? parsed.tspPct : undefined,
      fundAlloc:
        parsed?.fundAlloc && typeof parsed.fundAlloc === "object" ? parsed.fundAlloc : undefined,
    };
  } catch {
    return {};
  }
}

export default function WealthProjectorClient({ basepay }: { basepay: BasePayDataset }) {
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);

  // ---- Career (pre-filled from the Pay Calculator's snapshot when present) ----
  const [paySnap] = useState(loadPaySnapshot);
  const [branch, setBranch] = useState<BranchId>(() => paySnap?.branch ?? "army");
  const [track, setTrack] = useState<Track>(() => paySnap?.track ?? "enlisted");
  const [grade, setGrade] = useState(() => paySnap?.grade ?? "E-4");
  const [yosNow, setYosNow] = useState(() => paySnap?.yos ?? 4);
  const [modelPromotions, setModelPromotions] = useState(true);
  const [payRaisePct, setPayRaisePct] = useState(2.0);

  // ---- Service window & projection horizon (independent) ----
  const [currentAge, setCurrentAge] = useState(22);
  const [serviceYears, setServiceYears] = useState(5);
  const [horizonMode, setHorizonMode] = useState<HorizonMode>("age");
  const [targetAge, setTargetAge] = useState(60);
  const [inflationPct, setInflationPct] = useState(PERF.otherAssets.inflationPct);

  // ---- TSP ----
  const [prefill] = useState(loadBudgetPrefill);
  const [tspBalance, setTspBalance] = useState(5000);
  const [contribPct, setContribPct] = useState(
    () => paySnap?.tspPct ?? prefill.tspPct ?? 0.05
  );
  const [brs, setBrs] = useState(true);
  const [alloc, setAlloc] = useState<FundAllocation>(
    () => prefill.fundAlloc ?? DEFAULT_FUND_ALLOCATION
  );
  const [preset, setPreset] = useState<ReturnPreset>("longRun");
  const [customReturns, setCustomReturns] = useState<Record<TspFundKey, number>>(() =>
    Object.fromEntries(FUND_KEYS.map((k) => [k, PERF.funds[k].longRunPct])) as Record<
      TspFundKey,
      number
    >
  );
  const [showTspDetail, setShowTspDetail] = useState(false);

  // ---- "Use your budget" contribution assignments ----
  const [candidates] = useState(() => budgetContributionCandidates(loadSavedBudgetRaw()));
  const [assignments, setAssignments] = useState<Record<string, ContributionDestination>>({});
  const [showAllRows, setShowAllRows] = useState(false);
  const [budgetNote, setBudgetNote] = useState<string | null>(null);

  // ---- Taxable investments & savings (during and after service) ----
  const [invBalance, setInvBalance] = useState(1000);
  const [invMonthly, setInvMonthly] = useState(100);
  const [invMonthlyAfter, setInvMonthlyAfter] = useState(100);
  const [invReturnPct, setInvReturnPct] = useState(PERF.otherAssets.sp500LongRunPct);
  const [savBalance, setSavBalance] = useState(2000);
  const [savMonthly, setSavMonthly] = useState(150);
  const [savMonthlyAfter, setSavMonthlyAfter] = useState(150);
  const [savApyPct, setSavApyPct] = useState(PERF.otherAssets.savingsApyPct);

  const [tab, setTab] = useState<ResultTab>("growth");

  // ---- Exports (all generated in-browser) ----
  const [reportFormat, setReportFormat] = useState<"csv" | "txt" | "pdf">("csv");
  const [exporting, setExporting] = useState(false);
  // Offscreen light-themed chart used for PNG/SVG/PDF export from any tab.
  const exportChartRef = useRef<SVGSVGElement>(null);

  // ---- Derived ----
  const fundReturns = useMemo(() => {
    return Object.fromEntries(
      FUND_KEYS.map((k) => [
        k,
        (preset === "longRun"
          ? PERF.funds[k].longRunPct
          : preset === "tenYear"
          ? PERF.funds[k].tenYearPct
          : customReturns[k]) / 100,
      ])
    ) as Record<TspFundKey, number>;
  }, [preset, customReturns]);

  const tspReturn = blendedAnnualReturn(alloc, fundReturns);

  const projectionYears =
    horizonMode === "separation"
      ? Math.max(1, serviceYears)
      : Math.max(Math.max(1, serviceYears), Math.min(70, targetAge - currentAge));

  const careerInput: CareerProjectionInput = useMemo(
    () => ({
      basepay,
      branch,
      track,
      currentGrade: grade,
      currentYosYears: Math.max(0, yosNow),
      serviceYearsRemaining: serviceYears,
      modelPromotions,
      annualPayRaise: Math.max(0, payRaisePct) / 100,
      projectionYears,
      currentAge,
      tspBalance,
      tspPct: contribPct,
      brs,
      tspReturn,
      invBalance,
      invMonthly,
      invMonthlyAfter,
      invReturn: invReturnPct / 100,
      savBalance,
      savMonthly,
      savMonthlyAfter,
      savReturn: savApyPct / 100,
      inflation: Math.max(0, inflationPct) / 100,
    }),
    [
      basepay,
      branch,
      track,
      grade,
      yosNow,
      serviceYears,
      modelPromotions,
      payRaisePct,
      projectionYears,
      currentAge,
      tspBalance,
      contribPct,
      brs,
      tspReturn,
      invBalance,
      invMonthly,
      invMonthlyAfter,
      invReturnPct,
      savBalance,
      savMonthly,
      savMonthlyAfter,
      savApyPct,
      inflationPct,
    ]
  );

  const projection = useMemo(() => projectCareerWealth(careerInput), [careerInput]);

  // Stay-3-more-years comparison at the same end age, for the trade space.
  const stayLonger = useMemo(() => {
    const cmpYears = Math.max(projectionYears, serviceYears + 3);
    return {
      base: projectCareerWealth({ ...careerInput, projectionYears: cmpYears }),
      extended: projectCareerWealth({
        ...careerInput,
        serviceYearsRemaining: serviceYears + 3,
        projectionYears: cmpYears,
      }),
    };
  }, [careerInput, projectionYears, serviceYears]);

  const startYear = new Date().getFullYear();
  const endYear = startYear + projectionYears;
  const sepYear = startYear + serviceYears;
  const promotionsPreview = useMemo(
    () =>
      modelPromotions
        ? upcomingPromotions(branch, track, grade, Math.max(0, yosNow), serviceYears)
        : [],
    [modelPromotions, branch, track, grade, yosNow, serviceYears]
  );

  const basePayNow = basePayFor(basepay, grade, Math.max(0, yosNow));
  const employeeNow = Math.min(
    (basePayNow ?? 0) * contribPct,
    TSP_ELECTIVE_DEFERRAL_LIMIT_2026 / 12
  );
  const agencyNow = brs ? (basePayNow ?? 0) * brsAgencyPct(contribPct) : 0;

  // "What did my military time get me": TSP at separation, compounding alone.
  const militaryTspAtEnd = useMemo(() => {
    const sep = projection.atSeparation;
    if (!sep) return null;
    const yearsAfter = projectionYears - sep.yearIndex;
    if (yearsAfter <= 0) return null;
    return sep.balances.tsp * Math.pow(1 + tspReturn, yearsAfter);
  }, [projection.atSeparation, projectionYears, tspReturn]);

  const doubling = yearsToDouble(tspReturn);
  const allocTotal = FUND_KEYS.reduce((a, k) => a + (alloc[k] || 0), 0);
  const startBalances = {
    tsp: Math.max(0, tspBalance),
    invest: Math.max(0, invBalance),
    savings: Math.max(0, savBalance),
  };

  const pctInput = "field w-16 rounded-lg px-2 py-1 text-right text-sm outline-none";

  function num(v: string, fallback = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  const destinationOf = (id: string, suggested: ContributionDestination) =>
    assignments[id] ?? suggested;
  const visibleCandidates = showAllRows
    ? candidates
    : candidates.filter((c) => destinationOf(c.id, c.suggested) !== "skip");
  const assignedTotals = applyAssignments(candidates, assignments);

  function buildProjectionExport(): ProjectionExport {
    const branchLabel = BRANCH_OPTIONS.find((b) => b.value === branch)?.label ?? branch;
    return {
      generatedOn: new Date().toISOString().slice(0, 10),
      scenario: {
        branchLabel,
        track,
        grade,
        yos: yosNow,
        currentAge,
        serviceYears,
        projectionYears,
        endYear,
        tspPct: contribPct,
        brs,
        tspReturnPct: Math.round(tspReturn * 1000) / 10,
        invReturnPct,
        savApyPct,
        inflationPct,
        payRaisePct,
        modelPromotions,
      },
      promotions: projection.promotions.map((p) => ({
        year: startYear + Math.floor(p.monthIndex / 12),
        grade: p.toGrade,
        competitive: p.competitive,
      })),
      years: projection.years.map((s) => ({
        year: startYear + s.yearIndex,
        age: s.age,
        serving: s.serving,
        grade: s.grade,
        basePayMonthly: s.basePayMonthly,
        tsp: s.balances.tsp,
        invest: s.balances.invest,
        savings: s.balances.savings,
        total: s.total,
        realTotal: s.realTotal,
      })),
      totals: {
        final: projection.final.total,
        finalReal: projection.final.realTotal,
        atSeparation: projection.atSeparation?.total ?? null,
        separationYear: serviceYears > 0 ? sepYear : null,
        contributed: projection.totals.contributed,
        growth: projection.totals.growth,
        agencyMatch: projection.totals.agencyMatch,
      },
    };
  }

  function triggerDownload(body: BlobPart, mime: string, filename: string) {
    const url = window.URL.createObjectURL(new Blob([body], { type: mime }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  }

  async function downloadReport() {
    setExporting(true);
    try {
      const data = buildProjectionExport();
      const stem = `activepayos_WealthProjection_${grade}_${endYear}`;
      if (reportFormat === "csv") {
        triggerDownload(generateProjectionCsv(data), "text/csv;charset=utf-8", `${stem}.csv`);
      } else if (reportFormat === "txt") {
        triggerDownload(generateProjectionTxt(data), "text/plain;charset=utf-8", `${stem}.txt`);
      } else {
        let chartPng: Uint8Array | undefined;
        if (exportChartRef.current) {
          try {
            chartPng = await svgToPngBytes(exportChartRef.current, 2, "#ffffff");
          } catch {
            // fall back to a chartless PDF
          }
        }
        const bytes = await generateProjectionPdf(data, chartPng);
        triggerDownload(new Uint8Array(bytes), "application/pdf", `${stem}.pdf`);
      }
    } finally {
      setExporting(false);
    }
  }

  function exportChartPng() {
    if (exportChartRef.current) {
      downloadPng(exportChartRef.current, "activepayos_wealth_projection.png", 2, "#ffffff");
    }
  }
  function exportChartSvg() {
    if (exportChartRef.current) {
      downloadSvg(exportChartRef.current, "activepayos_wealth_projection.svg");
    }
  }

  function applyBudgetAssignments() {
    setSavMonthly(assignedTotals.savingsMonthly);
    setInvMonthly(assignedTotals.investMonthly);
    setBudgetNote(
      `Applied to your in-service pace — savings ${fmtUSD0(
        assignedTotals.savingsMonthly
      )}/mo, investments ${fmtUSD0(assignedTotals.investMonthly)}/mo. After-service amounts are set separately below.`
    );
  }

  return (
    <main className="space-y-8">
      <PlanFlow current="project" />
      <header className="rounded-3xl border bg-white p-6 md:p-8 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Wealth Projector</h1>
            <p className="mt-2 max-w-2xl text-sm text-gray-600">
              Decide how long you serve and how far you look: typical promotions drive your pay,
              pay drives your TSP and match, and everything compounds to any age you pick — so you
              can see exactly what your military years turn into.
            </p>
            <p className="mt-2 max-w-2xl text-xs text-gray-500">
              Educational planning estimate, not investment advice. Markets vary year to year;
              past performance does not predict future returns.
            </p>
          </div>
          <span
            className="w-fit shrink-0 rounded-full border bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700"
            title="Your numbers stay in your browser. Nothing is sent to a server."
          >
            🔒 Private — runs entirely in your browser
          </span>
        </div>
      </header>

      {!mounted ? (
        <div className="rounded-3xl border bg-white p-10 text-center text-sm text-gray-500 shadow-sm">
          Loading projector…
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
          {/* ------------------------------ Inputs ------------------------------ */}
          <section className="space-y-6">
            {/* Service window & horizon */}
            <div className="rounded-3xl border bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold">Service &amp; horizon</h2>
              <div className="mt-3 space-y-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-gray-600">I am</span>
                  <input
                    type="number"
                    min={17}
                    max={70}
                    value={currentAge}
                    onChange={(e) => setCurrentAge(Math.max(17, Math.min(70, num(e.target.value, 22))))}
                    className={pctInput}
                    aria-label="Current age"
                  />
                  <span className="text-gray-600">years old, staying in</span>
                  <input
                    type="number"
                    min={0}
                    max={30}
                    value={serviceYears}
                    onChange={(e) => setServiceYears(Math.max(0, Math.min(30, num(e.target.value, 5))))}
                    className={pctInput}
                    aria-label="Years more you'll serve"
                    title="How much longer you stay on active duty. Military pay, TSP contributions, and the BRS match run only through this window."
                  />
                  <span className="text-gray-600">more years{" "}
                    <span className="text-gray-400">(→ {sepYear}, age {currentAge + serviceYears})</span>
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={30}
                  value={serviceYears}
                  onChange={(e) => setServiceYears(num(e.target.value, 5))}
                  className="w-full"
                  aria-label="Years more you'll serve (slider)"
                />

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="text-gray-600">Project until</span>
                  <span className="inline-flex items-center rounded-full border p-1 text-xs" role="group">
                    <button
                      type="button"
                      onClick={() => setHorizonMode("separation")}
                      className={`rounded-full px-3 py-1 font-medium transition ${
                        horizonMode === "separation"
                          ? "bg-[var(--field-bg)] text-[var(--field-text)]"
                          : "text-gray-600 hover:text-gray-900"
                      }`}
                    >
                      Separation
                    </button>
                    <button
                      type="button"
                      onClick={() => setHorizonMode("age")}
                      className={`rounded-full px-3 py-1 font-medium transition ${
                        horizonMode === "age"
                          ? "bg-[var(--field-bg)] text-[var(--field-text)]"
                          : "text-gray-600 hover:text-gray-900"
                      }`}
                    >
                      An age I pick
                    </button>
                  </span>
                  {horizonMode === "age" && (
                    <span className="inline-flex items-center gap-1.5">
                      <input
                        type="number"
                        min={currentAge + 1}
                        max={90}
                        value={targetAge}
                        onChange={(e) =>
                          setTargetAge(Math.max(currentAge + 1, Math.min(90, num(e.target.value, 60))))
                        }
                        className={pctInput}
                        aria-label="Project to this age"
                        title="The projection keeps compounding to this age even after you separate — useful for seeing what your military-era savings are worth at, say, 60."
                      />
                      <span className="text-xs text-gray-500">(→ {endYear})</span>
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500">
                  {horizonMode === "age" && projectionYears > serviceYears
                    ? `Serving ${serviceYears} more year${serviceYears === 1 ? "" : "s"}, then watching it compound ${
                        projectionYears - serviceYears
                      } more — through age ${currentAge + projectionYears}.`
                    : "Projecting through the end of your service window."}
                </p>

                <div className="flex items-center gap-2 text-xs text-gray-600">
                  <span>Inflation assumption</span>
                  <input
                    type="number"
                    min={0}
                    max={10}
                    step={0.1}
                    value={inflationPct}
                    onChange={(e) => setInflationPct(Math.max(0, Math.min(10, num(e.target.value))))}
                    className={pctInput}
                    aria-label="Inflation percent per year"
                    title="Used only to translate future balances into today's purchasing power (the dashed line and Today's $ column). The Federal Reserve targets 2%."
                  />
                  <span>%/yr (for today&apos;s-dollar figures)</span>
                </div>
              </div>
            </div>

            {/* Career path */}
            <div className="rounded-3xl border bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold">
                Career path{" "}
                <InfoDot text="Your projected rank sets your base pay from the DFAS tables, and base pay is what the TSP percentage and BRS match are computed from." />
              </h2>
              {paySnap && (
                <p className="mt-1 rounded-xl bg-[var(--field-bg)]/50 px-2.5 py-1.5 text-[11px] text-gray-600">
                  {`Pre-filled from your Pay Calculator (${paySnap.grade} @ ${paySnap.yos} YOS) — edit anything.`}
                </p>
              )}
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={branch}
                    onChange={(e) => setBranch(e.target.value as BranchId)}
                    className="field rounded-lg px-2 py-1.5 text-sm"
                    aria-label="Service branch"
                  >
                    {BRANCH_OPTIONS.map((b) => (
                      <option key={b.value} value={b.value}>
                        {b.label}
                      </option>
                    ))}
                  </select>
                  <select
                    value={track}
                    onChange={(e) => {
                      const t = e.target.value as Track;
                      setTrack(t);
                      setGrade(t === "officer" ? "O-1" : "E-4");
                    }}
                    className="field rounded-lg px-2 py-1.5 text-sm"
                    aria-label="Enlisted or officer"
                  >
                    <option value="enlisted">Enlisted</option>
                    <option value="officer">Officer</option>
                  </select>
                  <select
                    value={grade}
                    onChange={(e) => setGrade(e.target.value)}
                    className="field rounded-lg px-2 py-1.5 text-sm"
                    aria-label="Current pay grade"
                  >
                    {(track === "officer" ? OFFICER_GRADES : ENLISTED_GRADES).map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                  <span className="text-gray-600">at</span>
                  <input
                    type="number"
                    min={0}
                    max={40}
                    value={yosNow}
                    onChange={(e) => setYosNow(Math.max(0, Math.min(40, num(e.target.value))))}
                    className={pctInput}
                    aria-label="Current years of service"
                  />
                  <span className="text-gray-600">YOS</span>
                </div>

                {basePayNow !== null ? (
                  <p className="text-xs text-gray-600">
                    Base pay now:{" "}
                    <Explain
                      title={`Looked up in the ${basepay.year ?? 2026} DFAS pay table for ${grade} at ${yosNow} years of service. This is the number your TSP percentage and the BRS match multiply.`}
                      className="font-semibold"
                    >
                      {`${fmtUSD0(basePayNow)}/mo (${grade} @ ${yosNow} YOS)`}
                    </Explain>
                  </p>
                ) : (
                  <p className="text-xs text-amber-700">
                    DFAS publishes no {grade} rate at {yosNow} YOS — adjust YOS or grade.
                  </p>
                )}

                <label className="flex items-center gap-2 text-xs text-gray-600">
                  <input
                    type="checkbox"
                    checked={modelPromotions}
                    onChange={(e) => setModelPromotions(e.target.checked)}
                  />
                  Model typical promotions ({BRANCH_OPTIONS.find((b) => b.value === branch)?.label}{" "}
                  schedule)
                </label>

                {modelPromotions && promotionsPreview.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {promotionsPreview.map((p) => (
                      <span
                        key={p.monthIndex}
                        className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-white"
                        style={{ backgroundColor: gradeColor(p.toGrade) }}
                        title={p.competitive ? "Board/exam-driven — typical timing, not guaranteed" : "Largely time-based"}
                      >
                        {p.toGrade} · {startYear + Math.floor(p.monthIndex / 12)}
                        {p.competitive ? "*" : ""}
                      </span>
                    ))}
                    <span className="self-center text-[10px] text-gray-400">
                      * board-driven, not guaranteed
                    </span>
                  </div>
                )}
                {modelPromotions && promotionsPreview.length === 0 && serviceYears > 0 && (
                  <p className="text-[11px] text-gray-400">
                    No typical promotions fall inside this service window.
                  </p>
                )}

                <div className="flex items-center gap-2 pt-1 text-xs text-gray-600">
                  <span>Assumed annual military pay raise</span>
                  <input
                    type="number"
                    min={0}
                    max={8}
                    step={0.1}
                    value={payRaisePct}
                    onChange={(e) => setPayRaisePct(Math.max(0, Math.min(8, num(e.target.value))))}
                    className={pctInput}
                    aria-label="Assumed annual military pay raise percent"
                    title="Congress adjusts the pay tables most years. This escalates the whole table annually on top of promotion and YOS raises (recent raises have ranged roughly 2-5%)."
                  />
                  <span>%/yr</span>
                </div>
              </div>
            </div>

            {/* Budget → contributions hand-off */}
            {candidates.length > 0 && (
              <div className="rounded-3xl border border-[var(--brand-blue)]/40 bg-[var(--brand-blue)]/5 p-5 shadow-sm">
                <h2 className="text-lg font-semibold">
                  Use your budget{" "}
                  <InfoDot text="Point categories from your saved budget at an account, then apply. TSP- and debt-labeled rows are skipped by default (TSP is already modeled from your pay; debt payments pay down balances, not these accounts)." />
                </h2>

                {visibleCandidates.length === 0 ? (
                  <p className="mt-3 rounded-xl bg-white/70 px-3 py-2 text-xs text-gray-600">
                    No savings-type categories or leftover found in your budget — use “show all”
                    to assign any category or income row.
                  </p>
                ) : (
                  <div className="mt-3 space-y-1.5">
                    {visibleCandidates.map((c) => (
                      <div key={c.id} className="flex items-center gap-2 text-sm">
                        <span className="min-w-0 flex-1 truncate" title={c.label}>
                          {c.label}
                          {c.kind === "leftover" && (
                            <span className="ml-1 rounded-full bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                              income − expenses
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 text-gray-600">{fmtUSD0(c.monthly)}/mo</span>
                        <select
                          value={destinationOf(c.id, c.suggested)}
                          onChange={(e) =>
                            setAssignments((prev) => ({
                              ...prev,
                              [c.id]: e.target.value as ContributionDestination,
                            }))
                          }
                          className="field shrink-0 rounded-lg px-2 py-1 text-xs"
                          aria-label={`Where ${c.label} goes in the projection`}
                        >
                          <option value="savings">→ Savings</option>
                          <option value="invest">→ Investments</option>
                          <option value="skip">Skip</option>
                        </select>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={applyBudgetAssignments}
                    className="rounded-full border border-black bg-black px-4 py-2 text-xs font-medium text-white hover:bg-gray-800"
                  >
                    Apply {fmtUSD0(assignedTotals.savingsMonthly)} + {fmtUSD0(assignedTotals.investMonthly)}
                    /mo
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAllRows((s) => !s)}
                    className="text-xs font-medium text-gray-600 underline underline-offset-2 hover:text-gray-900"
                  >
                    {showAllRows ? "Show suggested only" : "Show all categories & income"}
                  </button>
                </div>
                {budgetNote && (
                  <p className="mt-2 rounded-xl bg-white/70 px-3 py-2 text-xs text-gray-600">
                    {budgetNote}
                  </p>
                )}
              </div>
            )}

            {/* TSP */}
            <div className="rounded-3xl border bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">TSP</h2>
                <span
                  className="cursor-help text-sm font-semibold"
                  title="Total flowing into your TSP this month: your contribution plus the agency's. It rises automatically as promotions and YOS raise your base pay."
                >
                  {fmtUSD0(employeeNow + agencyNow)}/mo now
                </span>
              </div>
              {(prefill.tspPct || prefill.fundAlloc) && (
                <p className="mt-1 text-[11px] text-gray-400">
                  Pre-filled from your saved budget — edit anything.
                </p>
              )}
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-gray-600">Balance today</span>
                  <div className="field flex items-center rounded-lg px-2 py-1">
                    <span className="text-gray-500">$</span>
                    <input
                      type="number"
                      min={0}
                      step={500}
                      value={tspBalance === 0 ? "" : tspBalance}
                      placeholder="0"
                      onChange={(e) => setTspBalance(Math.max(0, num(e.target.value)))}
                      className="w-24 bg-transparent text-right outline-none"
                      aria-label="Current TSP balance"
                    />
                  </div>
                  <span className="text-gray-600">· contributing</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={Math.round(contribPct * 100)}
                    onChange={(e) =>
                      setContribPct(Math.max(0, Math.min(100, num(e.target.value))) / 100)
                    }
                    className={pctInput}
                    aria-label="TSP contribution percent of base pay"
                    title="TSP contributions are a percent of base pay only — not BAH or BAS. 5% collects the full BRS match."
                  />
                  <span className="text-gray-600">% of base pay</span>
                </div>
                <label className="flex items-center gap-2 text-xs text-gray-600">
                  <input type="checkbox" checked={brs} onChange={(e) => setBrs(e.target.checked)} />
                  BRS agency contributions (1% automatic + up to 4% match)
                </label>
                <p className="text-xs text-gray-500">
                  Right now:{" "}
                  <Explain
                    title={`Your ${Math.round(contribPct * 100)}% of ${fmtUSD0(
                      basePayNow ?? 0
                    )} base pay, capped at the ${fmtUSD0(
                      TSP_ELECTIVE_DEFERRAL_LIMIT_2026
                    )} annual elective-deferral limit.`}
                  >
                    {`you ${fmtUSD0(employeeNow)}/mo`}
                  </Explain>
                  {brs && (
                    <>
                      {" · "}
                      <Explain title="BRS agency money: 1% of base pay automatic, plus a match of 100% on your first 3% and 50% on your next 2% — worth 5% total when you contribute at least 5%.">
                        {`agency ${fmtUSD0(agencyNow)}/mo`}
                      </Explain>
                    </>
                  )}
                  {brs && contribPct < 0.05 && (
                    <span className="text-amber-700">
                      {" · contribute 5% to collect the full match"}
                    </span>
                  )}
                  {" — these grow as your pay grows (see Pay & Rank tab)."}
                </p>

                <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                  <span className="text-gray-600">Assumed returns</span>
                  <select
                    value={preset}
                    onChange={(e) => setPreset(e.target.value as ReturnPreset)}
                    className="field rounded-lg px-2 py-1 text-xs"
                    aria-label="Return assumption preset"
                  >
                    <option value="longRun">Long run (since 1987–88)</option>
                    <option value="tenYear">Last 10 years (2016–2025)</option>
                    <option value="custom">Custom</option>
                  </select>
                  <Explain
                    title="Your fund mix's weighted-average assumed annual return — each fund's return times its share of the allocation. The TSP balance compounds at this rate."
                    className="font-medium text-gray-700"
                  >
                    {`blended ≈ ${(tspReturn * 100).toFixed(1)}%/yr`}
                  </Explain>
                </div>

                <button
                  type="button"
                  onClick={() => setShowTspDetail((s) => !s)}
                  className="text-xs font-medium text-gray-600 underline underline-offset-2 hover:text-gray-900"
                >
                  {showTspDetail ? "Hide" : "Edit"}
                  {" fund mix & returns"}
                </button>
                {showTspDetail && (
                  <div className="space-y-1.5 pt-1">
                    {TSP_FUNDS.map((f) => (
                      <div key={f.key} className="flex items-center gap-2 text-xs">
                        <span
                          className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: f.color }}
                        />
                        <span className="w-12 font-medium">{f.name}</span>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={5}
                          value={alloc[f.key] || 0}
                          onChange={(e) =>
                            setAlloc((prev) => ({
                              ...prev,
                              [f.key]: Math.max(0, Math.min(100, num(e.target.value))),
                            }))
                          }
                          className={pctInput}
                          aria-label={`${f.name} allocation percent`}
                        />
                        <span className="text-gray-500">% ·</span>
                        {preset === "custom" ? (
                          <input
                            type="number"
                            min={-20}
                            max={30}
                            step={0.1}
                            value={customReturns[f.key]}
                            onChange={(e) =>
                              setCustomReturns((prev) => ({
                                ...prev,
                                [f.key]: num(e.target.value),
                              }))
                            }
                            className={pctInput}
                            aria-label={`${f.name} assumed annual return percent`}
                          />
                        ) : (
                          <span className="w-16 text-right font-medium">
                            {(fundReturns[f.key] * 100).toFixed(1)}
                          </span>
                        )}
                        <span className="text-gray-500">%/yr</span>
                      </div>
                    ))}
                    {allocTotal !== 100 && (
                      <p className="text-xs text-amber-600">
                        Mix totals {allocTotal}% — weights are normalized, but aim for 100%.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Taxable investments */}
            <div className="rounded-3xl border bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                  Investment account{" "}
                  <InfoDot
                    text={`Brokerage / IRA money outside the TSP — e.g. an S&P 500 index fund. The ${PERF.otherAssets.sp500LongRunPct}% default ≈ the S&P 500's long-run average with dividends, before inflation; any given 5-year stretch can be far above or below it.`}
                  />
                </h2>
                <span
                  className="cursor-help text-sm font-semibold"
                  title="What you're adding to this account each month while serving. Set a different after-service pace below."
                >
                  {fmtUSD0(invMonthly)}/mo
                </span>
              </div>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-gray-600">Balance</span>
                  <div className="field flex items-center rounded-lg px-2 py-1">
                    <span className="text-gray-500">$</span>
                    <input
                      type="number"
                      min={0}
                      step={500}
                      value={invBalance === 0 ? "" : invBalance}
                      placeholder="0"
                      onChange={(e) => setInvBalance(Math.max(0, num(e.target.value)))}
                      className="w-24 bg-transparent text-right outline-none"
                      aria-label="Current investment balance"
                    />
                  </div>
                  <span className="text-gray-600">at</span>
                  <input
                    type="number"
                    min={-20}
                    max={30}
                    step={0.5}
                    value={invReturnPct}
                    onChange={(e) => setInvReturnPct(num(e.target.value))}
                    className={pctInput}
                    aria-label="Assumed investment annual return percent"
                  />
                  <span className="text-gray-600">%/yr</span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
                  <span>Adding</span>
                  <div className="field flex items-center rounded-lg px-2 py-1">
                    <span className="text-gray-500">$</span>
                    <input
                      type="number"
                      min={0}
                      step={25}
                      value={invMonthly === 0 ? "" : invMonthly}
                      placeholder="0"
                      onChange={(e) => setInvMonthly(Math.max(0, num(e.target.value)))}
                      className="w-16 bg-transparent text-right outline-none"
                      aria-label="Monthly investment contribution while serving"
                    />
                  </div>
                  <span>/mo while serving ·</span>
                  <div className="field flex items-center rounded-lg px-2 py-1">
                    <span className="text-gray-500">$</span>
                    <input
                      type="number"
                      min={0}
                      step={25}
                      value={invMonthlyAfter === 0 ? "" : invMonthlyAfter}
                      placeholder="0"
                      onChange={(e) => setInvMonthlyAfter(Math.max(0, num(e.target.value)))}
                      className="w-16 bg-transparent text-right outline-none"
                      aria-label="Monthly investment contribution after service"
                    />
                  </div>
                  <span>/mo after service</span>
                </div>
              </div>
            </div>

            {/* Savings */}
            <div className="rounded-3xl border bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                  Savings{" "}
                  <InfoDot text="Emergency fund and short-term goals in a high-yield savings account. Rates move with the Fed — use your bank's APY." />
                </h2>
                <span
                  className="cursor-help text-sm font-semibold"
                  title="What you're adding to savings each month while serving. Set a different after-service pace below."
                >
                  {fmtUSD0(savMonthly)}/mo
                </span>
              </div>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-gray-600">Balance</span>
                  <div className="field flex items-center rounded-lg px-2 py-1">
                    <span className="text-gray-500">$</span>
                    <input
                      type="number"
                      min={0}
                      step={250}
                      value={savBalance === 0 ? "" : savBalance}
                      placeholder="0"
                      onChange={(e) => setSavBalance(Math.max(0, num(e.target.value)))}
                      className="w-24 bg-transparent text-right outline-none"
                      aria-label="Current savings balance"
                    />
                  </div>
                  <span className="text-gray-600">at</span>
                  <input
                    type="number"
                    min={0}
                    max={15}
                    step={0.1}
                    value={savApyPct}
                    onChange={(e) => setSavApyPct(Math.max(0, num(e.target.value)))}
                    className={pctInput}
                    aria-label="Savings APY percent"
                  />
                  <span className="text-gray-600">% APY</span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
                  <span>Adding</span>
                  <div className="field flex items-center rounded-lg px-2 py-1">
                    <span className="text-gray-500">$</span>
                    <input
                      type="number"
                      min={0}
                      step={25}
                      value={savMonthly === 0 ? "" : savMonthly}
                      placeholder="0"
                      onChange={(e) => setSavMonthly(Math.max(0, num(e.target.value)))}
                      className="w-16 bg-transparent text-right outline-none"
                      aria-label="Monthly savings contribution while serving"
                    />
                  </div>
                  <span>/mo while serving ·</span>
                  <div className="field flex items-center rounded-lg px-2 py-1">
                    <span className="text-gray-500">$</span>
                    <input
                      type="number"
                      min={0}
                      step={25}
                      value={savMonthlyAfter === 0 ? "" : savMonthlyAfter}
                      placeholder="0"
                      onChange={(e) => setSavMonthlyAfter(Math.max(0, num(e.target.value)))}
                      className="w-16 bg-transparent text-right outline-none"
                      aria-label="Monthly savings contribution after service"
                    />
                  </div>
                  <span>/mo after service</span>
                </div>
              </div>
            </div>
          </section>

          {/* ------------------------------ Results ------------------------------ */}
          <section className="space-y-6 lg:self-start">
            <div className="rounded-3xl border bg-white p-6 shadow-sm md:p-8">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <div>
                  <div className="text-sm text-gray-600">
                    Projected by {endYear} (age {currentAge + projectionYears})
                  </div>
                  <div className="mt-1 text-4xl font-bold tracking-tight">
                    <Explain title="Everything combined — TSP + investments + savings — at the end of your projection horizon, in future (nominal) dollars, using your assumed returns.">
                      {fmtUSD0(projection.final.total)}
                    </Explain>
                  </div>
                  <div className="mt-1 text-sm text-gray-600">
                    <Explain
                      title={`The same total deflated by your ${inflationPct}%/yr inflation assumption — what it would buy in today's money.`}
                    >
                      {`≈ ${fmtUSD0(projection.final.realTotal)} in today's dollars`}
                    </Explain>
                  </div>
                </div>
                {projection.atSeparation && projectionYears > serviceYears && (
                  <div className="rounded-2xl border border-dashed px-4 py-2 text-right">
                    <div className="text-xs text-gray-500">
                      At separation · {sepYear}, age {currentAge + serviceYears}
                    </div>
                    <div className="text-lg font-semibold">
                      <Explain title="Your combined balance the year you leave the service — after this point the model stops military pay and TSP contributions and lets the balances compound.">
                        {fmtUSD0(projection.atSeparation.total)}
                      </Explain>
                    </div>
                  </div>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                {(["tsp", "invest", "savings"] as const).map((k) => {
                  const label = k === "tsp" ? "TSP" : k === "invest" ? "Investments" : "Savings";
                  const explain =
                    k === "tsp"
                      ? `TSP at the horizon: today's balance plus your ${Math.round(
                          contribPct * 100
                        )}% of base pay${brs ? " and the BRS match" : ""} each month while serving, compounding at ${(
                          tspReturn * 100
                        ).toFixed(1)}%/yr.`
                      : k === "invest"
                      ? `Investment account at the horizon: balance plus ${fmtUSD0(
                          invMonthly
                        )}/mo while serving (${fmtUSD0(invMonthlyAfter)}/mo after), compounding at ${invReturnPct}%/yr.`
                      : `Savings at the horizon: balance plus ${fmtUSD0(
                          savMonthly
                        )}/mo while serving (${fmtUSD0(savMonthlyAfter)}/mo after), at ${savApyPct}% APY.`;
                  return (
                    <span
                      key={k}
                      title={explain}
                      className="cursor-help rounded-full border px-2.5 py-1 font-medium"
                      style={{ color: ACCOUNT_COLORS[k], borderColor: `${ACCOUNT_COLORS[k]}66` }}
                    >
                      {label} {fmtUSD0(projection.final.balances[k] ?? 0)}
                    </span>
                  );
                })}
              </div>

              {/* Tabs */}
              <div className="mt-5 flex flex-wrap gap-1 rounded-2xl border p-1 text-sm">
                {RESULT_TABS.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setTab(t.value)}
                    className={`rounded-full px-3 py-1.5 font-medium transition ${
                      tab === t.value
                        ? "bg-[var(--field-bg)] text-[var(--field-text)]"
                        : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="mt-4 overflow-hidden rounded-2xl border">
                {tab === "growth" && (
                  <GrowthChart
                    projection={projection}
                    startBalances={startBalances}
                    startYear={startYear}
                    currentAge={currentAge}
                    serviceYears={serviceYears}
                  />
                )}
                {tab === "pay" && <PayRankChart projection={projection} startYear={startYear} />}
                {tab === "flows" && <FlowsChart projection={projection} startYear={startYear} />}
                {tab === "table" && (
                  <div className="max-h-[420px] overflow-auto">
                    <table className="w-full min-w-[680px] text-right text-sm">
                      <thead className="sticky top-0 bg-white">
                        <tr className="border-b text-xs text-gray-500">
                          <th className="px-3 py-2 text-left font-medium">Year</th>
                          <th className="py-2 font-medium">Age</th>
                          <th className="py-2 font-medium">Rank</th>
                          <th className="py-2 font-medium">Base pay/mo</th>
                          <th className="py-2 font-medium">TSP</th>
                          <th className="py-2 font-medium">Invest</th>
                          <th className="py-2 font-medium">Savings</th>
                          <th className="py-2 font-medium">Total</th>
                          <th className="px-3 py-2 font-medium">Today&apos;s $</th>
                        </tr>
                      </thead>
                      <tbody>
                        {projection.years.map((s) => {
                          const isSep = s.yearIndex === Math.ceil(serviceYears) && serviceYears > 0;
                          const isEnd = s.yearIndex === projectionYears;
                          return (
                            <tr
                              key={s.yearIndex}
                              className={`border-b last:border-0 ${
                                isEnd ? "font-semibold" : ""
                              } ${isSep ? "bg-[var(--field-bg)]/40" : ""}`}
                            >
                              <td className="px-3 py-1.5 text-left">
                                {startYear + s.yearIndex}
                                {isSep && (
                                  <span className="ml-1 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                                    separation
                                  </span>
                                )}
                                {isEnd && horizonMode === "age" && (
                                  <span className="ml-1 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                                    age {targetAge}
                                  </span>
                                )}
                              </td>
                              <td className="py-1.5">{s.age}</td>
                              <td className="py-1.5">{s.serving ? s.grade : "—"}</td>
                              <td className="py-1.5">
                                {s.serving ? fmtUSD0(s.basePayMonthly) : "—"}
                              </td>
                              <td className="py-1.5">{fmtUSD0(s.balances.tsp)}</td>
                              <td className="py-1.5">{fmtUSD0(s.balances.invest)}</td>
                              <td className="py-1.5">{fmtUSD0(s.balances.savings)}</td>
                              <td className="py-1.5">{fmtUSD0(s.total)}</td>
                              <td className="px-3 py-1.5 text-gray-500">{fmtUSD0(s.realTotal)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Exports */}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <label htmlFor="projection-format" className="sr-only">
                  Report format
                </label>
                <select
                  id="projection-format"
                  value={reportFormat}
                  onChange={(e) => setReportFormat(e.target.value as "csv" | "txt" | "pdf")}
                  className="field rounded-full px-3 py-2 text-sm"
                >
                  <option value="csv">CSV — any spreadsheet</option>
                  <option value="txt">Text — plain summary</option>
                  <option value="pdf">PDF — printable, with chart</option>
                </select>
                <button
                  type="button"
                  onClick={downloadReport}
                  disabled={exporting}
                  className="rounded-full border border-black bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
                  title="Assumptions, promotions, year-by-year balances, and totals in the selected format."
                >
                  {exporting ? "Preparing…" : "Download report"}
                </button>
                <button
                  type="button"
                  onClick={exportChartPng}
                  className="rounded-full border px-3 py-2 text-sm font-medium hover:bg-gray-100"
                  title="The growth chart as a shareable image."
                >
                  Chart PNG
                </button>
                <button
                  type="button"
                  onClick={exportChartSvg}
                  className="rounded-full border px-3 py-2 text-sm font-medium hover:bg-gray-100"
                  title="The growth chart as a vector file."
                >
                  Chart SVG
                </button>
                <span className="text-xs text-gray-500">
                  Generated in your browser — nothing leaves your device.
                </span>
              </div>
            </div>

            {/* Insights */}
            <div className="rounded-3xl border bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold">What this says</h2>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-gray-600">
                {projection.atSeparation && militaryTspAtEnd !== null && (
                  <li>
                    {`Your military years build a ${fmtUSD0(
                      projection.atSeparation.balances.tsp
                    )} TSP by separation — left invested, that alone becomes about ${fmtUSD0(
                      militaryTspAtEnd
                    )} at age ${currentAge + projectionYears} without another dollar added. That's what your service time gets you.`}
                  </li>
                )}
                {brs && projection.totals.agencyMatch > 0 && (
                  <li>
                    {`The BRS match contributes ${fmtUSD0(
                      projection.totals.agencyMatch
                    )} of agency money across your service window — pay you only receive by contributing.`}
                  </li>
                )}
                <li>
                  {`Of the projected ${fmtUSD0(projection.final.total)}, market growth does ${
                    projection.final.total > 0
                      ? Math.round(
                          (Math.max(0, projection.totals.growth) / projection.final.total) * 100
                        )
                      : 0
                  }% of the work${
                    doubling !== null
                      ? ` — at your blended ${(tspReturn * 100).toFixed(
                          1
                        )}%/yr TSP return, money doubles roughly every ${doubling.toFixed(
                          0
                        )} years (Rule of 72)`
                      : ""
                  }.`}
                </li>
                <li>
                  {`Trade space: staying 3 more years (separating ${sepYear + 3} instead of ${sepYear}) ends near ${fmtUSD0(
                    stayLonger.extended.final.total
                  )} vs ${fmtUSD0(stayLonger.base.final.total)} at the same end age — a ${fmtUSD0(
                    stayLonger.extended.final.total - stayLonger.base.final.total
                  )} difference from extra contributions, match, and promotions.`}
                </li>
                {modelPromotions && promotionsPreview.some((p) => p.competitive) && (
                  <li>
                    Promotions marked * are board- or exam-driven; the schedule shows typical
                    timing, not a guarantee. Toggle promotion modeling off to see the floor.
                  </li>
                )}
              </ul>
            </div>

            {/* Assumptions & sources */}
            <div className="rounded-3xl border bg-gray-50 p-5 text-xs leading-5 text-gray-600">
              <details>
              <summary className="cursor-pointer list-none text-sm font-semibold text-gray-800">
                Assumptions, data sources &amp; how it computes ▾
              </summary>
              <p className="mt-2">
                {`How it computes: your branch's typical promotion schedule sets your rank over time (see the Pay & Rank tab); rank + years of service look up base pay in the ${
                  basepay.year ?? 2026
                } DFAS tables, escalated by your assumed annual raise; the TSP percentage and BRS match are taken from that pay each month; each account compounds monthly at your assumed return. Contributions stop (or switch to your after-service amounts) at separation.`}
              </p>
              <p className="mt-2">
                TSP fund return presets are compound annual returns (long-run figures
                index-backfilled to 1987–88; verify at{" "}
                <a
                  href="https://www.tsp.gov/fund-performance/"
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-2"
                >
                  tsp.gov/fund-performance
                </a>
                ). Recent calendar years, for scale:
              </p>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[420px] text-right">
                  <thead>
                    <tr className="border-b text-[11px] text-gray-500">
                      <th className="py-1 text-left font-medium">Fund</th>
                      {Object.keys(PERF.calendarReturnsPct).map((y) => (
                        <th key={y} className="py-1 font-medium">
                          {y}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {TSP_FUNDS.map((f) => (
                      <tr key={f.key} className="border-b last:border-0">
                        <td className="py-1 text-left font-medium">{f.name}</td>
                        {Object.entries(PERF.calendarReturnsPct).map(([y, row]) => (
                          <td
                            key={y}
                            className="py-1"
                            style={{ color: row[f.key] < 0 ? "#b91c1c" : undefined }}
                          >
                            {row[f.key].toFixed(1)}%
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2">
                Not modeled: taxes on the investment account, TSP contribution-limit growth,
                BAH/BAS (allowances aren&apos;t TSP-matched), the High-3/BRS pension, or early
                promotions. Promotion timing comes from the same per-branch schedules as the{" "}
                <Link href="/toolkits/promotion-timeline" className="underline underline-offset-2">
                  Career Timeline
                </Link>
                {" — open it for the milestone-by-milestone view. Pair with the "}
                <Link href="/budget" className="underline underline-offset-2">
                  Budget Builder
                </Link>
                {" to fund the contributions."}
              </p>
              </details>
            </div>

            {/* Offscreen light-themed chart used only for exports (works from any tab). */}
            <div aria-hidden className="pointer-events-none absolute -left-[9999px] top-0 w-[920px]">
              <GrowthChart
                projection={projection}
                startBalances={startBalances}
                startYear={startYear}
                currentAge={currentAge}
                serviceYears={serviceYears}
                svgRef={exportChartRef}
              />
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
