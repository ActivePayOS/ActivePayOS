"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { fmtUSD0 } from "@/lib/sankey/model";
import {
  DEFAULT_FUND_ALLOCATION,
  DEFERRAL_SHARED_NOTE,
  TSP_AGENCY_MONEY_NOTE,
  TSP_ELECTIVE_DEFERRAL_LIMIT_2026,
  TSP_EXPENSE_EXPLAINER,
  TSP_FUNDS,
  K401_LIMIT_HINT,
  TSP_LIMIT_HINT,
  TSP_LIMIT_SENTENCE,
  TSP_LIMIT_SUMMARY,
  TSP_MAX_EARLY_WARNING,
  TSP_TYPICAL_EXPENSE_RATIO_PCT,
  type FundAllocation,
  type TspFundKey,
} from "@/lib/pay/tsp";
import {
  DEFAULT_IRA_EXPENSE_RATIO_PCT,
  IRA_CONTRIBUTION_LIMIT_2026,
  IRA_FEE_DISCLAIMER,
  IRA_LIMIT_HINT,
  IRA_LIMIT_SENTENCE,
  IRA_PROVIDER_CONTEXT,
  IRA_SEPARATE_FROM_TSP_NOTE,
  ROTH_IRA_PHASEOUT_NOTE,
} from "@/lib/pay/ira";
import {
  computeRothTradeoff,
  ROTH_TRADEOFF_CAVEATS,
} from "@/lib/projection/roth-tradeoff";
import RothTradeChart, { ROTH_COLOR, TRAD_COLOR } from "@/components/charts/RothTradeChart";
import ReportPanel from "@/components/ReportPanel";
import { blendedAnnualReturn, brsAgencyPct, yearsToDouble } from "@/lib/projection/wealth";
import { computeTspPacing } from "@/lib/pay/tsp-pacing";
import {
  projectCareerWealth,
  promotionLadder,
  upcomingPromotions,
  type CareerProjectionInput,
  type LadderStatus,
} from "@/lib/projection/career";
import {
  applyAssignments,
  budgetContributionCandidates,
  type ContributionDestination,
} from "@/lib/projection/budget-link";
import { basePayFor, type BasePayDataset } from "@/lib/pay/basepay-lookup";
import {
  BRANCH_OPTIONS,
  BRANCHES,
  TIMING_BASIS,
  TIMING_DISCLAIMER,
  type BranchId,
  type Track,
} from "@/data/promotion/timing";
import {
  ACCOUNT_COLORS,
  ACCOUNT_LABELS,
  FlowsChart,
  GrowthChart,
  PayRankChart,
  gradeColor,
} from "@/components/charts/WealthCharts";
import fundPerformance from "@/data/tsp/fund-performance.json";
import PlanFlow from "@/components/PlanFlow";
import TuneStrip, { type TuneControl } from "@/components/projector/TuneStrip";
import {
  FieldList,
  FieldNote,
  FieldRow,
  FieldSelect,
  MiniButton,
  SelectRow,
  UnitInput,
} from "@/components/projector/Field";
import Explain from "@/components/Explain";
import InfoDot from "@/components/InfoDot";
import HoverHint from "@/components/HoverHint";
import TspResetCalculator from "@/components/TspResetCalculator";
import { loadPaySnapshot, saveProjectionSnapshot } from "@/lib/profile/handoff";
import { getBahLookup } from "@/lib/pay/bah";
import {
  generateProjectionCsv,
  generateProjectionTxt,
  type ProjectionExport,
} from "@/lib/export/projection";
import { generateProjectionPdf } from "@/lib/export/projection-pdf";
import {
  availabilityForSections,
  buildBundleData,
  BUNDLE_SECTION_LABELS,
  generateBundleCsv,
  generateBundlePdf,
  generateBundleTxt,
  type BundleData,
} from "@/lib/export/bundle";
import { filesToZipBlob } from "@/lib/export/zip";
import { downloadPng, downloadSvg, svgToPngBytes } from "@/lib/sankey/export";

const emptySubscribe = () => () => {};

type ReturnPreset = "longRun" | "tenYear" | "custom";
type HorizonMode = "separation" | "age";
type ResultTab = "growth" | "pay" | "flows" | "tradespace" | "table";
type ReportFormat = "csv" | "txt" | "pdf" | "xlsx" | "all";

// Cross-tool report sections, in the site's canonical Pay → Budget → Project
// order (SiteHeader / PlanFlow use the same ordering).
const SECTION_ORDER = ["pay", "budget", "projection"] as const;

const RESULT_TABS: { value: ResultTab; label: string }[] = [
  { value: "growth", label: "Growth" },
  { value: "pay", label: "Pay & Rank" },
  { value: "flows", label: "In vs. Growth" },
  { value: "tradespace", label: "Trade space" },
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

// Post-service pay has to start somewhere or the civilian 401(k) silently
// contributes nothing. This is an openly-labelled assumption, not a forecast —
// the salary input starts here and the member changes it to their own number.
const DEFAULT_CIVILIAN_SALARY = 80000;

// Month names for the TSP pacing warning — the pacing engine returns a 1-based
// calendar month.
const TSP_MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// A contribution percent as people say it: one decimal only when it matters.
function tspPctLabel(pct: number) {
  const shown = pct * 100;
  return `${shown < 10 ? shown.toFixed(1) : Math.round(shown)}%`;
}

// The service match runs from 2 years of service to 26; from 50 the limit stops
// contributions rather than the match, because the overflow rolls into
// catch-up. Outside those windows a front-loaded election costs no match.
const TSP_MATCH_STARTS_YOS = 2;
const TSP_MATCH_ENDS_YOS = 26;
const TSP_CATCH_UP_AGE = 50;

// Everything the chart-side "Tune this plan" strip can move. The after-service
// twins live here too: the strip writes both halves of a pair at once, but the
// sidebar can set them apart, and either edit is a real change from baseline.
type TuneBaseline = {
  contribPct: number; // decimal, as the state holds it
  invMonthly: number;
  invMonthlyAfter: number;
  savMonthly: number;
  savMonthlyAfter: number;
  iraMonthly: number;
  iraMonthlyAfter: number;
  civSalary: number;
};

// How a promotion ladder step's typical time-in-service point reads in the
// "How promotions are modelled" disclosure: months while that's the natural
// unit (the 18-month O-2 point), years once it isn't.
function tisPointLabel(months: number): string {
  if (months < 24) return `${months} months of service`;
  const years = months / 12;
  const shown = Number.isInteger(years) ? String(years) : years.toFixed(1);
  return `${shown} year${shown === "1" ? "" : "s"}`;
}

// Muted for the steps that aren't in play (already held, or past the service
// window), amber for one whose typical point has already gone by.
const LADDER_STATUS_TEXT: Record<LadderStatus, string> = {
  held: "text-gray-400",
  due: "text-amber-700",
  upcoming: "text-gray-600",
  beyond: "text-gray-400",
};

// One-time read of the saved Budget Builder state (used for prefill and the
// "Use your budget" contribution assignments). Shape is best-effort — every
// consumer guards the fields it reads.
type StoredBudget = {
  income?: Array<{ id?: string; label?: string; amount?: number }>;
  expenses?: Array<{ id?: string; label?: string; amount?: number }>;
  tspPct?: number;
  tspBaseId?: string;
  fundAlloc?: FundAllocation;
  iraEnabled?: boolean;
  iraMonthly?: number;
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

function loadBudgetPrefill(): {
  tspPct?: number;
  fundAlloc?: FundAllocation;
  iraMonthly?: number;
} {
  try {
    const parsed = loadSavedBudgetRaw();
    if (!parsed) return {};
    return {
      tspPct: typeof parsed?.tspPct === "number" && parsed.tspPct > 0 ? parsed.tspPct : undefined,
      fundAlloc:
        parsed?.fundAlloc && typeof parsed.fundAlloc === "object" ? parsed.fundAlloc : undefined,
      iraMonthly:
        parsed?.iraEnabled && typeof parsed.iraMonthly === "number" && parsed.iraMonthly > 0
          ? parsed.iraMonthly
          : undefined,
    };
  } catch {
    return {};
  }
}

// Header switch for the optional account boxes — off collapses the box and
// pulls the account out of the projection.
function BoxSwitch({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      title={
        on
          ? "Counted in the projection — switch off to exclude it"
          : "Switched off — not counted in the projection"
      }
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
        on ? "bg-black" : "bg-gray-300"
      }`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
          on ? "left-[18px]" : "left-0.5"
        }`}
      />
    </button>
  );
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
  // TSP fund management fees (expense ratio, % per year) — most members never
  // see these because they're netted out of share prices. Editable + explained.
  const [tspFeePct, setTspFeePct] = useState(TSP_TYPICAL_EXPENSE_RATIO_PCT);
  const [showTspFees, setShowTspFees] = useState(false);

  // ---- Civilian IRA: contributions can continue after separation until a
  // chosen age; return is net of an editable expense-ratio/fee drag. ----
  const [iraBalance, setIraBalance] = useState(0);
  const [iraMonthly, setIraMonthly] = useState(() => prefill.iraMonthly ?? 0);
  const [iraMonthlyAfter, setIraMonthlyAfter] = useState(() => prefill.iraMonthly ?? 0);
  const [iraUntilAge, setIraUntilAge] = useState(65);
  const [iraReturnPct, setIraReturnPct] = useState(PERF.otherAssets.sp500LongRunPct);
  const [iraFeePct, setIraFeePct] = useState(DEFAULT_IRA_EXPENSE_RATIO_PCT);

  // ---- Post-military civilian career: assumed salary drives the 401(k)
  // (your % + employer match %), starting at separation. ----
  // Starts at the DEFAULT_CIVILIAN_SALARY assumption so the 401(k) models
  // something out of the box; clearing the field back to 0 means "not set".
  const [civSalary, setCivSalary] = useState(DEFAULT_CIVILIAN_SALARY); // expected $/yr after service
  const [k401Pct, setK401Pct] = useState(6);
  const [k401MatchPct, setK401MatchPct] = useState(4);
  const [k401Type, setK401Type] = useState<"traditional" | "roth">("traditional");
  const [k401UntilAge, setK401UntilAge] = useState(65);
  const [k401ReturnPct, setK401ReturnPct] = useState(PERF.otherAssets.sp500LongRunPct);
  // Employee share honors the IRS elective-deferral limit (the Max button
  // targets it, and the engine enforces it); the employer match rides on top
  // uncapped — it doesn't count against the employee limit.
  const k401EmployeeMonthly = Math.min(
    (Math.max(0, civSalary) / 12) * (Math.max(0, k401Pct) / 100),
    TSP_ELECTIVE_DEFERRAL_LIMIT_2026 / 12
  );
  const k401MatchMonthly = (Math.max(0, civSalary) / 12) * (Math.max(0, k401MatchPct) / 100);
  const k401Monthly = k401EmployeeMonthly + k401MatchMonthly;

  // ---- Per-account switches: an off account collapses its box and is
  // excluded from the projection, charts, table, and reports. TSP stays —
  // it's the core of the tool. ----
  const [iraOn, setIraOn] = useState(true);
  const [k401On, setK401On] = useState(true);
  const [invOn, setInvOn] = useState(true);
  const [savOn, setSavOn] = useState(true);

  // ---- Roth vs Traditional trade-space explorer ----
  const [rothMonthlyOverride, setRothMonthlyOverride] = useState(0); // 0 → auto
  const [rothRateNowPct, setRothRateNowPct] = useState(12);
  const [rothRateLaterPct, setRothRateLaterPct] = useState(15);

  // ---- Next-PCS trade space: candidate duty stations vs. staying put ----
  const [pcsYear, setPcsYear] = useState(1);
  const [pcsCurrentZip, setPcsCurrentZip] = useState(() => paySnap?.zip ?? "");
  const [pcsDeps, setPcsDeps] = useState(() => paySnap?.dependents ?? false);
  const [pcsCandidates, setPcsCandidates] = useState<string[]>(["", "", ""]);

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

  // ---- "Tune this plan" baseline: the values the chart-side strip can move,
  // snapshotted on first mount (so prefilled numbers, not hardcoded ones, are
  // what "before tuning" means). "Set as baseline" re-snapshots them. ----
  const [tuneBaseline, setTuneBaseline] = useState<TuneBaseline>(() => ({
    contribPct,
    invMonthly,
    invMonthlyAfter,
    savMonthly,
    savMonthlyAfter,
    iraMonthly,
    iraMonthlyAfter,
    civSalary,
  }));

  const [tab, setTab] = useState<ResultTab>("growth");
  // Stacked pushes results below the inputs at full width (inputs reflow into
  // columns); side-by-side is the classic 380px inputs rail. Stacked is the
  // default: the chart and its tuning strip get the full width, which is where
  // the projector's answer actually lives.
  const [stackedLayout, setStackedLayout] = useState(true);

  // ---- Exports (csv/txt/pdf in-browser; xlsx via the stateless route) ----
  const [reportFormat, setReportFormat] = useState<ReportFormat>("csv");
  const [reportScope, setReportScope] = useState<"standard" | "longterm">("standard");
  const [reportSections, setReportSections] = useState<string[]>(["projection"]);
  const [exportError, setExportError] = useState<string | null>(null);
  // One-shot read of which other tools have data on this device (same
  // mount-time pattern as the pay snapshot / budget candidates above).
  const [sectionAvailability] = useState<
    readonly { id: string; available: boolean; hint?: string }[] | null
  >(() => (typeof window === "undefined" ? null : availabilityForSections()));
  const [exporting, setExporting] = useState(false);
  // Offscreen light-themed chart used for PNG/SVG/PDF export from any tab.
  const exportChartRef = useRef<SVGSVGElement>(null);
  // Second offscreen chart re-projected to the long-term horizon, so the
  // Long-term report's PDF embeds a chart drawn from the SAME data as its
  // numbers (not the shorter on-screen horizon).
  const longTermChartRef = useRef<SVGSVGElement>(null);

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

  // Gross blended return, then net of the TSP expense ratio — the number the
  // balance actually compounds at.
  const tspReturnGross = blendedAnnualReturn(alloc, fundReturns);
  const tspReturn = tspReturnGross - Math.max(0, tspFeePct) / 100;
  const iraReturnNetPct = iraReturnPct - Math.max(0, iraFeePct);

  const projectionYears =
    horizonMode === "separation"
      ? Math.max(1, serviceYears)
      : Math.max(Math.max(1, serviceYears), Math.min(70, targetAge - currentAge));

  // Effective per-account values — a switched-off account contributes nothing
  // anywhere (projection, charts, exports), without losing what was typed.
  const iraBalanceEff = iraOn ? iraBalance : 0;
  const iraMonthlyEff = iraOn ? iraMonthly : 0;
  const iraMonthlyAfterEff = iraOn ? iraMonthlyAfter : 0;
  const k401MonthlyEff = k401On ? k401Monthly : 0;
  const k401EmployeeMonthlyEff = k401On ? k401EmployeeMonthly : 0;
  const k401MatchMonthlyEff = k401On ? k401MatchMonthly : 0;
  const invBalanceEff = invOn ? invBalance : 0;
  const invMonthlyEff = invOn ? invMonthly : 0;
  const invMonthlyAfterEff = invOn ? invMonthlyAfter : 0;
  const savBalanceEff = savOn ? savBalance : 0;
  const savMonthlyEff = savOn ? savMonthly : 0;
  const savMonthlyAfterEff = savOn ? savMonthlyAfter : 0;

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
      invBalance: invBalanceEff,
      invMonthly: invMonthlyEff,
      invMonthlyAfter: invMonthlyAfterEff,
      invReturn: invReturnPct / 100,
      savBalance: savBalanceEff,
      savMonthly: savMonthlyEff,
      savMonthlyAfter: savMonthlyAfterEff,
      savReturn: savApyPct / 100,
      iraBalance: iraBalanceEff,
      iraMonthly: iraMonthlyEff,
      iraMonthlyAfter: iraMonthlyAfterEff,
      iraUntilAge,
      iraReturn: iraReturnNetPct / 100,
      k401Monthly: k401EmployeeMonthlyEff,
      k401MatchMonthly: k401MatchMonthlyEff,
      k401UntilAge,
      k401Return: k401ReturnPct / 100,
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
      invBalanceEff,
      invMonthlyEff,
      invMonthlyAfterEff,
      invReturnPct,
      savBalanceEff,
      savMonthlyEff,
      savMonthlyAfterEff,
      savApyPct,
      iraBalanceEff,
      iraMonthlyEff,
      iraMonthlyAfterEff,
      iraUntilAge,
      iraReturnNetPct,
      k401EmployeeMonthlyEff,
      k401MatchMonthlyEff,
      k401UntilAge,
      k401ReturnPct,
      inflationPct,
    ]
  );

  const projection = useMemo(() => projectCareerWealth(careerInput), [careerInput]);

  // The long-term analysis always carries the projection to at least age 65,
  // regardless of the on-screen horizon. Memoized here so the export numbers,
  // the PDF's embedded chart, and the live Excel payload all share the SAME
  // re-projected data (the chart used to be rasterized at the on-screen
  // horizon while the long-term numbers ran to 65).
  const longTermYears = Math.max(projectionYears, Math.min(70, Math.max(1, 65 - currentAge)));
  const longTermProjection = useMemo(
    () =>
      longTermYears === projectionYears
        ? projection
        : projectCareerWealth({ ...careerInput, projectionYears: longTermYears }),
    [careerInput, projection, projectionYears, longTermYears]
  );

  // Same projection with zero fund fees — the difference is the dollars lost
  // to expense ratios over the horizon ("fee drag").
  const feeDrag = useMemo(() => {
    const feeFree = projectCareerWealth({
      ...careerInput,
      tspReturn: tspReturnGross,
      iraReturn: iraReturnPct / 100,
    });
    return Math.max(0, feeFree.final.total - projection.final.total);
  }, [careerInput, tspReturnGross, iraReturnPct, projection.final.total]);

  // ---- "Tune this plan": what moved since the baseline, in plain English.
  // Doubles as the dirty flag — no changes listed means nothing to compare. ----
  const tuneChanges = useMemo(() => {
    const out: string[] = [];
    // Compared raw (not at the whole point the strip steps in) so a percentage
    // typed into the sidebar still registers as a change.
    const asPct = (p: number) => `${Math.round(p * 1000) / 10}%`;
    if (contribPct !== tuneBaseline.contribPct) {
      out.push(`TSP ${asPct(contribPct)} (was ${asPct(tuneBaseline.contribPct)})`);
    }

    // A pair the strip moves together reads as one line; split apart only when
    // the sidebar has actually set the two halves differently.
    const pair = (
      label: string,
      now: number,
      nowAfter: number,
      was: number,
      wasAfter: number
    ) => {
      if (now === was && nowAfter === wasAfter) return;
      if (now === nowAfter && was === wasAfter) {
        out.push(`${label} ${fmtUSD0(now)}/mo (was ${fmtUSD0(was)})`);
        return;
      }
      if (now !== was) {
        out.push(`${label} ${fmtUSD0(now)}/mo while serving (was ${fmtUSD0(was)})`);
      }
      if (nowAfter !== wasAfter) {
        out.push(`${label} ${fmtUSD0(nowAfter)}/mo after service (was ${fmtUSD0(wasAfter)})`);
      }
    };
    pair("Investing", invMonthly, invMonthlyAfter, tuneBaseline.invMonthly, tuneBaseline.invMonthlyAfter);
    pair("Savings", savMonthly, savMonthlyAfter, tuneBaseline.savMonthly, tuneBaseline.savMonthlyAfter);
    pair("IRA", iraMonthly, iraMonthlyAfter, tuneBaseline.iraMonthly, tuneBaseline.iraMonthlyAfter);

    if (civSalary !== tuneBaseline.civSalary) {
      out.push(
        `Civilian salary ${fmtUSD0(civSalary)}/yr (was ${fmtUSD0(tuneBaseline.civSalary)})`
      );
    }
    return out;
  }, [
    contribPct,
    invMonthly,
    invMonthlyAfter,
    savMonthly,
    savMonthlyAfter,
    iraMonthly,
    iraMonthlyAfter,
    civSalary,
    tuneBaseline,
  ]);
  const tuneDirty = tuneChanges.length > 0;

  // The baseline salary drives a baseline 401(k) the same way the live one
  // does — same percentages, same elective-deferral cap.
  const baselineK401EmployeeMonthly = Math.min(
    (Math.max(0, tuneBaseline.civSalary) / 12) * (Math.max(0, k401Pct) / 100),
    TSP_ELECTIVE_DEFERRAL_LIMIT_2026 / 12
  );
  const baselineK401MatchMonthly =
    (Math.max(0, tuneBaseline.civSalary) / 12) * (Math.max(0, k401MatchPct) / 100);

  // The same projection run on the pre-tuning numbers — the dashed "Before
  // tuning" line on the chart and the delta below it. Null (and never
  // computed) while the plan still matches the baseline.
  const baselineProjection = useMemo(() => {
    if (!tuneDirty) return null;
    return projectCareerWealth({
      ...careerInput,
      tspPct: tuneBaseline.contribPct,
      invMonthly: invOn ? tuneBaseline.invMonthly : 0,
      invMonthlyAfter: invOn ? tuneBaseline.invMonthlyAfter : 0,
      savMonthly: savOn ? tuneBaseline.savMonthly : 0,
      savMonthlyAfter: savOn ? tuneBaseline.savMonthlyAfter : 0,
      iraMonthly: iraOn ? tuneBaseline.iraMonthly : 0,
      iraMonthlyAfter: iraOn ? tuneBaseline.iraMonthlyAfter : 0,
      k401Monthly: k401On ? baselineK401EmployeeMonthly : 0,
      k401MatchMonthly: k401On ? baselineK401MatchMonthly : 0,
    });
  }, [
    tuneDirty,
    careerInput,
    tuneBaseline,
    invOn,
    savOn,
    iraOn,
    k401On,
    baselineK401EmployeeMonthly,
    baselineK401MatchMonthly,
  ]);

  const tuneDelta = useMemo(() => {
    if (!baselineProjection) return null;
    const was = baselineProjection.final.total;
    return {
      endTotal: projection.final.total - was,
      realTotal: projection.final.realTotal - baselineProjection.final.realTotal,
      pct: was > 0 ? ((projection.final.total - was) / was) * 100 : 0,
      endAge: currentAge + projectionYears,
      changes: tuneChanges,
    };
  }, [baselineProjection, projection, currentAge, projectionYears, tuneChanges]);

  // Only handed to the on-screen growth chart, and only while the plan differs
  // from the baseline — the offscreen export charts never receive it, so
  // reports stay baseline-free.
  const baselineSeries = useMemo(
    () =>
      baselineProjection
        ? baselineProjection.years.map((s) => ({ yearIndex: s.yearIndex, total: s.total }))
        : null,
    [baselineProjection]
  );

  // ---- Roth vs Traditional trade space ----
  const rothMonthlyEff =
    rothMonthlyOverride > 0
      ? rothMonthlyOverride
      : Math.max(50, Math.round((employeeNowForRoth() + iraMonthlyEff) / 25) * 25);
  // employeeNow is derived below; use a function so ordering stays simple.
  function employeeNowForRoth() {
    const bp = basePayFor(basepay, grade, Math.max(0, yosNow)) ?? 0;
    return Math.min(bp * contribPct, TSP_ELECTIVE_DEFERRAL_LIMIT_2026 / 12);
  }
  const rothYearsContrib = Math.max(1, serviceYears > 0 ? serviceYears : projectionYears);
  const rothTrade = useMemo(
    () =>
      computeRothTradeoff({
        monthlyContribution: rothMonthlyEff,
        yearsContributing: rothYearsContrib,
        yearsToWithdrawal: Math.max(projectionYears, rothYearsContrib),
        annualReturn: tspReturn,
        taxRateNow: rothRateNowPct / 100,
        taxRateAtWithdrawal: rothRateLaterPct / 100,
      }),
    [rothMonthlyEff, rothYearsContrib, projectionYears, tspReturn, rothRateNowPct, rothRateLaterPct]
  );

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

  // Next-PCS trade space: BAH at each candidate station at the grade you'd
  // hold on arrival, with the monthly difference vs. staying invested at your
  // assumed return through separation, then compounding to the horizon.
  type BahGrade = Parameters<typeof getBahLookup>[1];
  const pcsTrade = useMemo(() => {
    if (!pcsCurrentZip.trim()) return null;
    const moveYear = Math.max(0, Math.min(Math.round(pcsYear), Math.max(0, Math.floor(serviceYears))));
    const yearRow =
      projection.years.find((s) => s.yearIndex === moveYear) ?? projection.years[0];
    const gradeAtPcs = (yearRow?.grade ?? grade) as BahGrade;
    const current = getBahLookup(pcsCurrentZip, gradeAtPcs, pcsDeps);
    const monthsEarning = Math.max(0, Math.round((serviceYears - moveYear) * 12));
    const yearsAfterService = Math.max(0, projectionYears - serviceYears);
    const rm = invReturnPct / 100 / 12;
    const deltaAtHorizon = (deltaMonthly: number) => {
      if (monthsEarning <= 0) return 0;
      const atSeparation =
        rm > 0
          ? deltaMonthly * ((Math.pow(1 + rm, monthsEarning) - 1) / rm)
          : deltaMonthly * monthsEarning;
      return atSeparation * Math.pow(1 + invReturnPct / 100, yearsAfterService);
    };
    const candidates = pcsCandidates.map((raw) => {
      const zip = raw.trim();
      if (!zip) return null;
      const lk = getBahLookup(zip, gradeAtPcs, pcsDeps);
      if (lk.rate == null || current.rate == null)
        return { zip, rate: null as number | null, deltaMonthly: 0, deltaEnd: 0 };
      const deltaMonthly = lk.rate - current.rate;
      return { zip, rate: lk.rate, deltaMonthly, deltaEnd: deltaAtHorizon(deltaMonthly) };
    });
    return { moveYear, gradeAtPcs, current, monthsEarning, candidates };
  }, [pcsCurrentZip, pcsCandidates, pcsDeps, pcsYear, serviceYears, projectionYears, projection.years, grade, invReturnPct]);

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
  // The whole assumed ladder — including the steps already held and the ones
  // past the service window — so "why is there no O-2?" is answerable on the
  // page instead of only inside the engine.
  const ladder = useMemo(
    () => promotionLadder(branch, track, grade, Math.max(0, yosNow), serviceYears),
    [branch, track, grade, yosNow, serviceYears]
  );

  const basePayNow = basePayFor(basepay, grade, Math.max(0, yosNow));
  const employeeNow = Math.min(
    (basePayNow ?? 0) * contribPct,
    TSP_ELECTIVE_DEFERRAL_LIMIT_2026 / 12
  );
  const agencyNow = brs ? (basePayNow ?? 0) * brsAgencyPct(contribPct) : 0;

  // Where this election lands across the year. Reaching the limit early does not
  // put more in — TSP stops the contributions, and the match is worked out on
  // what actually goes in each month, so the stopped months earn none. (The
  // "Spread it evenly" fix targets the percent whose last dollar lands in
  // December, so applying it clears the warning rather than re-triggering it.)
  const tspPacing = useMemo(
    () => computeTspPacing(basePayNow ?? 0, contribPct, { brs }),
    [basePayNow, contribPct, brs]
  );
  // Gates the engine deliberately leaves to the UI: no match before 2 years of
  // service or after 26, and from 50 the overflow rolls into catch-up instead
  // of stopping, so the match normally keeps going.
  const tspAtCatchUpAge = currentAge >= TSP_CATCH_UP_AGE;
  const tspMatchEligible =
    brs && yosNow >= TSP_MATCH_STARTS_YOS && yosNow < TSP_MATCH_ENDS_YOS;
  const showTspPacingWarning =
    tspPacing.frontLoading && tspMatchEligible && !tspAtCatchUpAge;
  // Past 26 years of service the match has ended, so nothing is at stake and
  // nothing is said.
  const showTspCatchUpNote =
    tspPacing.frontLoading && brs && tspAtCatchUpAge && yosNow < TSP_MATCH_ENDS_YOS;
  const showTspNotMatchedYet =
    tspPacing.frontLoading && brs && !tspAtCatchUpAge && yosNow < TSP_MATCH_STARTS_YOS;
  const tspStoppedPhrase =
    tspPacing.monthsStopped === 1
      ? "the last month of the year"
      : `the last ${tspPacing.monthsStopped} months of the year`;
  const tspStopMonth =
    tspPacing.limitReachedInMonth === null
      ? ""
      : TSP_MONTH_NAMES[tspPacing.limitReachedInMonth - 1];

  // "What did my military time get me": TSP at separation, compounding alone.
  const militaryTspAtEnd = useMemo(() => {
    const sep = projection.atSeparation;
    if (!sep) return null;
    const yearsAfter = projectionYears - sep.yearIndex;
    if (yearsAfter <= 0) return null;
    return sep.balances.tsp * Math.pow(1 + tspReturn, yearsAfter);
  }, [projection.atSeparation, projectionYears, tspReturn]);

  // High-3 pension ballpark once the scenario reaches 20 total years: the
  // multiplier (2.5%/yr legacy, 2.0%/yr BRS) x total years x final projected
  // base pay as the high-3 proxy. Estimate only — real pensions average the
  // highest 36 months of base pay and exact creditable service.
  const pensionEstimate = useMemo(() => {
    const serviceYearsTotal = Math.max(0, yosNow) + serviceYears;
    if (serviceYears <= 0 || serviceYearsTotal < 20) return null;
    const finalBasePay =
      projection.payTimeline.length > 0
        ? projection.payTimeline[projection.payTimeline.length - 1].basePayMonthly
        : 0;
    if (finalBasePay <= 0) return null;
    const multiplierPct = brs ? 2.0 : 2.5;
    return {
      multiplierPct,
      serviceYearsTotal,
      high3MonthlyBase: finalBasePay,
      monthlyPension: (multiplierPct / 100) * serviceYearsTotal * finalBasePay,
    };
  }, [projection.payTimeline, yosNow, serviceYears, brs]);

  const doubling = yearsToDouble(tspReturn);
  const allocTotal = FUND_KEYS.reduce((a, k) => a + (alloc[k] || 0), 0);
  const startBalances = {
    tsp: Math.max(0, tspBalance),
    invest: Math.max(0, invBalanceEff),
    savings: Math.max(0, savBalanceEff),
    ira: Math.max(0, iraBalanceEff),
    k401: 0,
  };
  // Extra account columns/chips only when they actually hold money.
  const iraActive = projection.years.some((s) => s.balances.ira > 0.5);
  const k401Active = projection.years.some((s) => s.balances.k401 > 0.5);

  const pctInput = "field w-16 rounded-lg px-2 py-1 text-right text-sm outline-none";
  // Input boxes inside each labeled group: masonry columns when stacked, a
  // single rail when side-by-side.
  const inputGroupCls = stackedLayout
    ? "mt-3 gap-6 md:columns-2 xl:columns-3 [&>*]:mb-6 [&>*]:break-inside-avoid"
    : "mt-3 space-y-6";

  function num(v: string, fallback = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  // ---- Chart-side tuning: the same setters the sidebar uses, so the strip and
  // the sidebar inputs stay in lockstep (one state, two places to reach it). ----
  const PAIRED_TUNE_NOTE =
    "Moves the while-serving and after-service amounts together, so the whole curve responds.\n\nWant a different pace once you separate? The account's card in the sidebar sets each one on its own — this strip and those inputs drive the same numbers.";

  const tuneControls: TuneControl[] = [
    {
      key: "tsp",
      label: "TSP (% of base pay)",
      value: Math.round(contribPct * 100),
      onChange: (v) => setContribPct(Math.max(0, Math.min(100, v)) / 100),
      step: 1,
      min: 0,
      max: 100,
      suffix: "%",
      width: "w-12",
      warning: showTspPacingWarning
        ? `About ${fmtUSD0(
            Math.round(tspPacing.matchLostTotal)
          )} of BRS match forfeited a year: you reach the ${fmtUSD0(
            tspPacing.limit
          )} limit in ${tspStopMonth} and contribute nothing for ${tspStoppedPhrase}, and only money that goes in that month is matched. The automatic 1% keeps arriving; the match does not, and is not added back later.`
        : undefined,
      fix: showTspPacingWarning
        ? {
            label: `Spread it evenly — ${tspPctLabel(tspPacing.evenPct)}`,
            title: `Sets your contribution to ${tspPctLabel(tspPacing.evenPct)} — ${fmtUSD0(
              Math.round(tspPacing.evenMonthly)
            )}/mo, so your last dollar lands on your December paycheck and you keep the full match all year.`,
            onClick: () => setContribPct(tspPacing.evenPct),
          }
        : undefined,
      ariaLabel: "TSP contribution percent of base pay",
    },
    {
      key: "invest",
      label: "Investing",
      value: invMonthly,
      onChange: (v) => {
        setInvMonthly(v);
        setInvMonthlyAfter(v);
      },
      step: 50,
      min: 0,
      prefix: "$",
      suffix: "/mo",
      disabled: !invOn,
      disabledReason: "Investment account is switched off",
      info: PAIRED_TUNE_NOTE,
      ariaLabel: "Monthly investment contribution",
    },
    {
      key: "savings",
      label: "Savings",
      value: savMonthly,
      onChange: (v) => {
        setSavMonthly(v);
        setSavMonthlyAfter(v);
      },
      step: 50,
      min: 0,
      prefix: "$",
      suffix: "/mo",
      disabled: !savOn,
      disabledReason: "Savings account is switched off",
      info: PAIRED_TUNE_NOTE,
      ariaLabel: "Monthly savings contribution",
    },
    {
      key: "ira",
      label: "IRA",
      value: iraMonthly,
      onChange: (v) => {
        setIraMonthly(v);
        setIraMonthlyAfter(v);
      },
      step: 50,
      min: 0,
      prefix: "$",
      suffix: "/mo",
      disabled: !iraOn,
      disabledReason: "IRA is switched off",
      info: PAIRED_TUNE_NOTE,
      ariaLabel: "Monthly IRA contribution",
    },
    {
      key: "civSalary",
      label: "Salary after service",
      value: civSalary,
      onChange: setCivSalary,
      step: 5000,
      min: 0,
      prefix: "$",
      suffix: "/yr",
      width: "w-20",
      disabled: !k401On,
      disabledReason: "Civilian 401(k) is switched off",
      info: "An assumption you own — it drives the civilian 401(k) (your percentage plus the employer match) from the month you separate.\n\nThe percentages and the return live on the Civilian salary & 401(k) card in the sidebar.",
      ariaLabel: "Expected civilian salary per year after service",
    },
  ];

  function resetTuning() {
    setContribPct(tuneBaseline.contribPct);
    setInvMonthly(tuneBaseline.invMonthly);
    setInvMonthlyAfter(tuneBaseline.invMonthlyAfter);
    setSavMonthly(tuneBaseline.savMonthly);
    setSavMonthlyAfter(tuneBaseline.savMonthlyAfter);
    setIraMonthly(tuneBaseline.iraMonthly);
    setIraMonthlyAfter(tuneBaseline.iraMonthlyAfter);
    setCivSalary(tuneBaseline.civSalary);
  }

  function adoptTuningBaseline() {
    setTuneBaseline({
      contribPct,
      invMonthly,
      invMonthlyAfter,
      savMonthly,
      savMonthlyAfter,
      iraMonthly,
      iraMonthlyAfter,
      civSalary,
    });
  }

  const destinationOf = (id: string, suggested: ContributionDestination) =>
    assignments[id] ?? suggested;
  const visibleCandidates = showAllRows
    ? candidates
    : candidates.filter((c) => destinationOf(c.id, c.suggested) !== "skip");
  const assignedTotals = applyAssignments(candidates, assignments);

  function buildProjectionExport(scope: "standard" | "longterm"): ProjectionExport {
    const branchLabel = BRANCH_OPTIONS.find((b) => b.value === branch)?.label ?? branch;

    // The long-term scope reuses the shared to-age-65 projection so the
    // report numbers and the embedded chart come from identical data.
    const projYears = scope === "longterm" ? longTermYears : projectionYears;
    const proj = scope === "longterm" ? longTermProjection : projection;
    const endYr = startYear + projYears;

    // Fee drag at this horizon: same projection with zero fund fees.
    const feeFree = projectCareerWealth({
      ...careerInput,
      projectionYears: projYears,
      tspReturn: tspReturnGross,
      iraReturn: iraReturnPct / 100,
    });

    return {
      generatedOn: new Date().toISOString().slice(0, 10),
      scenario: {
        branchLabel,
        track,
        grade,
        yos: yosNow,
        currentAge,
        serviceYears,
        projectionYears: projYears,
        endYear: endYr,
        tspPct: contribPct,
        brs,
        tspReturnPct: Math.round(tspReturn * 1000) / 10,
        invReturnPct,
        savApyPct,
        ...(iraMonthlyEff > 0 || iraMonthlyAfterEff > 0
          ? {
              iraMonthly: iraMonthlyEff,
              iraUntilAge,
              iraReturnPct: Math.round(iraReturnNetPct * 100) / 100,
            }
          : {}),
        ...(k401MonthlyEff > 0
          ? { k401Monthly: k401MonthlyEff, k401UntilAge, k401ReturnPct, k401Type }
          : {}),
        inflationPct,
        payRaisePct,
        modelPromotions,
      },
      // Mirrors the on-screen table: switched-off accounts drop their columns.
      activeAccounts: { invest: invOn, savings: savOn },
      promotions: proj.promotions.map((p) => ({
        year: startYear + Math.floor(p.monthIndex / 12),
        grade: p.toGrade,
        competitive: p.competitive,
      })),
      years: proj.years.map((s) => ({
        year: startYear + s.yearIndex,
        age: s.age,
        serving: s.serving,
        grade: s.grade,
        basePayMonthly: s.basePayMonthly,
        tsp: s.balances.tsp,
        ira: s.balances.ira,
        k401: s.balances.k401,
        invest: s.balances.invest,
        savings: s.balances.savings,
        total: s.total,
        realTotal: s.realTotal,
      })),
      totals: {
        final: proj.final.total,
        finalReal: proj.final.realTotal,
        atSeparation: proj.atSeparation?.total ?? null,
        separationYear: serviceYears > 0 ? sepYear : null,
        contributed: proj.totals.contributed,
        growth: proj.totals.growth,
        agencyMatch: proj.totals.agencyMatch,
        employeeTsp: proj.totals.employeeTsp,
      },
      ...(pensionEstimate
        ? {
            pension: {
              ...pensionEstimate,
              note: "Estimate - uses your final projected base pay as the High-3 proxy. Actual pensions average the highest 36 months of base pay and exact creditable service; verify with DFAS.",
            },
          }
        : {}),
      fees: {
        tspExpenseRatioPct: tspFeePct,
        iraExpenseRatioPct:
          iraMonthlyEff > 0 || iraMonthlyAfterEff > 0 || iraBalanceEff > 0 ? iraFeePct : null,
        estimatedFeeDrag: Math.max(0, feeFree.final.total - proj.final.total),
        notes: [
          "TSP costs are an expense ratio netted out of share prices - roughly $0.40-$0.80 per $1,000 invested per year. Verify current figures at tsp.gov.",
          "IRA/401(k) fees differ by fund and institution - confirm exact expense ratios and advisory fees with your brokerage or plan.",
        ],
      },
      rothTradeoff: {
        monthlyContribution: rothMonthlyEff,
        yearsContributing: rothYearsContrib,
        yearsToWithdrawal: Math.max(projYears, rothYearsContrib),
        annualReturnPct: Math.round(tspReturn * 1000) / 10,
        taxRateNowPct: rothRateNowPct,
        taxRateAtWithdrawalPct: rothRateLaterPct,
        preTaxBalance: rothTrade.final.balance,
        taxPaidUpFront: rothTrade.final.taxPaidUpFront,
        deferredTaxBill: rothTrade.final.deferredTaxBill,
        rothAfterTax: rothTrade.final.rothAfterTax,
        tradAfterTax: rothTrade.final.tradAfterTax,
        winner: rothTrade.winner,
        advantage: rothTrade.advantage,
      },
      ...(scope === "longterm"
        ? {
            longTerm: {
              milestones: proj.years
                .filter((s) => s.age % 10 === 0 || s.yearIndex === projYears)
                .map((s) => ({
                  age: s.age,
                  year: startYear + s.yearIndex,
                  total: s.total,
                  realTotal: s.realTotal,
                })),
              fourPercentAnnual: proj.final.total * 0.04,
              fourPercentMonthly: (proj.final.total * 0.04) / 12,
              fourPercentMonthlyReal: (proj.final.realTotal * 0.04) / 12,
              notes: [
                "The ~4% rule is a rough sustainable-withdrawal heuristic, not a guarantee - sequence-of-returns risk, taxes, and spending changes all matter.",
                "Today's-dollar figures use your inflation assumption; real purchasing power is the number to plan around over decades.",
              ],
            },
          }
        : {}),
    };
  }

  // Persist the latest projection to localStorage (debounced ~600ms after the
  // projection settles) so the Pay Calculator and Budget Builder can include
  // this tool's report in their bundled exports — the same silent hand-off
  // pattern the pay snapshot uses. Best-effort: failures never disturb the page.
  const buildExportRef = useRef<((scope: "standard" | "longterm") => ProjectionExport) | null>(null);
  useEffect(() => {
    buildExportRef.current = buildProjectionExport;
  });
  useEffect(() => {
    if (!mounted) return;
    const t = window.setTimeout(() => {
      try {
        const build = buildExportRef.current;
        if (build) saveProjectionSnapshot(build("standard"));
      } catch {
        // best-effort only
      }
    }, 600);
    return () => window.clearTimeout(t);
    // Re-arm whenever anything the "standard" export reads has settled;
    // `projection` already folds in every career/account input.
  }, [mounted, projection, rothTrade, invOn, savOn, k401Type, pensionEstimate]);

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

  // Section pills shown in the report panel — the projection is always
  // available (it's this page, computed live); pay/budget depend on what the
  // other tools have saved on this device.
  const sectionOptions = SECTION_ORDER.map((id) => {
    const avail = sectionAvailability?.find((a) => a.id === id);
    return {
      id,
      label: BUNDLE_SECTION_LABELS[id],
      available: id === "projection" ? true : avail?.available ?? false,
      hint: id === "projection" ? undefined : avail?.hint,
    };
  });

  // Uint8Array -> base64 without Buffer (this runs in the browser). Chunked so
  // a large PNG cannot blow the argument limit on String.fromCharCode.
  function bytesToBase64(bytes: Uint8Array): string {
    let binary = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    return btoa(binary);
  }

  // Live Excel model: assumptions + formula-driven projection, built by the
  // stateless export route (same in-memory pattern as the budget's Excel
  // export — nothing is stored server-side). The long-term scope sends the
  // extended horizon so the workbook covers the same years as the report.
  async function fetchProjectionWorkbook(): Promise<Blob> {
    // The workbook's Trade space sheet (stay-in vs get-out, the pension, and
    // the Roth comparison) is built from the SAME ProjectionExport the CSV/PDF
    // use. Without it the route degrades to the generic live-model sheets, so
    // send it — and the growth chart the PDF already rasterizes — every time.
    const report = buildProjectionExport(reportScope);
    const chartPng = await reportChartPng();
    const chartPngBase64 = chartPng ? bytesToBase64(chartPng) : undefined;

    const res = await fetch("/api/export-projection-xlsx", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projection: report,
        ...(chartPngBase64 ? { chartPngBase64 } : {}),
        grade,
        startYear,
        currentAge,
        serviceYears,
        projectionYears: reportScope === "longterm" ? longTermYears : projectionYears,
        ...(reportScope === "longterm" ? { longTermYears } : {}),
        inflationPct,
        balances: {
          tsp: tspBalance,
          ira: iraBalanceEff,
          invest: invBalanceEff,
          savings: savBalanceEff,
        },
        returnsPct: {
          tsp: Math.round(tspReturn * 1000) / 10,
          ira: Math.round(iraReturnNetPct * 100) / 100,
          k401: k401ReturnPct,
          invest: invReturnPct,
          savings: savApyPct,
        },
        monthly: {
          tspTotal: Math.round((employeeNow + agencyNow) * 100) / 100,
          iraServing: iraMonthlyEff,
          iraAfter: iraMonthlyAfterEff,
          iraUntilAge,
          k401After: k401MonthlyEff,
          k401UntilAge,
          invServing: invMonthlyEff,
          invAfter: invMonthlyAfterEff,
          savServing: savMonthlyEff,
          savAfter: savMonthlyAfterEff,
        },
      }),
    });
    if (!res.ok) throw new Error(`Export failed (${res.status})`);
    return res.blob();
  }

  // Growth chart PNG for PDFs — rasterized from the offscreen chart that
  // matches the report scope (the long-term one is re-projected to age 65).
  async function reportChartPng(): Promise<Uint8Array | undefined> {
    const svg =
      reportScope === "longterm" && longTermChartRef.current
        ? longTermChartRef.current
        : exportChartRef.current;
    if (!svg) return undefined;
    try {
      return await svgToPngBytes(svg, 2, "#ffffff");
    } catch {
      return undefined; // fall back to a chartless PDF
    }
  }

  async function downloadReport() {
    setExportError(null);
    setExporting(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const selected = SECTION_ORDER.filter(
        (id) =>
          reportSections.includes(id) && sectionOptions.find((s) => s.id === id)?.available
      );
      if (selected.length === 0) return; // button is disabled in this state
      const projectionOnly = selected.length === 1 && selected[0] === "projection";

      const data = buildProjectionExport(reportScope);
      const stem =
        reportScope === "longterm"
          ? `activepayos_WealthProjection_LongTerm_${grade}_${data.scenario.endYear}`
          : `activepayos_WealthProjection_${grade}_${endYear}`;

      if (projectionOnly) {
        // Single-section paths — identical to the classic per-format exports.
        if (reportFormat === "csv") {
          triggerDownload(generateProjectionCsv(data), "text/csv;charset=utf-8", `${stem}.csv`);
        } else if (reportFormat === "txt") {
          triggerDownload(generateProjectionTxt(data), "text/plain;charset=utf-8", `${stem}.txt`);
        } else if (reportFormat === "pdf") {
          const bytes = await generateProjectionPdf(data, await reportChartPng());
          triggerDownload(new Uint8Array(bytes), "application/pdf", `${stem}.pdf`);
        } else if (reportFormat === "xlsx") {
          const blob = await fetchProjectionWorkbook();
          triggerDownload(blob, blob.type, `${stem}.xlsx`);
        } else {
          // Everything: every format of this report, one zip.
          const [workbook, pdfBytes] = await Promise.all([
            fetchProjectionWorkbook(),
            (async () => generateProjectionPdf(data, await reportChartPng()))(),
          ]);
          const zip = await filesToZipBlob([
            { name: `${stem}.csv`, data: generateProjectionCsv(data) },
            { name: `${stem}.txt`, data: generateProjectionTxt(data) },
            { name: `${stem}.pdf`, data: new Uint8Array(pdfBytes) },
            { name: `${stem}.xlsx`, data: workbook },
          ]);
          triggerDownload(zip, "application/zip", `activepayos_report_${today}.zip`);
        }
        return;
      }

      // Cross-tool bundle: the live projection wins; pay/budget come from the
      // localStorage hand-off snapshots the other tools already write. The
      // staleness notes tell readers which numbers came from storage.
      const { data: loaded, staleness } = buildBundleData(
        selected.includes("projection") ? { projection: data } : {}
      );
      const bundle: BundleData = {
        ...(selected.includes("pay") && loaded.pay ? { pay: loaded.pay } : {}),
        ...(selected.includes("budget") && loaded.budget ? { budget: loaded.budget } : {}),
        ...(selected.includes("projection") ? { projection: data } : {}),
      };
      const included = SECTION_ORDER.filter((id) => bundle[id] !== undefined);
      if (included.length === 0) {
        setExportError("None of the selected tools has data saved on this device yet.");
        return;
      }
      const bundleStem = `activepayos_report_${today}`;
      const bundlePdf = async () =>
        generateBundlePdf(
          bundle,
          bundle.projection ? { projection: await reportChartPng() } : undefined,
          staleness
        );
      const workbookName = `activepayos_WealthModel_${grade}_${
        reportScope === "longterm" ? startYear + longTermYears : endYear
      }.xlsx`;

      if (reportFormat === "csv") {
        triggerDownload(
          generateBundleCsv(bundle, staleness),
          "text/csv;charset=utf-8",
          `${bundleStem}.csv`
        );
      } else if (reportFormat === "txt") {
        triggerDownload(
          generateBundleTxt(bundle, staleness),
          "text/plain;charset=utf-8",
          `${bundleStem}.txt`
        );
      } else if (reportFormat === "pdf") {
        const bytes = await bundlePdf();
        triggerDownload(new Uint8Array(bytes), "application/pdf", `${bundleStem}.pdf`);
      } else if (reportFormat === "xlsx") {
        // Excel workbooks are per-tool, built from live inputs by their own
        // pages' API routes — from here only the projection workbook exists.
        // The other tools' numbers travel in CSV / Text / PDF / zip instead.
        if (!bundle.projection) {
          setExportError(
            "The Excel model is built from this page's live projection. Include the Wealth Projector section, or choose CSV, Text, or PDF for a cross-tool report."
          );
          return;
        }
        const workbook = await fetchProjectionWorkbook();
        if (included.length > 1) {
          triggerDownload(
            await filesToZipBlob([{ name: workbookName, data: workbook }]),
            "application/zip",
            `${bundleStem}.zip`
          );
        } else {
          triggerDownload(workbook, workbook.type, workbookName);
        }
      } else {
        // Everything: combined csv/txt/pdf plus this page's workbook, one zip.
        const files: { name: string; data: Blob | string | Uint8Array }[] = [
          { name: `${bundleStem}.csv`, data: generateBundleCsv(bundle, staleness) },
          { name: `${bundleStem}.txt`, data: generateBundleTxt(bundle, staleness) },
          { name: `${bundleStem}.pdf`, data: new Uint8Array(await bundlePdf()) },
        ];
        if (bundle.projection) {
          files.push({ name: workbookName, data: await fetchProjectionWorkbook() });
        }
        triggerDownload(await filesToZipBlob(files), "application/zip", `${bundleStem}.zip`);
      }
    } catch {
      setExportError(
        "Export failed — nothing was downloaded. Check your connection and try again."
      );
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
            <HoverHint className="mt-1" />
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <span
              className="w-fit shrink-0 rounded-full border bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700"
              title="Your numbers stay in your browser. Nothing is sent to a server."
            >
              🔒 Private — runs entirely in your browser
            </span>
            <span
              className="hidden items-center rounded-full border p-1 text-xs lg:inline-flex"
              role="group"
              aria-label="Layout"
              title="Side-by-side keeps inputs next to results; stacked gives results the full width."
            >
              <button
                type="button"
                onClick={() => setStackedLayout(false)}
                className={`rounded-full px-3 py-1 font-medium transition ${
                  !stackedLayout
                    ? "bg-[var(--field-bg)] text-[var(--field-text)]"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                Side by side
              </button>
              <button
                type="button"
                onClick={() => setStackedLayout(true)}
                className={`rounded-full px-3 py-1 font-medium transition ${
                  stackedLayout
                    ? "bg-[var(--field-bg)] text-[var(--field-text)]"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                Stacked
              </button>
            </span>
          </div>
        </div>
      </header>

      {!mounted ? (
        <div className="rounded-3xl border bg-white p-10 text-center text-sm text-gray-500 shadow-sm">
          Loading projector…
        </div>
      ) : (
        <div
          className={
            stackedLayout
              ? "space-y-6"
              : "grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)]"
          }
        >
          {/* ------------------------------ Inputs ------------------------------ */}
          <section className="space-y-8">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Military service
              </h3>
              <div className={inputGroupCls}>
            {/* Service window & horizon */}
            <div className="rounded-3xl border bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold">Service &amp; horizon</h2>
              <FieldList>
                <SelectRow
                  label="My age today"
                  value={Math.round(currentAge)}
                  onChange={(v) => setCurrentAge(Math.max(17, Math.min(70, num(v, 22))))}
                  ariaLabel="Current age"
                >
                  {Array.from({ length: 54 }, (_, i) => i + 17).map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </SelectRow>

                <SelectRow
                  label="Years I'll keep serving"
                  value={Math.round(serviceYears)}
                  onChange={(v) => setServiceYears(Math.max(0, Math.min(30, num(v, 5))))}
                  ariaLabel="Years more you'll serve"
                  title="How much longer you stay on active duty — your remaining contract, or the total you expect to serve. Military pay, TSP contributions, and the BRS match run only through this window."
                >
                  {Array.from({ length: 31 }, (_, i) => (
                    <option key={i} value={i}>
                      {i === 0 ? "0 — separating now" : i === 20 ? "20 — retirement eligible" : i}
                    </option>
                  ))}
                </SelectRow>

                <FieldRow
                  label="Project until"
                  control={
                    <span
                      className="inline-flex items-center rounded-full border p-1 text-sm"
                      role="group"
                    >
                      <button
                        type="button"
                        onClick={() => setHorizonMode("separation")}
                        className={`whitespace-nowrap rounded-full px-3 py-1 font-medium transition ${
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
                        className={`whitespace-nowrap rounded-full px-3 py-1 font-medium transition ${
                          horizonMode === "age"
                            ? "bg-[var(--field-bg)] text-[var(--field-text)]"
                            : "text-gray-600 hover:text-gray-900"
                        }`}
                      >
                        An age I pick
                      </button>
                    </span>
                  }
                />

                {horizonMode === "age" && (
                  <SelectRow
                    label="Compound through age"
                    value={Math.max(currentAge + 1, Math.min(90, Math.round(targetAge)))}
                    onChange={(v) =>
                      setTargetAge(Math.max(currentAge + 1, Math.min(90, num(v, 60))))
                    }
                    ariaLabel="Project to this age"
                    title="The projection keeps compounding to this age even after you separate — useful for seeing what your military-era savings are worth at, say, 60."
                  >
                    {Array.from({ length: 90 - currentAge }, (_, i) => currentAge + 1 + i).map(
                      (a) => (
                        <option key={a} value={a}>
                          {a}
                        </option>
                      )
                    )}
                  </SelectRow>
                )}

                <FieldRow
                  label="Inflation (today's dollars)"
                  control={
                    <UnitInput
                      value={inflationPct}
                      onChange={(v) => setInflationPct(Math.max(0, Math.min(10, num(v))))}
                      suffix="%/yr"
                      width="w-12"
                      min={0}
                      max={10}
                      step={0.1}
                      ariaLabel="Inflation percent per year"
                      title="Used only to translate future balances into today's purchasing power (the dashed line and Today's $ column). The Federal Reserve targets 2%."
                    />
                  }
                />
              </FieldList>
              <FieldNote className="mt-3">
                {horizonMode === "age" && projectionYears > serviceYears
                  ? `Separating in ${sepYear} at age ${
                      currentAge + serviceYears
                    }, then compounding ${projectionYears - serviceYears} more year${
                      projectionYears - serviceYears === 1 ? "" : "s"
                    } — through age ${currentAge + projectionYears} in ${endYear}.`
                  : `Separating in ${sepYear} at age ${
                      currentAge + serviceYears
                    } — projecting through the end of your service window.`}
              </FieldNote>
            </div>

            {/* Career path */}
            <div className="rounded-3xl border bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">
                  Career path{" "}
                  <InfoDot text="Your projected rank sets your base pay from the DFAS tables, and base pay is what the TSP percentage and BRS match are computed from." />
                </h2>
                {basePayNow !== null && (
                  <Explain
                    title={`Looked up in the ${basepay.year ?? 2026} DFAS pay table for ${grade} at ${yosNow} years of service. This is the number your TSP percentage and the BRS match multiply.`}
                    className="whitespace-nowrap text-sm font-semibold"
                  >
                    {`${fmtUSD0(basePayNow)}/mo base`}
                  </Explain>
                )}
              </div>
              {paySnap && (
                <p className="mt-1 rounded-xl bg-[var(--field-bg)]/50 px-2.5 py-1.5 text-xs text-gray-600">
                  {`Pre-filled from your Pay Calculator (${paySnap.grade} @ ${paySnap.yos} YOS) — edit anything.`}
                </p>
              )}
              <FieldList>
                <SelectRow
                  label="Branch"
                  value={branch}
                  onChange={(v) => setBranch(v as BranchId)}
                  ariaLabel="Service branch"
                >
                  {BRANCH_OPTIONS.map((b) => (
                    <option key={b.value} value={b.value}>
                      {b.label}
                    </option>
                  ))}
                </SelectRow>

                <SelectRow
                  label="Track"
                  value={track}
                  onChange={(v) => {
                    const t = v as Track;
                    setTrack(t);
                    setGrade(t === "officer" ? "O-1" : "E-4");
                  }}
                  ariaLabel="Enlisted or officer"
                >
                  <option value="enlisted">Enlisted</option>
                  <option value="officer">Officer</option>
                </SelectRow>

                <SelectRow
                  label="Pay grade"
                  value={grade}
                  onChange={(v) => setGrade(v)}
                  ariaLabel="Current pay grade"
                >
                  {(track === "officer" ? OFFICER_GRADES : ENLISTED_GRADES).map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </SelectRow>

                <FieldRow
                  label="Years of service"
                  tip={TIMING_BASIS[track]}
                  control={
                    <UnitInput
                      value={yosNow}
                      onChange={(v) => setYosNow(Math.max(0, Math.min(40, num(v))))}
                      suffix="YOS"
                      width="w-12"
                      min={0}
                      max={40}
                      ariaLabel="Current years of service"
                    />
                  }
                />

                <FieldRow
                  label="Annual pay raise"
                  control={
                    <UnitInput
                      value={payRaisePct}
                      onChange={(v) => setPayRaisePct(Math.max(0, Math.min(8, num(v))))}
                      suffix="%/yr"
                      width="w-12"
                      min={0}
                      max={8}
                      step={0.1}
                      ariaLabel="Assumed annual military pay raise percent"
                      title="Congress adjusts the pay tables most years. This escalates the whole table annually on top of promotion and YOS raises (recent raises have ranged roughly 2-5%)."
                    />
                  }
                />

                {basePayNow === null && (
                  <FieldNote tone="warn">
                    DFAS publishes no {grade} rate at {yosNow} YOS — adjust YOS or grade.
                  </FieldNote>
                )}

                <label className="flex items-center gap-2 pt-0.5 text-sm text-gray-600">
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
                        key={p.toGrade}
                        className="rounded-full px-2 py-0.5 text-xs font-semibold text-white"
                        style={{ backgroundColor: gradeColor(p.toGrade) }}
                        title={
                          p.behindSchedule
                            ? "Typical point already passed — modelled as pinning now"
                            : p.competitive
                              ? "Board/exam-driven — typical timing, not guaranteed"
                              : "Largely time-based"
                        }
                      >
                        {p.toGrade} ·{" "}
                        {p.behindSchedule ? "now" : startYear + Math.floor(p.monthIndex / 12)}
                        {p.competitive ? "*" : ""}
                      </span>
                    ))}
                    <span className="self-center text-xs text-gray-400">
                      * board-driven, not guaranteed
                    </span>
                  </div>
                )}
                {modelPromotions && promotionsPreview.length === 0 && serviceYears > 0 && (
                  <FieldNote tone="faint">
                    No typical promotions fall inside this service window.
                  </FieldNote>
                )}

                {modelPromotions && (
                  <details className="pt-1">
                    <summary className="cursor-pointer text-xs font-medium text-gray-600 underline underline-offset-2 hover:text-gray-900">
                      How promotions are modelled
                    </summary>
                    <div className="mt-2 space-y-2 rounded-2xl border p-3">
                      <p className="text-xs leading-5 text-gray-600">{TIMING_BASIS[track]}</p>
                      <ul className="space-y-1.5">
                        {ladder.map((s) => (
                          <li key={s.toGrade} className={`text-xs ${LADDER_STATUS_TEXT[s.status]}`}>
                            <span className="flex flex-wrap items-center gap-1.5">
                              <span className="font-semibold">{s.toGrade}</span>
                              <span>{tisPointLabel(s.tisMonths)}</span>
                              <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-600">
                                {s.competitive ? "board" : "automatic"}
                              </span>
                              <span className="font-medium">
                                {s.status === "held"
                                  ? "already held"
                                  : s.status === "due"
                                    ? "typical point passed — modelled as now"
                                    : s.status === "upcoming"
                                      ? `projected ${startYear + Math.floor((s.monthIndex ?? 0) / 12)}`
                                      : "after your service window"}
                              </span>
                            </span>
                            {s.note && (
                              <span className="mt-0.5 block text-xs leading-5 text-gray-400">
                                {s.note}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                      <p className="text-xs leading-5 text-gray-500">{TIMING_DISCLAIMER}</p>
                      <p className="text-xs leading-5 text-gray-400">
                        {"Schedule source: "}
                        <a
                          href={BRANCHES[branch].source.url}
                          target="_blank"
                          rel="noreferrer"
                          className="underline underline-offset-2"
                        >
                          {BRANCHES[branch].source.label}
                        </a>
                      </p>
                    </div>
                  </details>
                )}
              </FieldList>
            </div>

            {/* Budget → contributions hand-off */}
            {candidates.length > 0 && (
              <div className="rounded-3xl border border-[var(--brand-blue)]/40 bg-[var(--brand-blue)]/5 p-5 shadow-sm">
                <h2 className="text-lg font-semibold">
                  Use your budget{" "}
                  <InfoDot text="Point categories from your saved budget at an account, then apply. TSP- and debt-labeled rows are skipped by default (TSP is already modeled from your pay; debt payments pay down balances, not these accounts)." />
                </h2>

                {visibleCandidates.length === 0 ? (
                  <p className="mt-3 rounded-xl border bg-white px-3 py-2 text-xs text-gray-600">
                    No savings-type categories or leftover found in your budget — use “show all”
                    to assign any category or income row.
                  </p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {visibleCandidates.map((c) => (
                      <div key={c.id} className="flex items-center gap-2 text-sm">
                        <span className="min-w-0 flex-1 truncate text-gray-600" title={c.label}>
                          {c.label}
                          {c.kind === "leftover" && (
                            <span className="ml-1 rounded-full bg-white px-1.5 py-0.5 text-xs font-medium text-gray-500">
                              income − expenses
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 whitespace-nowrap text-gray-600">
                          {fmtUSD0(c.monthly)}/mo
                        </span>
                        <FieldSelect
                          value={destinationOf(c.id, c.suggested)}
                          onChange={(v) =>
                            setAssignments((prev) => ({
                              ...prev,
                              [c.id]: v as ContributionDestination,
                            }))
                          }
                          className="shrink-0"
                          ariaLabel={`Where ${c.label} goes in the projection`}
                        >
                          <option value="savings">→ Savings</option>
                          <option value="invest">→ Investments</option>
                          <option value="skip">Skip</option>
                        </FieldSelect>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={applyBudgetAssignments}
                    className="whitespace-nowrap rounded-full border border-black bg-black px-4 py-2 text-xs font-medium text-white hover:bg-gray-800"
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
                  <p className="mt-2 rounded-xl border bg-white px-3 py-2 text-xs text-gray-600">
                    {budgetNote}
                  </p>
                )}
              </div>
            )}

            {/* TSP */}
            <div className="rounded-3xl border bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                  TSP{" "}
                  <InfoDot
                    text={`${TSP_LIMIT_SENTENCE}\n\nContributions are a percent of base pay only — not BAH or BAS.\n\n${TSP_AGENCY_MONEY_NOTE}\n\nThe projection caps your own contributions at the limit and holds it flat in future years.`}
                  />
                </h2>
                <span
                  className="cursor-help text-sm font-semibold"
                  title="Total flowing into your TSP this month: your contribution plus the agency's. It rises automatically as promotions and YOS raise your base pay."
                >
                  {fmtUSD0(employeeNow + agencyNow)}/mo now
                </span>
              </div>
              {(prefill.tspPct || prefill.fundAlloc) && (
                <p className="mt-1 text-xs text-gray-400">
                  Pre-filled from your saved budget — edit anything.
                </p>
              )}
              <div className="mt-3 space-y-2 text-sm">
                <FieldList className="mt-0">
                  <FieldRow
                    label="Balance today"
                    control={
                      <UnitInput
                        value={tspBalance === 0 ? "" : tspBalance}
                        onChange={(v) => setTspBalance(Math.max(0, num(v)))}
                        prefix="$"
                        width="w-24"
                        min={0}
                        step={500}
                        placeholder="0"
                        ariaLabel="Current TSP balance"
                      />
                    }
                  />

                  <FieldRow
                    label="Contributing"
                    control={
                      <UnitInput
                        value={Math.round(contribPct * 100)}
                        onChange={(v) =>
                          setContribPct(Math.max(0, Math.min(100, num(v))) / 100)
                        }
                        suffix="% of base pay"
                        width="w-10"
                        min={0}
                        max={100}
                        step={1}
                        ariaLabel="TSP contribution percent of base pay"
                        title={`TSP contributions are a percent of base pay only — not BAH or BAS. 5% collects the full BRS match. ${TSP_MAX_EARLY_WARNING}`}
                      />
                    }
                    hint={
                      <>
                        {"Right now: "}
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
                      </>
                    }
                  />

                  <label className="flex items-center gap-2 text-sm text-gray-600">
                    <input
                      type="checkbox"
                      checked={brs}
                      onChange={(e) => setBrs(e.target.checked)}
                    />
                    BRS agency contributions (1% automatic + up to 4% match)
                  </label>
                </FieldList>

                <FieldNote tone="faint">{TSP_LIMIT_HINT}</FieldNote>

                {showTspPacingWarning && (
                  <div className="space-y-1.5">
                    <FieldNote tone="warn">
                      {`You'd forfeit about ${fmtUSD0(
                        Math.round(tspPacing.matchLostTotal)
                      )} of BRS match a year. At ${tspPctLabel(contribPct)} you reach the ${fmtUSD0(
                        tspPacing.limit
                      )} limit in ${tspStopMonth}, then contribute nothing for ${tspStoppedPhrase} — and your service only matches money that actually goes in that month. Contributing faster doesn't get you more. It can get you less.`}
                    </FieldNote>
                    <FieldNote tone="warn">
                      {"The automatic 1% keeps arriving in those months. Only the match on your own money — up to 4% — stops, and it is not added back later."}
                    </FieldNote>
                    <div className="flex flex-wrap items-center gap-2 pt-0.5">
                      <MiniButton
                        onClick={() => setContribPct(tspPacing.evenPct)}
                        title={`Sets your contribution to ${tspPctLabel(
                          tspPacing.evenPct
                        )} — ${fmtUSD0(
                          Math.round(tspPacing.evenMonthly)
                        )}/mo, so your last dollar lands on your December paycheck and you keep the full match all year.`}
                      >
                        {`Spread it evenly — ${tspPctLabel(tspPacing.evenPct)}`}
                      </MiniButton>
                      <span className="text-xs text-gray-500">
                        {`${fmtUSD0(
                          Math.round(tspPacing.evenMonthly)
                        )}/mo — your last dollar lands in December.`}
                      </span>
                    </div>
                    <FieldNote tone="warn">
                      {"Estimate: it assumes twelve equal months and today's base pay. Election changes take effect at the end of the current month, so act a month before you would hit the limit. Part-way through the year already? The calculator below uses what you have put in so far."}
                    </FieldNote>
                  </div>
                )}

                {showTspCatchUpNote && (
                  <FieldNote tone="warn">
                    {`At ${tspPctLabel(contribPct)} you reach the ${fmtUSD0(
                      tspPacing.limit
                    )} limit in ${tspStopMonth}. From 50, contributions past the limit roll into catch-up instead of stopping, so your match normally keeps going — until the catch-up room runs out too.`}
                  </FieldNote>
                )}

                {showTspNotMatchedYet && (
                  <FieldNote tone="warn">
                    {`At ${tspPctLabel(contribPct)} you reach the ${fmtUSD0(
                      tspPacing.limit
                    )} limit in ${tspStopMonth} and contribute nothing for ${tspStoppedPhrase}. No match is lost yet — your service starts matching after 2 years of service — and the automatic 1% keeps arriving once you are past 60 days of service.`}
                  </FieldNote>
                )}

                <TspResetCalculator
                  monthlyBasePay={basePayNow ?? 0}
                  currentPct={contribPct}
                  onApply={(pct) => setContribPct(pct)}
                />

                <details className="pt-1">
                  <summary className="cursor-pointer text-xs font-medium text-gray-600 underline underline-offset-2 hover:text-gray-900">
                    {`Returns & fees — blended ≈ ${(tspReturn * 100).toFixed(1)}%/yr net`}
                  </summary>
                  <div className="mt-2 space-y-2">
                <FieldList className="mt-0">
                  <SelectRow
                    label="Assumed returns"
                    value={preset}
                    onChange={(v) => setPreset(v as ReturnPreset)}
                    ariaLabel="Return assumption preset"
                    hint={
                      <Explain
                        title={`Your fund mix's weighted-average assumed annual return (${(
                          tspReturnGross * 100
                        ).toFixed(1)}%) minus the ${tspFeePct}% expense ratio. The TSP balance compounds at this net rate.`}
                        className="font-medium text-gray-700"
                      >
                        {`Blended ≈ ${(tspReturn * 100).toFixed(1)}%/yr net of fees`}
                      </Explain>
                    }
                  >
                    <option value="longRun">Long run (since 1987–88)</option>
                    <option value="tenYear">Last 10 years (2016–2025)</option>
                    <option value="custom">Custom</option>
                  </SelectRow>

                  <FieldRow
                    label="TSP expense ratio"
                    control={
                      <UnitInput
                        value={tspFeePct}
                        onChange={(v) => setTspFeePct(Math.max(0, Math.min(2, num(v))))}
                        suffix="%/yr"
                        width="w-12"
                        min={0}
                        max={2}
                        step={0.01}
                        ariaLabel="TSP expense ratio percent per year"
                        title="The TSP's all-in fund cost, deducted from share prices automatically. Recent totals run about 0.04–0.08%/yr depending on the fund."
                      />
                    }
                    hint={
                      <>
                        {`≈ $${(tspFeePct * 10).toFixed(2)} per $1,000/yr. `}
                        <button
                          type="button"
                          onClick={() => setShowTspFees((s) => !s)}
                          className="font-medium text-gray-600 underline underline-offset-2 hover:text-gray-900"
                        >
                          {showTspFees ? "Hide" : "What does this fee actually pay for?"}
                        </button>
                      </>
                    }
                  />
                </FieldList>
                {showTspFees && (
                  <div className="rounded-xl bg-gray-50 p-3 text-xs leading-5 text-gray-600">
                    <div className="font-semibold text-gray-800">
                      TSP fund management fees — most people never see these
                    </div>
                    <ul className="mt-2 list-disc space-y-1.5 pl-4">
                      {TSP_EXPENSE_EXPLAINER.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setShowTspDetail((s) => !s)}
                  className="text-xs font-medium text-gray-600 underline underline-offset-2 hover:text-gray-900"
                >
                  {showTspDetail ? "Hide" : "Edit"}
                  {" fund mix & returns"}
                </button>
                {showTspDetail && (
                  <div className="space-y-2 pt-1">
                    {TSP_FUNDS.map((f) => (
                      <FieldRow
                        key={f.key}
                        label={
                          <span className="flex items-center gap-2">
                            <span
                              className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                              style={{ backgroundColor: f.color }}
                            />
                            <span className="font-medium">{f.name}</span>
                          </span>
                        }
                        control={
                          <>
                            <UnitInput
                              value={alloc[f.key] || 0}
                              onChange={(v) =>
                                setAlloc((prev) => ({
                                  ...prev,
                                  [f.key]: Math.max(0, Math.min(100, num(v))),
                                }))
                              }
                              suffix="%"
                              width="w-10"
                              min={0}
                              max={100}
                              step={5}
                              ariaLabel={`${f.name} allocation percent`}
                            />
                            {preset === "custom" ? (
                              <UnitInput
                                value={customReturns[f.key]}
                                onChange={(v) =>
                                  setCustomReturns((prev) => ({
                                    ...prev,
                                    [f.key]: num(v),
                                  }))
                                }
                                suffix="%/yr"
                                width="w-12"
                                min={-20}
                                max={30}
                                step={0.1}
                                ariaLabel={`${f.name} assumed annual return percent`}
                              />
                            ) : (
                              <span className="whitespace-nowrap text-sm font-medium text-gray-500">
                                {`${(fundReturns[f.key] * 100).toFixed(1)}%/yr`}
                              </span>
                            )}
                          </>
                        }
                      />
                    ))}
                    {allocTotal !== 100 && (
                      <FieldNote tone="warn">
                        Mix totals {allocTotal}% — weights are normalized, but aim for 100%.
                      </FieldNote>
                    )}
                  </div>
                )}
                  </div>
                </details>
              </div>
            </div>

              </div>
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Savings &amp; investments — during &amp; after service
              </h3>
              <div className={inputGroupCls}>
            {/* Civilian IRA */}
            <div className="rounded-3xl border bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                  Civilian IRA{" "}
                  <InfoDot
                    text={
                      `${IRA_LIMIT_SENTENCE} ${IRA_SEPARATE_FROM_TSP_NOTE}\n\nA Roth or Traditional IRA at a brokerage — unlike the TSP, you can keep contributing after you separate.\n\nContributions run until the age you set and are capped at the limit above; the return compounds net of the fee you enter.\n\n${ROTH_IRA_PHASEOUT_NOTE}`
                    }
                  />
                </h2>
                <span className="flex items-center gap-2.5">
                  {iraOn && (
                    <span
                      className="cursor-help text-sm font-semibold"
                      title="What you're adding to the IRA each month while serving. Set the after-service pace and stop age below."
                    >
                      {fmtUSD0(Math.min(iraMonthly, IRA_CONTRIBUTION_LIMIT_2026 / 12))}/mo
                    </span>
                  )}
                  <BoxSwitch
                    on={iraOn}
                    onChange={setIraOn}
                    label="Count the civilian IRA in the projection"
                  />
                </span>
              </div>
              {!iraOn && (
                <p className="mt-2 text-xs text-gray-400">
                  Switched off — not counted in the projection.
                </p>
              )}
              {iraOn && prefill.iraMonthly && (
                <p className="mt-1 text-xs text-gray-400">
                  Pre-filled from your saved budget&apos;s IRA — edit anything.
                </p>
              )}
              {iraOn && (
              <div className="mt-3 space-y-2 text-sm">
                <FieldList className="mt-0">
                  <FieldRow
                    label="Balance today"
                    control={
                      <UnitInput
                        value={iraBalance === 0 ? "" : iraBalance}
                        onChange={(v) => setIraBalance(Math.max(0, num(v)))}
                        prefix="$"
                        width="w-24"
                        min={0}
                        step={500}
                        placeholder="0"
                        ariaLabel="Current IRA balance"
                      />
                    }
                  />

                  <FieldRow
                    label="Adding while serving"
                    control={
                      <>
                        <UnitInput
                          value={iraMonthly === 0 ? "" : iraMonthly}
                          onChange={(v) => setIraMonthly(Math.max(0, num(v)))}
                          prefix="$"
                          suffix="/mo"
                          width="w-14"
                          min={0}
                          step={25}
                          placeholder="0"
                          ariaLabel="Monthly IRA contribution while serving"
                        />
                        <MiniButton
                          onClick={() => setIraMonthly(IRA_CONTRIBUTION_LIMIT_2026 / 12)}
                          title={`Set the while-serving contribution to the pace that reaches the ${fmtUSD0(
                            IRA_CONTRIBUTION_LIMIT_2026
                          )} 2026 IRA annual limit (${fmtUSD0(
                            IRA_CONTRIBUTION_LIMIT_2026 / 12
                          )}/mo).`}
                        >
                          Max
                        </MiniButton>
                      </>
                    }
                  />

                  <FieldRow
                    label="Adding after service"
                    control={
                      <>
                        <UnitInput
                          value={iraMonthlyAfter === 0 ? "" : iraMonthlyAfter}
                          onChange={(v) => setIraMonthlyAfter(Math.max(0, num(v)))}
                          prefix="$"
                          suffix="/mo"
                          width="w-14"
                          min={0}
                          step={25}
                          placeholder="0"
                          ariaLabel="Monthly IRA contribution after service"
                        />
                        <MiniButton
                          onClick={() => setIraMonthlyAfter(IRA_CONTRIBUTION_LIMIT_2026 / 12)}
                          title={`Set the after-service contribution to the pace that reaches the ${fmtUSD0(
                            IRA_CONTRIBUTION_LIMIT_2026
                          )} 2026 IRA annual limit (${fmtUSD0(
                            IRA_CONTRIBUTION_LIMIT_2026 / 12
                          )}/mo).`}
                        >
                          Max
                        </MiniButton>
                      </>
                    }
                  />

                  <FieldRow
                    label="Contributing until age"
                    control={
                      <UnitInput
                        value={iraUntilAge}
                        onChange={(v) =>
                          setIraUntilAge(Math.max(currentAge, Math.min(90, num(v, 65))))
                        }
                        suffix="yrs old"
                        width="w-12"
                        min={currentAge}
                        max={90}
                        ariaLabel="Keep contributing to the IRA until this age"
                        title="Contributions stop at this age; the balance keeps compounding to your projection horizon."
                      />
                    }
                  />
                </FieldList>

                <FieldNote tone="faint">{IRA_LIMIT_HINT}</FieldNote>
                {iraMonthly * 12 > IRA_CONTRIBUTION_LIMIT_2026 && (
                  <FieldNote tone="warn">
                    {`Capped at the ${fmtUSD0(
                      IRA_CONTRIBUTION_LIMIT_2026
                    )} annual IRS limit (${fmtUSD0(IRA_CONTRIBUTION_LIMIT_2026 / 12)}/mo).`}
                  </FieldNote>
                )}
                <details>
                  <summary className="cursor-pointer text-xs font-medium text-gray-600 underline underline-offset-2 hover:text-gray-900">
                    {`Returns & fees — ${iraReturnNetPct.toFixed(2)}%/yr net of fees`}
                  </summary>
                  <div className="mt-2 space-y-2">
                    <FieldList className="mt-0">
                      <FieldRow
                        label="Assumed return"
                        control={
                          <UnitInput
                            value={iraReturnPct}
                            onChange={(v) => setIraReturnPct(num(v))}
                            suffix="%/yr"
                            width="w-12"
                            min={-20}
                            max={30}
                            step={0.5}
                            ariaLabel="Assumed IRA annual return percent, before fees"
                          />
                        }
                      />
                      <FieldRow
                        label="Fees"
                        control={
                          <UnitInput
                            value={iraFeePct}
                            onChange={(v) => setIraFeePct(Math.max(0, Math.min(2, num(v))))}
                            suffix="%/yr"
                            width="w-12"
                            min={0}
                            max={2}
                            step={0.01}
                            ariaLabel="IRA expense ratio / advisory fee percent per year"
                            title="Fund expense ratio plus any advisory fee. Broad index funds at the big firms run ≈0.02–0.10%; robo/advisory services add ≈0.25–0.35%."
                          />
                        }
                      />
                    </FieldList>
                    <div className="rounded-xl bg-gray-50 p-3 text-xs leading-5 text-gray-600">
                      <ul className="list-disc space-y-1.5 pl-4">
                        {IRA_PROVIDER_CONTEXT.map((pvd) => (
                          <li key={pvd.name}>
                            <span className="font-medium">{pvd.name}:</span> index funds {pvd.indexExpenseRatioPct}
                            {" · "}
                            {pvd.accountFee}. {pvd.advisoryNote}
                          </li>
                        ))}
                      </ul>
                      <p className="mt-2 font-medium text-gray-700">{IRA_FEE_DISCLAIMER}</p>
                    </div>
                  </div>
                </details>
              </div>
              )}
            </div>

            {/* Taxable investments */}
            <div className="rounded-3xl border bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                  Investment account{" "}
                  <InfoDot
                    text={`Taxable brokerage money outside the TSP and IRA — e.g. an S&P 500 index fund. The ${PERF.otherAssets.sp500LongRunPct}% default ≈ the S&P 500's long-run average with dividends, before inflation; any given 5-year stretch can be far above or below it.`}
                  />
                </h2>
                <span className="flex items-center gap-2.5">
                  {invOn && (
                    <span
                      className="cursor-help text-sm font-semibold"
                      title="What you're adding to this account each month while serving. Set a different after-service pace below."
                    >
                      {fmtUSD0(invMonthly)}/mo
                    </span>
                  )}
                  <BoxSwitch
                    on={invOn}
                    onChange={setInvOn}
                    label="Count the investment account in the projection"
                  />
                </span>
              </div>
              {!invOn && (
                <p className="mt-2 text-xs text-gray-400">
                  Switched off — not counted in the projection.
                </p>
              )}
              {invOn && (
              <FieldList>
                <FieldRow
                  label="Balance today"
                  control={
                    <UnitInput
                      value={invBalance === 0 ? "" : invBalance}
                      onChange={(v) => setInvBalance(Math.max(0, num(v)))}
                      prefix="$"
                      width="w-24"
                      min={0}
                      step={500}
                      placeholder="0"
                      ariaLabel="Current investment balance"
                    />
                  }
                />

                <FieldRow
                  label="Assumed return"
                  control={
                    <UnitInput
                      value={invReturnPct}
                      onChange={(v) => setInvReturnPct(num(v))}
                      suffix="%/yr"
                      width="w-12"
                      min={-20}
                      max={30}
                      step={0.5}
                      ariaLabel="Assumed investment annual return percent"
                    />
                  }
                />

                <FieldRow
                  label="Adding while serving"
                  control={
                    <UnitInput
                      value={invMonthly === 0 ? "" : invMonthly}
                      onChange={(v) => setInvMonthly(Math.max(0, num(v)))}
                      prefix="$"
                      suffix="/mo"
                      width="w-14"
                      min={0}
                      step={25}
                      placeholder="0"
                      ariaLabel="Monthly investment contribution while serving"
                    />
                  }
                />

                <FieldRow
                  label="Adding after service"
                  control={
                    <UnitInput
                      value={invMonthlyAfter === 0 ? "" : invMonthlyAfter}
                      onChange={(v) => setInvMonthlyAfter(Math.max(0, num(v)))}
                      prefix="$"
                      suffix="/mo"
                      width="w-14"
                      min={0}
                      step={25}
                      placeholder="0"
                      ariaLabel="Monthly investment contribution after service"
                    />
                  }
                />
              </FieldList>
              )}
            </div>

            {/* Savings */}
            <div className="rounded-3xl border bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                  Savings{" "}
                  <InfoDot text="Emergency fund and short-term goals in a high-yield savings account. Rates move with the Fed — use your bank's APY." />
                </h2>
                <span className="flex items-center gap-2.5">
                  {savOn && (
                    <span
                      className="cursor-help text-sm font-semibold"
                      title="What you're adding to savings each month while serving. Set a different after-service pace below."
                    >
                      {fmtUSD0(savMonthly)}/mo
                    </span>
                  )}
                  <BoxSwitch
                    on={savOn}
                    onChange={setSavOn}
                    label="Count savings in the projection"
                  />
                </span>
              </div>
              {!savOn && (
                <p className="mt-2 text-xs text-gray-400">
                  Switched off — not counted in the projection.
                </p>
              )}
              {savOn && (
              <FieldList>
                <FieldRow
                  label="Balance today"
                  control={
                    <UnitInput
                      value={savBalance === 0 ? "" : savBalance}
                      onChange={(v) => setSavBalance(Math.max(0, num(v)))}
                      prefix="$"
                      width="w-24"
                      min={0}
                      step={250}
                      placeholder="0"
                      ariaLabel="Current savings balance"
                    />
                  }
                />

                <FieldRow
                  label="Rate"
                  control={
                    <UnitInput
                      value={savApyPct}
                      onChange={(v) => setSavApyPct(Math.max(0, num(v)))}
                      suffix="% APY"
                      width="w-12"
                      min={0}
                      max={15}
                      step={0.1}
                      ariaLabel="Savings APY percent"
                    />
                  }
                />

                <FieldRow
                  label="Adding while serving"
                  control={
                    <UnitInput
                      value={savMonthly === 0 ? "" : savMonthly}
                      onChange={(v) => setSavMonthly(Math.max(0, num(v)))}
                      prefix="$"
                      suffix="/mo"
                      width="w-14"
                      min={0}
                      step={25}
                      placeholder="0"
                      ariaLabel="Monthly savings contribution while serving"
                    />
                  }
                />

                <FieldRow
                  label="Adding after service"
                  control={
                    <UnitInput
                      value={savMonthlyAfter === 0 ? "" : savMonthlyAfter}
                      onChange={(v) => setSavMonthlyAfter(Math.max(0, num(v)))}
                      prefix="$"
                      suffix="/mo"
                      width="w-14"
                      min={0}
                      step={25}
                      placeholder="0"
                      ariaLabel="Monthly savings contribution after service"
                    />
                  }
                />
              </FieldList>
              )}
            </div>
              </div>
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Post-military civilian career
              </h3>
              <div className={inputGroupCls}>
            {/* Civilian salary & employer 401(k) */}
            <div className="rounded-3xl border bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                  Civilian salary &amp; 401(k){" "}
                  <InfoDot
                    text={
                      `2026 limit: ${TSP_LIMIT_SUMMARY} of your own pay. ${DEFERRAL_SHARED_NOTE} Separating mid-year, whatever you already put into the TSP comes off what you can defer at the new job.\n\nWhat you expect to earn after leaving the military, and the employer plan that comes with it. The 401(k) starts the month you separate: your percentage plus the employer match, which does not count against your limit.\n\nFees vary widely by plan (often 0.3–1%+ all-in) — fold them into the return you assume.`
                    }
                  />
                </h2>
                <span className="flex items-center gap-2.5">
                  {k401On && (
                    <span
                      className="cursor-help text-sm font-semibold"
                      title="Monthly 401(k) contributions (you + employer match) from your assumed civilian salary, starting at separation."
                    >
                      {fmtUSD0(k401Monthly)}/mo
                    </span>
                  )}
                  <BoxSwitch
                    on={k401On}
                    onChange={setK401On}
                    label="Count the civilian career 401(k) in the projection"
                  />
                </span>
              </div>
              {!k401On && (
                <p className="mt-2 text-xs text-gray-400">
                  Switched off — not counted in the projection.
                </p>
              )}
              {k401On && (
              <div className="mt-3 space-y-2 text-sm">
                <FieldList className="mt-0">
                  <FieldRow
                    label="Salary after service"
                    control={
                      <UnitInput
                        value={civSalary === 0 ? "" : civSalary}
                        onChange={(v) => setCivSalary(Math.max(0, num(v)))}
                        prefix="$"
                        suffix="/yr"
                        width="w-20"
                        min={0}
                        step={5000}
                        placeholder={String(DEFAULT_CIVILIAN_SALARY)}
                        ariaLabel="Expected civilian salary per year after service"
                      />
                    }
                    hint={
                      civSalary > 0
                        ? `≈ ${fmtUSD0(civSalary / 12)}/mo.`
                        : `Assumes ${fmtUSD0(
                            DEFAULT_CIVILIAN_SALARY
                          )} to start — change it to your own expected salary.`
                    }
                  />

                  <SelectRow
                    label="401(k) type"
                    tip={
                      "Traditional: pre-tax now, taxed at withdrawal.\nRoth: taxed now, tax-free later.\n\nThe balance projected here is the same either way — what differs is the tax bill at withdrawal. The Roth vs Traditional card in the Trade space tab shows that comparison.\n\nEmployer match dollars are always pre-tax (Traditional), whatever you pick."
                    }
                    value={k401Type}
                    onChange={(v) => setK401Type(v as "traditional" | "roth")}
                    ariaLabel="Civilian 401(k) tax type"
                  >
                    <option value="traditional">Traditional (pre-tax)</option>
                    <option value="roth">Roth (post-tax)</option>
                  </SelectRow>

                  <FieldRow
                    label="You contribute"
                    control={
                      <>
                        <UnitInput
                          value={k401Pct}
                          onChange={(v) => setK401Pct(Math.max(0, Math.min(100, num(v, 6))))}
                          suffix="% of salary"
                          width="w-10"
                          min={0}
                          max={100}
                          step={1}
                          ariaLabel="Your 401(k) contribution percent of salary"
                        />
                        <MiniButton
                          disabled={civSalary <= 0}
                          onClick={() =>
                            setK401Pct(
                              Math.min(
                                100,
                                Math.round(
                                  (TSP_ELECTIVE_DEFERRAL_LIMIT_2026 / civSalary) * 1000
                                ) / 10
                              )
                            )
                          }
                          title={`Set your percentage so this salary reaches the ${fmtUSD0(
                            TSP_ELECTIVE_DEFERRAL_LIMIT_2026
                          )} 2026 annual employee limit — shared with the TSP in the same calendar year, and the employer match doesn't count against it. Set a salary first.`}
                        >
                          Max
                        </MiniButton>
                      </>
                    }
                  />

                  <FieldRow
                    label="Employer match"
                    control={
                      <UnitInput
                        value={k401MatchPct}
                        onChange={(v) => setK401MatchPct(Math.max(0, Math.min(100, num(v, 4))))}
                        suffix="% of salary"
                        width="w-10"
                        min={0}
                        max={100}
                        step={0.5}
                        ariaLabel="Employer 401(k) match percent of salary"
                        title="Typical employer matches run 3–6% of salary — check the plan's vesting schedule."
                      />
                    }
                    hint={`Together ${fmtUSD0(k401Monthly)}/mo into the 401(k), starting the month you separate.`}
                  />

                  <FieldRow
                    label="Contributing until age"
                    control={
                      <UnitInput
                        value={k401UntilAge}
                        onChange={(v) =>
                          setK401UntilAge(Math.max(currentAge, Math.min(90, num(v, 65))))
                        }
                        suffix="yrs old"
                        width="w-12"
                        min={currentAge}
                        max={90}
                        ariaLabel="Keep contributing to the 401(k) until this age"
                      />
                    }
                  />

                  <FieldRow
                    label="Assumed return"
                    control={
                      <UnitInput
                        value={k401ReturnPct}
                        onChange={(v) => setK401ReturnPct(num(v))}
                        suffix="%/yr"
                        width="w-12"
                        min={-20}
                        max={30}
                        step={0.5}
                        ariaLabel="Assumed 401(k) annual return percent"
                      />
                    }
                  />
                </FieldList>

                <FieldNote tone="faint">{K401_LIMIT_HINT}</FieldNote>
                {civSalary === 0 && (
                  <FieldNote>
                    Set an expected salary to model the 401(k) — it starts the month you separate.
                  </FieldNote>
                )}
                {serviceYears >= projectionYears && k401Monthly > 0 && (
                  <FieldNote tone="warn">
                    Your projection ends at separation — extend the horizon (&quot;an age I pick&quot;)
                    to see the civilian career grow.
                  </FieldNote>
                )}
              </div>
              )}
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
                {(["tsp", "ira", "k401", "invest", "savings"] as const)
                  .filter((k) =>
                    k === "ira"
                      ? iraActive
                      : k === "k401"
                      ? k401Active
                      : k === "invest"
                      ? invOn
                      : k === "savings"
                      ? savOn
                      : true
                  )
                  .map((k) => {
                    const explain =
                      k === "tsp"
                        ? `TSP at the horizon: today's balance plus your ${Math.round(
                            contribPct * 100
                          )}% of base pay${brs ? " and the BRS match" : ""} each month while serving, compounding at ${(
                            tspReturn * 100
                          ).toFixed(1)}%/yr net of the ${tspFeePct}% expense ratio.`
                        : k === "ira"
                        ? `Civilian IRA at the horizon: balance plus ${fmtUSD0(
                            iraMonthly
                          )}/mo while serving (${fmtUSD0(
                            iraMonthlyAfter
                          )}/mo after) until age ${iraUntilAge}, compounding at ${iraReturnNetPct.toFixed(
                            2
                          )}%/yr net of fees.`
                        : k === "k401"
                        ? `Civilian 401(k) at the horizon: ${fmtUSD0(
                            k401Monthly
                          )}/mo (incl. any employer match) from separation until age ${k401UntilAge}, at ${k401ReturnPct}%/yr.`
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
                        {ACCOUNT_LABELS[k]} {fmtUSD0(projection.final.balances[k] ?? 0)}
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
                    baselineSeries={baselineSeries}
                  />
                )}
                {tab === "pay" && <PayRankChart projection={projection} startYear={startYear} />}
                {tab === "flows" && <FlowsChart projection={projection} startYear={startYear} />}
                {tab === "tradespace" && (
                  <div className="space-y-5 p-4 md:p-5">
                    {/* ---- Stay-longer trade space ---- */}
                    <div className="rounded-2xl border p-4">
                      <div className="text-sm font-semibold">Serve longer vs. leave</div>
                      <p className="mt-2 text-sm leading-6 text-gray-600">
                        {`Staying 3 more years (separating ${sepYear + 3} instead of ${sepYear}) ends near `}
                        <span className="font-semibold">{fmtUSD0(stayLonger.extended.final.total)}</span>
                        {` vs `}
                        <span className="font-semibold">{fmtUSD0(stayLonger.base.final.total)}</span>
                        {` at the same end age — a ${fmtUSD0(
                          stayLonger.extended.final.total - stayLonger.base.final.total
                        )} difference from extra contributions, match, and promotions.`}
                      </p>
                    </div>

                    {/* ---- Next-PCS trade space ---- */}
                    <div className="rounded-2xl border p-4">
                      <div className="text-sm font-semibold">
                        Next PCS — where you land matters{" "}
                        <InfoDot
                          text={
                            "Compares candidate next duty stations by their housing allowance at the grade you're projected to hold when you arrive.\n\nThe monthly BAH difference vs. staying is assumed to flow into your investment account at your assumed return while you serve, then compound to your horizon.\n\nUses current-year BAH tables for future years (rates change annually), and doesn't model local rent, COLA, or OCONUS housing — it's the allowance side only, not cost of living."
                          }
                        />
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-600">
                        <span>PCS in</span>
                        <input
                          type="number"
                          min={0}
                          max={30}
                          value={pcsYear}
                          onChange={(e) => setPcsYear(Math.max(0, Math.min(30, num(e.target.value, 1))))}
                          className={pctInput}
                          aria-label="Years until your next PCS"
                        />
                        <span>
                          yr{pcsYear === 1 ? "" : "s"}
                          {pcsTrade && (
                            <>
                              {" — arriving as "}
                              <Explain title="Your projected grade at the PCS date, from the promotion schedule — BAH is looked up at this grade, not today's.">
                                {String(pcsTrade.gradeAtPcs)}
                              </Explain>
                            </>
                          )}
                          {" · from ZIP"}
                        </span>
                        <input
                          value={pcsCurrentZip}
                          onChange={(e) => setPcsCurrentZip(e.target.value)}
                          placeholder="02215"
                          className="field w-24 rounded-lg px-2 py-1"
                          aria-label="Current duty ZIP"
                        />
                        <label className="flex items-center gap-1.5">
                          <input
                            type="checkbox"
                            checked={pcsDeps}
                            onChange={(e) => setPcsDeps(e.target.checked)}
                          />
                          with dependents
                        </label>
                      </div>

                      {!pcsTrade ? (
                        <p className="mt-2 text-xs text-gray-500">
                          Enter your current duty ZIP to compare candidate stations.
                        </p>
                      ) : pcsTrade.current.rate == null ? (
                        <p className="mt-2 text-xs text-amber-700">
                          Current ZIP not found in the BAH tables — check it or use a nearby ZIP.
                        </p>
                      ) : (
                        <>
                          <p className="mt-2 text-xs text-gray-500">
                            {`Staying put: ${fmtUSD0(pcsTrade.current.rate)}/mo BAH as ${pcsTrade.gradeAtPcs}. Candidate stations vs. that baseline:`}
                          </p>
                          <div className="mt-2 space-y-1.5">
                            {pcsCandidates.map((raw, i) => {
                              const result = pcsTrade.candidates[i];
                              return (
                                <div
                                  key={i}
                                  className="flex flex-wrap items-center gap-2 text-xs text-gray-600"
                                >
                                  <input
                                    value={raw}
                                    onChange={(e) =>
                                      setPcsCandidates((prev) =>
                                        prev.map((z, j) => (j === i ? e.target.value : z))
                                      )
                                    }
                                    placeholder={i === 0 ? "20755 (Ft. Meade)" : "ZIP"}
                                    className="field w-32 rounded-lg px-2 py-1"
                                    aria-label={`Candidate station ZIP ${i + 1}`}
                                  />
                                  {result &&
                                    (result.rate == null ? (
                                      <span className="text-amber-700">
                                        ZIP not in the BAH tables
                                      </span>
                                    ) : (
                                      <span>
                                        {`${fmtUSD0(result.rate)}/mo · `}
                                        <span
                                          className="font-medium"
                                          style={{
                                            color:
                                              result.deltaMonthly < 0 ? "#b45309" : "#15803d",
                                          }}
                                        >
                                          {`${result.deltaMonthly >= 0 ? "+" : "−"}${fmtUSD0(
                                            Math.abs(result.deltaMonthly)
                                          )}/mo`}
                                        </span>
                                        {" · "}
                                        <Explain
                                          title={`The monthly BAH difference, invested at your ${invReturnPct}% assumed return from the PCS through separation, then compounding untouched to age ${
                                            currentAge + projectionYears
                                          }.`}
                                        >
                                          {`≈ ${result.deltaEnd >= 0 ? "+" : "−"}${fmtUSD0(
                                            Math.abs(result.deltaEnd)
                                          )} by age ${currentAge + projectionYears}`}
                                        </Explain>
                                      </span>
                                    ))}
                                </div>
                              );
                            })}
                          </div>
                          {pcsTrade.monthsEarning <= 0 && (
                            <p className="mt-2 text-xs text-amber-700">
                              This PCS lands at or after your separation — extend your service
                              window to see it matter.
                            </p>
                          )}
                        </>
                      )}
                    </div>

                    {/* ---- Roth vs Traditional trade space ---- */}
                    <div className="rounded-2xl border p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm font-semibold">
                          Roth vs Traditional — pay tax now or later{" "}
                          <InfoDot text="Same dollars into the account either way, so the pre-tax balance is identical. Roth pays tax on contributions today; Traditional defers tax and pays it on the whole balance (contributions + growth) at withdrawal. The winner is decided by which tax rate is higher — today's or retirement's." />
                        </div>
                        <span
                          className="rounded-full border px-2.5 py-1 text-xs font-medium"
                          style={{
                            color: rothTrade.winner === "roth" ? ROTH_COLOR : rothTrade.winner === "traditional" ? TRAD_COLOR : undefined,
                          }}
                        >
                          {rothTrade.winner === "even"
                            ? "Effectively even at these rates"
                            : `${rothTrade.winner === "roth" ? "Roth" : "Traditional"} ahead by ~${fmtUSD0(
                                rothTrade.advantage
                              )}`}
                        </span>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-600">
                        <span>Contributing</span>
                        <div className="field flex items-center rounded-lg px-2 py-1">
                          <span className="text-gray-500">$</span>
                          <input
                            type="number"
                            min={0}
                            step={25}
                            value={rothMonthlyEff}
                            onChange={(e) => setRothMonthlyOverride(Math.max(0, num(e.target.value)))}
                            className="w-16 bg-transparent text-right outline-none"
                            aria-label="Monthly contribution compared in the Roth vs Traditional trade space"
                          />
                        </div>
                        <span>{`/mo for ${rothYearsContrib} yr${rothYearsContrib === 1 ? "" : "s"}, withdrawn in year ${Math.max(
                          projectionYears,
                          rothYearsContrib
                        )} · tax rate`}</span>
                        <input
                          type="number"
                          min={0}
                          max={50}
                          step={1}
                          value={rothRateNowPct}
                          onChange={(e) => setRothRateNowPct(Math.max(0, Math.min(50, num(e.target.value))))}
                          className={pctInput}
                          aria-label="Marginal tax rate today, percent"
                        />
                        <span>% now vs</span>
                        <input
                          type="number"
                          min={0}
                          max={50}
                          step={1}
                          value={rothRateLaterPct}
                          onChange={(e) => setRothRateLaterPct(Math.max(0, Math.min(50, num(e.target.value))))}
                          className={pctInput}
                          aria-label="Expected tax rate at withdrawal, percent"
                        />
                        <span>% in retirement</span>
                      </div>

                      <div className="mt-3 overflow-hidden rounded-xl border">
                        <RothTradeChart result={rothTrade} />
                      </div>

                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-xl border p-3 text-sm" style={{ borderColor: `${ROTH_COLOR}66` }}>
                          <div className="font-semibold" style={{ color: ROTH_COLOR }}>
                            Roth — tax up front
                          </div>
                          <div className="mt-2 space-y-1 text-xs text-gray-600">
                            <div className="flex justify-between">
                              <span>Taxes paid along the way</span>
                              <span className="font-medium">− {fmtUSD0(rothTrade.final.taxPaidUpFront)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Tax at withdrawal</span>
                              <span className="font-medium">$0</span>
                            </div>
                            <div className="flex justify-between border-t pt-1">
                              <span className="font-medium text-gray-900">You keep</span>
                              <span className="font-bold text-gray-900">{fmtUSD0(rothTrade.final.rothAfterTax)}</span>
                            </div>
                          </div>
                        </div>
                        <div className="rounded-xl border p-3 text-sm" style={{ borderColor: `${TRAD_COLOR}66` }}>
                          <div className="font-semibold" style={{ color: TRAD_COLOR }}>
                            Traditional — tax later
                          </div>
                          <div className="mt-2 space-y-1 text-xs text-gray-600">
                            <div className="flex justify-between">
                              <span>Taxes paid along the way</span>
                              <span className="font-medium">$0 (plus a tax break each year)</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Tax at withdrawal</span>
                              <span className="font-medium">− {fmtUSD0(rothTrade.final.deferredTaxBill)}</span>
                            </div>
                            <div className="flex justify-between border-t pt-1">
                              <span className="font-medium text-gray-900">You keep</span>
                              <span className="font-bold text-gray-900">{fmtUSD0(rothTrade.final.tradAfterTax)}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <p className="mt-3 text-xs text-gray-600">
                        {`Breakeven: if your retirement tax rate ends up below ~${rothTrade.breakevenRatePct}% (your rate today), Traditional wins; above it, Roth wins. `}
                        {`This applies to both the TSP election and a civilian Roth vs Traditional IRA.`}
                      </p>
                      <details className="mt-2 text-xs text-gray-500">
                        <summary className="cursor-pointer font-medium text-gray-600 hover:text-gray-900">
                          Fine print that changes the answer
                        </summary>
                        <ul className="mt-2 list-disc space-y-1.5 pl-5">
                          {ROTH_TRADEOFF_CAVEATS.map((c) => (
                            <li key={c}>{c}</li>
                          ))}
                        </ul>
                      </details>
                    </div>

                    {/* ---- Fee trade space ---- */}
                    <div className="rounded-2xl border p-4">
                      <div className="text-sm font-semibold">What fees cost you</div>
                      <p className="mt-2 text-sm leading-6 text-gray-600">
                        {`At your ${tspFeePct}% TSP expense ratio${
                          iraActive ? ` and ${iraFeePct}% IRA fee` : ""
                        }, fund fees cost about `}
                        <span className="font-semibold">{fmtUSD0(feeDrag)}</span>
                        {` over this projection versus a hypothetical zero-fee fund. The TSP is one of the cheapest plans anywhere — the same balances in typical 0.5–1% actively-managed civilian funds would give up many times more. Details under "TSP fund management fees" in the TSP panel.`}
                      </p>
                    </div>
                  </div>
                )}
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
                          {iraActive && <th className="py-2 font-medium">IRA</th>}
                          {k401Active && <th className="py-2 font-medium">401(k)</th>}
                          {invOn && <th className="py-2 font-medium">Invest</th>}
                          {savOn && <th className="py-2 font-medium">Savings</th>}
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
                              {iraActive && <td className="py-1.5">{fmtUSD0(s.balances.ira)}</td>}
                              {k401Active && <td className="py-1.5">{fmtUSD0(s.balances.k401)}</td>}
                              {invOn && <td className="py-1.5">{fmtUSD0(s.balances.invest)}</td>}
                              {savOn && <td className="py-1.5">{fmtUSD0(s.balances.savings)}</td>}
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

              {/* Tune the plan right under the curve it moves. */}
              {tab === "growth" && (
                <TuneStrip
                  controls={tuneControls}
                  delta={tuneDelta}
                  dirty={tuneDirty}
                  onReset={resetTuning}
                  onSetBaseline={adoptTuningBaseline}
                />
              )}

              {/* Exports — standardized report panel + chart images */}
              <div className="mt-4 space-y-2">
                <ReportPanel
                  description="CSV, text, and PDF are generated entirely in your browser. The Excel model is built by a stateless server route — used once, never stored."
                  scopes={[
                    {
                      value: "standard",
                      label: "This projection",
                      hint: "Assumptions, promotions, year-by-year balances, fees, and the Roth vs Traditional trade space.",
                    },
                    {
                      value: "longterm",
                      label: "Long-term analysis",
                      hint: "Extends to at least age 65 with decade milestones and a sustainable-income estimate.",
                    },
                  ]}
                  scope={reportScope}
                  onScopeChange={(v) => setReportScope(v as "standard" | "longterm")}
                  sections={sectionOptions}
                  selectedSections={reportSections}
                  onSectionsChange={setReportSections}
                  formats={[
                    { value: "csv", label: "CSV — any spreadsheet" },
                    { value: "xlsx", label: "Excel — live model (edit & recalc)" },
                    { value: "txt", label: "Text — plain summary" },
                    { value: "pdf", label: "PDF — printable, with chart" },
                    { value: "all", label: "Everything (.zip)" },
                  ]}
                  format={reportFormat}
                  onFormatChange={(v) => setReportFormat(v as ReportFormat)}
                  onDownload={downloadReport}
                  busy={exporting}
                  disabled={reportSections.length === 0}
                  disabledReason="Pick at least one tool to include in the report."
                  error={exportError}
                />
                <div className="flex flex-wrap items-center gap-2">
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
                </div>
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
                {(projection.totals.employeeTsp > 0 ||
                  (brs && projection.totals.agencyMatch > 0)) && (
                  <li>
                    {projection.totals.employeeTsp > 0
                      ? `You contributed ${fmtUSD0(
                          projection.totals.employeeTsp
                        )} into TSP from your own pay across your service window` +
                        (brs && projection.totals.agencyMatch > 0
                          ? `, and the BRS match adds ${fmtUSD0(
                              projection.totals.agencyMatch
                            )} of agency money on top — pay you only receive by contributing.`
                          : `.`)
                      : `The BRS match contributes ${fmtUSD0(
                          projection.totals.agencyMatch
                        )} of agency money across your service window — pay you only receive by contributing.`}
                  </li>
                )}
                {pensionEstimate && (
                  <li>
                    {`At ${pensionEstimate.serviceYearsTotal} total years you'd be pension-eligible: roughly ${fmtUSD0(
                      pensionEstimate.monthlyPension
                    )}/mo as a ${brs ? "BRS" : "High-3"} pension (estimate — ${
                      pensionEstimate.multiplierPct
                    }%/yr × ${pensionEstimate.serviceYearsTotal} years × your final ${fmtUSD0(
                      pensionEstimate.high3MonthlyBase
                    )}/mo base pay as the High-3 proxy). That's on top of everything above and isn't counted in these totals.`}
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
                  )} difference from extra contributions, match, and promotions. See the Trade space tab for this plus the Roth vs Traditional picture.`}
                </li>
                {feeDrag > 0 && (
                  <li>
                    {`Fund fees quietly cost about ${fmtUSD0(feeDrag)} over this horizon at your ${tspFeePct}% TSP expense ratio${
                      iraActive ? ` and ${iraFeePct}% IRA fee` : ""
                    } — cheap by industry standards, but never free. The Trade space tab shows the comparison.`}
                  </li>
                )}
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
                Not modeled: taxes on the investment account, growth in the contribution limits
                (the 2026 TSP, IRA, and 401(k) limits are held flat in every future year, and
                age-50+ catch-up room is never added), BAH/BAS (allowances aren&apos;t TSP-matched),
                the High-3/BRS pension, or early promotions. Promotion timing comes from the same per-branch schedules as the{" "}
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
            {/* Offscreen chart at the long-term (to age 65) horizon — the
                Long-term report PDF embeds this one so chart and numbers
                always cover the same years. */}
            {reportScope === "longterm" && longTermProjection !== projection && (
              <div aria-hidden className="pointer-events-none absolute -left-[9999px] top-0 w-[920px]">
                <GrowthChart
                  projection={longTermProjection}
                  startBalances={startBalances}
                  startYear={startYear}
                  currentAge={currentAge}
                  serviceYears={serviceYears}
                  svgRef={longTermChartRef}
                />
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
