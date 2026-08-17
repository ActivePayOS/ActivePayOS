"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import SankeySvg from "@/components/sankey/SankeySvg";
import { useThemeColors } from "@/components/sankey/useThemeColors";
import { downloadPng, downloadSvg, svgToPngBytes } from "@/lib/sankey/export";
import {
  buildBudgetGraph,
  fmtUSD0,
  type BudgetItem,
} from "@/lib/sankey/model";
import {
  DEFAULT_FUND_ALLOCATION,
  TSP_AGENCY_MONEY_NOTE,
  TSP_ELECTIVE_DEFERRAL_LIMIT_2026,
  TSP_FUNDS,
  TSP_LIMIT_SENTENCE,
  TSP_MAX_EARLY_WARNING,
  type FundAllocation,
} from "@/lib/pay/tsp";
import { computeTspPacing } from "@/lib/pay/tsp-pacing";
import {
  IRA_CONTRIBUTION_LIMIT_2026,
  IRA_FEE_DISCLAIMER,
  IRA_LIMIT_SENTENCE,
  IRA_PROVIDER_CONTEXT,
  IRA_TYPE_LABELS,
  ROTH_IRA_PHASEOUT_NOTE,
  type IraType,
} from "@/lib/pay/ira";
import {
  loadTransfer,
  clearTransfer,
  buildBudgetFromTransfer,
  type TransferMode,
  type PayTransfer,
} from "@/lib/budget/transfer";
import {
  BUCKET_LABELS,
  BUCKET_TARGETS,
  autoBalance,
  computeCoach,
  type Bucket,
  type BucketOverrides,
} from "@/lib/budget/coach";
import {
  emergencyFundTarget,
  goalEtaLabel,
  goalProgress,
  isSavingsGoal,
  type SavingsGoal,
} from "@/lib/budget/goals";
import { generatePayCsv } from "@/lib/export/csv";
import { generatePayTxt } from "@/lib/export/txt";
import { generatePayPdf } from "@/lib/export/pdf";
import {
  generateBudgetCsv,
  generateBudgetTxt,
  type BudgetExport,
} from "@/lib/export/budget-summary";
import { generateBudgetPdf } from "@/lib/export/budget-pdf";
import { generateProjectionCsv, generateProjectionTxt } from "@/lib/export/projection";
import { generateProjectionPdf } from "@/lib/export/projection-pdf";
import {
  availabilityForSections,
  buildBundleData,
  generateBundleCsv,
  generateBundlePdf,
  generateBundleTxt,
  paySummaryFromTransfer,
  type BundleData,
} from "@/lib/export/bundle";
import { filesToZipBlob } from "@/lib/export/zip";
import PlanFlow from "@/components/PlanFlow";
import InfoDot from "@/components/InfoDot";
import TspResetCalculator from "@/components/TspResetCalculator";
import HoverHint from "@/components/HoverHint";
import ReportPanel from "@/components/ReportPanel";

type ReportFormat = "csv" | "txt" | "pdf" | "all";

// The three tools a report can include, in canonical site order (header
// ribbon / PlanFlow order: Pay -> Budget -> Wealth Projector).
const SECTION_ORDER = ["pay", "budget", "projection"] as const;
type SectionId = (typeof SECTION_ORDER)[number];

type ReportFile = { name: string; data: Blob | string | Uint8Array<ArrayBuffer> };

const REPORT_FORMATS = [
  { value: "csv", label: "CSV — any spreadsheet" },
  { value: "txt", label: "Text — plain summary" },
  { value: "pdf", label: "PDF — printable" },
  { value: "all", label: "Everything (.zip)" },
];

const FORMAT_MIME: Record<Exclude<ReportFormat, "all">, string> = {
  csv: "text/csv;charset=utf-8",
  txt: "text/plain;charset=utf-8",
  pdf: "application/pdf",
};

const STORAGE_KEY = "activepayos:budget:v1";

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

// Hydration flag without an effect: getServerSnapshot returns false (SSR + the
// hydrating render), the client snapshot returns true, so we render the
// interactive UI only once we're safely on the client.
const emptySubscribe = () => () => {};

// Illustrative monthly defaults — the user edits everything.
const DEFAULT_INCOME: BudgetItem[] = [
  { id: "inc-1", label: "Base Pay", amount: 3826 },
  { id: "inc-2", label: "BAH", amount: 2100 },
  { id: "inc-3", label: "BAS", amount: 465 },
];
const DEFAULT_EXPENSES: BudgetItem[] = [
  { id: "exp-1", label: "Housing", amount: 1800 },
  { id: "exp-2", label: "Groceries", amount: 600 },
  { id: "exp-3", label: "Transportation", amount: 450 },
  { id: "exp-4", label: "Savings & TSP", amount: 750 },
  { id: "exp-5", label: "Debt payments", amount: 300 },
  { id: "exp-6", label: "Utilities", amount: 250 },
  { id: "exp-7", label: "Insurance", amount: 200 },
  { id: "exp-8", label: "Fun money", amount: 350 },
];

// One-time read of any budget the user previously saved on THIS device.
// Used as a lazy useState initializer so there is no setState-in-effect and no
// hydration mismatch (the interactive UI is gated behind `mounted`).
type SavedBudget = {
  income: BudgetItem[];
  expenses: BudgetItem[];
  tspPct?: number;
  tspBaseId?: string;
  fundAlloc?: FundAllocation;
  bucketOverrides?: BucketOverrides;
  goals?: SavingsGoal[];
  showCoach?: boolean;
  showTspPanel?: boolean;
  iraEnabled?: boolean;
  iraMonthly?: number;
  iraType?: IraType;
};

function loadSaved(): SavedBudget | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const income = Array.isArray(parsed?.income) ? parsed.income : null;
    const expenses = Array.isArray(parsed?.expenses) ? parsed.expenses : null;
    if (!income || !expenses) return null;
    return {
      income,
      expenses,
      tspPct: typeof parsed.tspPct === "number" ? parsed.tspPct : undefined,
      tspBaseId: typeof parsed.tspBaseId === "string" ? parsed.tspBaseId : undefined,
      fundAlloc:
        parsed.fundAlloc && typeof parsed.fundAlloc === "object" ? parsed.fundAlloc : undefined,
      bucketOverrides:
        parsed.bucketOverrides && typeof parsed.bucketOverrides === "object"
          ? parsed.bucketOverrides
          : undefined,
      goals: Array.isArray(parsed.goals) ? parsed.goals.filter(isSavingsGoal) : undefined,
      showCoach: typeof parsed.showCoach === "boolean" ? parsed.showCoach : undefined,
      showTspPanel: typeof parsed.showTspPanel === "boolean" ? parsed.showTspPanel : undefined,
      iraEnabled: typeof parsed.iraEnabled === "boolean" ? parsed.iraEnabled : undefined,
      iraMonthly: typeof parsed.iraMonthly === "number" ? parsed.iraMonthly : undefined,
      iraType: parsed.iraType === "roth" || parsed.iraType === "traditional" ? parsed.iraType : undefined,
    };
  } catch {
    return null;
  }
}

function describeImport(t: PayTransfer, mode: TransferMode) {
  return `Imported your ${t.meta.grade} pay ${
    mode === "combined" ? "as one combined income line" : "broken out by source"
  }. Taxes, FICA${t.deductions.tsp > 0 ? ", TSP" : ""}${
    t.deductions.sgli > 0 ? ", and SGLI" : ""
  } were added as expenses. Edit any row below.`;
}

export default function BudgetClient() {
  // A pending Pay Calculator hand-off takes priority over any saved budget, so
  // arriving from "Send to Budget" pre-fills the numbers immediately.
  const [income, setIncome] = useState<BudgetItem[]>(() => {
    const t = loadTransfer();
    if (t) return buildBudgetFromTransfer(t, "bysource").income;
    return loadSaved()?.income ?? DEFAULT_INCOME;
  });
  const [expenses, setExpenses] = useState<BudgetItem[]>(() => {
    const t = loadTransfer();
    if (t) return buildBudgetFromTransfer(t, "bysource").expenses;
    return loadSaved()?.expenses ?? DEFAULT_EXPENSES;
  });
  const [captureInto, setCaptureInto] = useState<string>("");
  const [savedNote, setSavedNote] = useState<string | null>(null);

  // 50/30/20 coach: user corrections to the automatic needs/wants/savings
  // classification, keyed by expense row id.
  const [bucketOverrides, setBucketOverrides] = useState<BucketOverrides>(
    () => loadSaved()?.bucketOverrides ?? {}
  );
  const [coachNote, setCoachNote] = useState<string | null>(null);

  // Emergency-fund & savings goals.
  const [goals, setGoals] = useState<SavingsGoal[]>(() => loadSaved()?.goals ?? []);

  // TSP (retirement). When importing, deductions (incl. TSP) come in as their
  // own expense rows, so the percentage-based section starts at 0.
  const [tspPct, setTspPct] = useState<number>(() =>
    loadTransfer() ? 0 : loadSaved()?.tspPct ?? 0.05
  );
  const [tspBaseId, setTspBaseId] = useState<string>(() => loadSaved()?.tspBaseId ?? "inc-1");
  const [fundAlloc, setFundAlloc] = useState<FundAllocation>(
    () => loadSaved()?.fundAlloc ?? DEFAULT_FUND_ALLOCATION
  );
  const [showFunds, setShowFunds] = useState(false);

  // Panel toggles. The 50/30/20 coach can be switched off like TSP. The TSP
  // panel defaults to collapsed when the pay import already configured TSP —
  // that avoids prompting for something the member set on the Pay page.
  const [showCoach, setShowCoach] = useState<boolean>(() => loadSaved()?.showCoach ?? true);
  const [showTspPanel, setShowTspPanel] = useState<boolean>(() => {
    const t = loadTransfer();
    if (t) return t.deductions.tsp > 0 ? false : true;
    return loadSaved()?.showTspPanel ?? true;
  });
  // TSP settings carried in from the Pay Calculator (for the collapsed note).
  const [importedTsp] = useState(() => {
    const t = loadTransfer();
    return t && t.deductions.tsp > 0
      ? { pct: t.deductions.tspPct, type: t.deductions.tspType, monthly: t.deductions.tsp }
      : null;
  });

  // Civilian IRA (optional): a fixed monthly contribution that flows through
  // the chart like TSP and counts toward the savings bucket. Kept simple —
  // fees/returns are modeled in the Wealth Projector, which prefills from this.
  const [iraEnabled, setIraEnabled] = useState<boolean>(() => loadSaved()?.iraEnabled ?? false);
  const [iraMonthly, setIraMonthly] = useState<number>(() => loadSaved()?.iraMonthly ?? 0);
  const [iraType, setIraType] = useState<IraType>(() => loadSaved()?.iraType ?? "roth");
  const [showIraContext, setShowIraContext] = useState(false);

  // How expense outflows are ordered in the chart: as entered, largest-first, or
  // smallest-first. Editor list order is untouched.
  const [expenseOrder, setExpenseOrder] = useState<"custom" | "desc" | "asc">("custom");

  // Pay Calculator hand-off. Read once on the client; the banner only renders
  // behind `mounted`, so there is no hydration mismatch.
  const [transfer] = useState(() => loadTransfer());
  const [transferDismissed, setTransferDismissed] = useState(false);
  // Stacked pushes the chart below the editor at full width (editor cards
  // reflow into columns); side-by-side is the classic 360px editor rail.
  const [stackedLayout, setStackedLayout] = useState(false);
  const [importMode, setImportMode] = useState<TransferMode>("bysource");
  const [importedNote, setImportedNote] = useState<string | null>(() => {
    const t = loadTransfer();
    return t ? describeImport(t, "bysource") : null;
  });

  // Export controls. Everything is generated in-browser; sections from the
  // other tools are rebuilt from data already saved on this device.
  const [reportFormat, setReportFormat] = useState<ReportFormat>("csv");
  const [selectedSections, setSelectedSections] = useState<string[]>(["budget"]);
  const [reporting, setReporting] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  // Render the interactive UI only on the client so theme colors and any
  // device-saved budget match between hydration and the live DOM.
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);

  const colors = useThemeColors();
  const svgRef = useRef<SVGSVGElement>(null);
  const idCounter = useRef(1000);

  // Consume the stored hand-off once on mount so a later refresh keeps the
  // user's edits instead of re-importing over them. The in-memory `transfer`
  // stays available for re-import and the combined export.
  useEffect(() => {
    if (transfer) clearTransfer();
    // Intentionally run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-save to this device on every change (after mount), so nothing is lost
  // on refresh — no manual "save" step needed. Stays entirely in the browser.
  useEffect(() => {
    if (!mounted) return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          income,
          expenses,
          tspPct,
          tspBaseId,
          fundAlloc,
          bucketOverrides,
          goals,
          showCoach,
          showTspPanel,
          iraEnabled,
          iraMonthly,
          iraType,
        })
      );
    } catch {
      // storage blocked; ignore
    }
  }, [
    mounted,
    income,
    expenses,
    tspPct,
    tspBaseId,
    fundAlloc,
    bucketOverrides,
    goals,
    showCoach,
    showTspPanel,
    iraEnabled,
    iraMonthly,
    iraType,
  ]);

  // Resolve the catch-all category against the rows that actually exist.
  const captureExists = expenses.some((e) => e.id === captureInto);
  const captureId = captureExists ? captureInto : null;

  // TSP contribution: a % of a chosen income (most people know the %, not the $).
  // Switching the panel off zeroes the percentage-based flow (imported TSP
  // expense rows are separate and unaffected).
  const tspBase = income.find((i) => i.id === tspBaseId) ?? income[0];
  const tspMonthly = showTspPanel ? Math.max(0, tspBase?.amount ?? 0) * tspPct : 0;
  const tspAnnual = tspMonthly * 12;
  const tspPctToMax =
    TSP_ELECTIVE_DEFERRAL_LIMIT_2026 > 0 ? tspAnnual / TSP_ELECTIVE_DEFERRAL_LIMIT_2026 : 0;
  const fundTotal = TSP_FUNDS.reduce((a, f) => a + (fundAlloc[f.key] || 0), 0);

  // Where this election lands across the year. Reaching the limit early does not
  // put more in — payroll stops the contributions, and the BRS match is worked
  // out on what actually goes in each month, so the stopped months earn none.
  // (The Max button targets the percent whose last dollar lands in December, so
  // it never trips this.) The budget tool knows no years of service or age, so
  // the copy hedges those gates rather than suppressing the warning.
  const tspPacing = useMemo(
    () => computeTspPacing(Math.max(0, tspBase?.amount ?? 0), tspPct),
    [tspBase?.amount, tspPct]
  );
  const showTspPacingWarning = showTspPanel && tspPacing.frontLoading;
  const tspStoppedPhrase =
    tspPacing.monthsStopped === 1
      ? "the last month of the year"
      : `the last ${tspPacing.monthsStopped} months of the year`;
  const tspStopMonth =
    tspPacing.limitReachedInMonth === null
      ? ""
      : TSP_MONTH_NAMES[tspPacing.limitReachedInMonth - 1];

  // Civilian IRA contribution (fixed monthly $).
  const iraMonthlyEff = iraEnabled ? Math.max(0, iraMonthly) : 0;
  const iraAnnual = iraMonthlyEff * 12;
  const iraPctToMax =
    IRA_CONTRIBUTION_LIMIT_2026 > 0 ? iraAnnual / IRA_CONTRIBUTION_LIMIT_2026 : 0;

  const visibleExpenseTotal = expenses.reduce((a, e) => a + (e.amount > 0 ? e.amount : 0), 0);

  // TSP and IRA flow through the Sankey as their own outflows when contributing.
  const expensesForGraph = useMemo<BudgetItem[]>(() => {
    const extra: BudgetItem[] = [];
    if (tspMonthly > 0) {
      extra.push({ id: "__tsp__", label: `TSP (${Math.round(tspPct * 100)}%)`, amount: tspMonthly });
    }
    if (iraMonthlyEff > 0) {
      extra.push({
        id: "__ira__",
        label: `IRA (${iraType === "roth" ? "Roth" : "Traditional"})`,
        amount: iraMonthlyEff,
      });
    }
    return extra.length > 0 ? [...expenses, ...extra] : expenses;
  }, [expenses, tspMonthly, tspPct, iraMonthlyEff, iraType]);

  // Chart-only ordering of the expense outflows (doesn't touch the editor list).
  const orderedExpensesForGraph = useMemo<BudgetItem[]>(() => {
    if (expenseOrder === "custom") return expensesForGraph;
    const arr = [...expensesForGraph];
    arr.sort((a, b) => (expenseOrder === "desc" ? b.amount - a.amount : a.amount - b.amount));
    return arr;
  }, [expensesForGraph, expenseOrder]);

  const graph = useMemo(
    () =>
      buildBudgetGraph(income, orderedExpensesForGraph, {
        poolColor: colors.muted,
        poolLabel: "Total Income",
        absorbRemainderInto: captureId,
      }),
    [income, orderedExpensesForGraph, colors.muted, captureId]
  );

  const leftover = graph.leftover;
  const captured = captureId !== null && leftover > 0;
  const capturedLabel = expenses.find((e) => e.id === captureId)?.label;

  // ---- 50/30/20 coach ----
  // TSP + IRA both count toward the savings bucket (real saving, just not
  // expense rows).
  const retirementMonthly = tspMonthly + iraMonthlyEff;
  const coach = useMemo(
    () => computeCoach(graph.totalIncome, expenses, retirementMonthly, bucketOverrides),
    [graph.totalIncome, expenses, retirementMonthly, bucketOverrides]
  );

  // ---- Savings goals ----
  // Funding pace: cash savings rows + any unallocated leftover. TSP is real
  // saving but it's locked for retirement, so it doesn't fund near-term goals.
  const cashSavingsMonthly = coach.rows
    .filter((r) => r.bucket === "savings")
    .reduce((a, r) => a + r.amount, 0);
  const goalContributionMonthly = cashSavingsMonthly + Math.max(0, leftover);
  const nonTaxSpendMonthly = coach.rows
    .filter((r) => r.bucket !== "offtop")
    .reduce((a, r) => a + r.amount, 0);
  const emergencyTarget = emergencyFundTarget(coach.buckets.needs.total, nonTaxSpendMonthly);

  function update(setter: typeof setIncome, id: string, patch: Partial<BudgetItem>) {
    setter((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }
  function add(setter: typeof setIncome, label: string) {
    idCounter.current += 1;
    setter((prev) => [...prev, { id: `row-${idCounter.current}`, label, amount: 0 }]);
  }
  function remove(setter: typeof setIncome, id: string) {
    setter((prev) => prev.filter((it) => it.id !== id));
  }

  function clearLocal() {
    setIncome(DEFAULT_INCOME);
    setExpenses(DEFAULT_EXPENSES);
    setCaptureInto("");
    setTspPct(0.05);
    setTspBaseId("inc-1");
    setFundAlloc(DEFAULT_FUND_ALLOCATION);
    setBucketOverrides({});
    setGoals([]);
    setShowCoach(true);
    setShowTspPanel(true);
    setIraEnabled(false);
    setIraMonthly(0);
    setIraType("roth");
    setCoachNote(null);
    setImportedNote(null);
    setTransferDismissed(true);
    setSavedNote("Reset to the example budget.");
  }

  // ---- 50/30/20 coach actions ----
  const BUCKET_CYCLE: Bucket[] = ["needs", "wants", "savings", "offtop"];
  function cycleBucket(rowId: string, current: Bucket) {
    const next = BUCKET_CYCLE[(BUCKET_CYCLE.indexOf(current) + 1) % BUCKET_CYCLE.length];
    setBucketOverrides((prev) => ({ ...prev, [rowId]: next }));
  }

  function handleAutoBalance() {
    const result = autoBalance(graph.totalIncome, expenses, retirementMonthly, bucketOverrides, () => {
      idCounter.current += 1;
      return `row-${idCounter.current}`;
    });
    if (!result) {
      setCoachNote("Add income above your tax rows first — there's nothing to balance yet.");
      return;
    }
    setExpenses(result.expenses);
    setCaptureInto("");
    setCoachNote(
      result.createdLabels.length > 0
        ? `Balanced to 50/30/20 and added ${result.createdLabels.join(" and ")} for you. Every row stays editable.`
        : "Balanced your categories to the 50/30/20 guideline. Every row stays editable."
    );
  }

  // ---- Savings goal actions ----
  function addGoal(label: string, target: number) {
    idCounter.current += 1;
    setGoals((prev) => [...prev, { id: `goal-${idCounter.current}`, label, target, saved: 0 }]);
  }
  function updateGoal(id: string, patch: Partial<SavingsGoal>) {
    setGoals((prev) => prev.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  }
  function removeGoal(id: string) {
    setGoals((prev) => prev.filter((g) => g.id !== id));
  }

  function exportPng() {
    if (svgRef.current) downloadPng(svgRef.current, "activepayos_budget_sankey.png", 2, colors.card);
  }
  function exportSvg() {
    if (svgRef.current) downloadSvg(svgRef.current, "activepayos_budget_sankey.svg");
  }

  // ---- Pay Calculator hand-off ----
  function applyTransfer(mode: TransferMode) {
    if (!transfer) return;
    const { income: inc, expenses: exp } = buildBudgetFromTransfer(transfer, mode);
    setIncome(inc);
    setExpenses(exp);
    // Deductions (incl. TSP) are imported as their own expense rows, so switch
    // off the percentage-based TSP section to avoid double-counting — and keep
    // the panel collapsed so it doesn't read as a second TSP prompt.
    setTspPct(0);
    if (transfer.deductions.tsp > 0) setShowTspPanel(false);
    setCaptureInto("");
    setImportMode(mode);
    setImportedNote(describeImport(transfer, mode));
  }
  function dismissTransfer() {
    clearTransfer();
    setTransferDismissed(true);
  }

  // Push the current leftover (income - expenses) into a real expense row so the
  // budget is fully allocated. Targets the chosen "capture" category, else an
  // existing "Savings" row, else a new Savings row.
  function allocateLeftover() {
    if (leftover <= 0) return;
    const amount = Math.round(leftover);
    const targetId =
      captureId ??
      expenses.find((e) => /saving/i.test(e.label))?.id ??
      null;
    if (targetId) {
      setExpenses((prev) =>
        prev.map((e) => (e.id === targetId ? { ...e, amount: Math.round(e.amount) + amount } : e))
      );
    } else {
      idCounter.current += 1;
      setExpenses((prev) => [
        ...prev,
        { id: `row-${idCounter.current}`, label: "Savings", amount },
      ]);
    }
    setCaptureInto("");
  }

  // Sweep the unallocated leftover into the civilian IRA contribution.
  function sweepLeftoverToIra() {
    if (leftover <= 0) return;
    setIraEnabled(true);
    setIraMonthly((prev) => Math.round(Math.max(0, prev) + leftover));
  }

  // Set the TSP % that lands on the annual elective-deferral limit, so the user
  // doesn't have to guess. Based on the currently selected TSP base income.
  function maxTsp() {
    const annualBase = Math.max(0, tspBase?.amount ?? 0) * 12;
    if (annualBase <= 0) return;
    setTspPct(Math.min(1, TSP_ELECTIVE_DEFERRAL_LIMIT_2026 / annualBase));
  }

  // ---- Budget / combined report export (client-side) ----
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

  // Which tools have data to include in the report. The budget is always live
  // on this page; pay comes from the in-memory import (or from storage via the
  // shared bundle helper); the projection comes from the Wealth Projector's
  // saved snapshot. Hints carry the same staleness copy as the import banner.
  const reportSections = useMemo(() => {
    const stored: { id: string; available: boolean; hint?: string }[] = mounted
      ? availabilityForSections()
      : [];
    const storedPay = stored.find((s) => s.id === "pay");
    const storedProjection = stored.find((s) => s.id === "projection");
    const payAvailable = !!transfer || !!storedPay?.available;
    return [
      {
        id: "pay" as const,
        label: "Pay Calculator",
        available: payAvailable,
        hint: transfer
          ? `Rebuilt from the ${transfer.meta.grade} pay you imported (${transfer.generatedOn}).`
          : storedPay?.hint ??
            "No imported pay on this device — use “Send to Budget” on the Pay Calculator first.",
      },
      {
        id: "budget" as const,
        label: "Budget",
        available: true,
        hint: "The live budget on this page.",
      },
      {
        id: "projection" as const,
        label: "Wealth Projector",
        available: !!storedProjection?.available,
        hint:
          storedProjection?.hint ??
          "No saved projection on this device — open the Wealth Projector once first.",
      },
    ];
  }, [mounted, transfer]);

  const selectedAvailableCount = reportSections.filter(
    (s) => s.available && selectedSections.includes(s.id)
  ).length;

  // The budget rows exactly as this page shows them (chart ordering included).
  function buildLiveBudgetExport(generatedOn: string): BudgetExport {
    return {
      generatedOn,
      income: income
        .filter((i) => i.amount > 0)
        .map((i) => ({ label: i.label || "Income", monthly: i.amount })),
      expenses: orderedExpensesForGraph
        .filter((e) => e.amount > 0)
        .map((e) => ({ label: e.label || "Expense", monthly: e.amount })),
      totalIncome: graph.totalIncome,
      totalExpense: graph.totalExpense,
      leftover: graph.leftover,
    };
  }

  async function sankeyChartPng(): Promise<Uint8Array | undefined> {
    if (!svgRef.current) return undefined;
    try {
      return await svgToPngBytes(svgRef.current, 2, "#ffffff");
    } catch {
      return undefined; // fall back to a chartless PDF
    }
  }

  // One format's file(s) for the included sections. A single tool keeps the
  // exact files (and names) it exports on its own page — the Pay sheets are
  // rebuilt so the member doesn't have to go back to regenerate them — while
  // multiple tools become one combined document via the bundle serializers.
  async function buildReportFiles(
    bundle: BundleData,
    included: SectionId[],
    fmt: Exclude<ReportFormat, "all">,
    generatedOn: string,
    staleness: Partial<Record<SectionId, string>> = {}
  ): Promise<ReportFile[]> {
    if (included.length === 1) {
      if (included[0] === "budget" && bundle.budget) {
        const stem = "activepayos_Budget";
        if (fmt === "csv") return [{ name: `${stem}.csv`, data: generateBudgetCsv(bundle.budget) }];
        if (fmt === "txt") return [{ name: `${stem}.txt`, data: generateBudgetTxt(bundle.budget) }];
        const bytes = await generateBudgetPdf(bundle.budget, await sankeyChartPng());
        return [{ name: `${stem}.pdf`, data: new Uint8Array(bytes) }];
      }
      if (included[0] === "pay" && bundle.pay) {
        const stem = "activepayos_Pay_Breakdown";
        if (fmt === "csv") return [{ name: `${stem}.csv`, data: generatePayCsv(bundle.pay) }];
        if (fmt === "txt") return [{ name: `${stem}.txt`, data: generatePayTxt(bundle.pay) }];
        const bytes = await generatePayPdf(bundle.pay, "modern");
        return [{ name: `${stem}.pdf`, data: new Uint8Array(bytes) }];
      }
      if (included[0] === "projection" && bundle.projection) {
        const p = bundle.projection;
        const stem = `activepayos_WealthProjection_${p.scenario.grade}_${p.scenario.endYear}`;
        if (fmt === "csv") return [{ name: `${stem}.csv`, data: generateProjectionCsv(p) }];
        if (fmt === "txt") return [{ name: `${stem}.txt`, data: generateProjectionTxt(p) }];
        const bytes = await generateProjectionPdf(p);
        return [{ name: `${stem}.pdf`, data: new Uint8Array(bytes) }];
      }
    }

    const stem = `activepayos_report_${generatedOn}`;
    if (fmt === "csv") return [{ name: `${stem}.csv`, data: generateBundleCsv(bundle, staleness) }];
    if (fmt === "txt") return [{ name: `${stem}.txt`, data: generateBundleTxt(bundle, staleness) }];
    const bytes = await generateBundlePdf(
      bundle,
      bundle.budget ? { budget: await sankeyChartPng() } : undefined,
      staleness
    );
    return [{ name: `${stem}.pdf`, data: new Uint8Array(bytes) }];
  }

  async function downloadReport() {
    setReporting(true);
    setReportError(null);
    try {
      const generatedOn = new Date().toISOString().slice(0, 10);
      const availableIds = new Set(
        reportSections.filter((s) => s.available).map((s) => s.id as string)
      );
      const chosen = SECTION_ORDER.filter(
        (id) => selectedSections.includes(id) && availableIds.has(id)
      );
      if (chosen.length === 0) {
        setReportError("Choose at least one section to include in the report.");
        return;
      }

      // Live values win; anything not on this page is rebuilt from the data
      // the other tools saved on this device.
      const live: Partial<BundleData> = {};
      if (chosen.includes("budget")) live.budget = buildLiveBudgetExport(generatedOn);
      if (chosen.includes("pay") && transfer) {
        live.pay = paySummaryFromTransfer(transfer, generatedOn);
      }
      const { data, staleness } = buildBundleData(live);
      const bundle: BundleData = {
        pay: chosen.includes("pay") ? data.pay : undefined,
        budget: chosen.includes("budget") ? data.budget : undefined,
        projection: chosen.includes("projection") ? data.projection : undefined,
      };
      const included = SECTION_ORDER.filter((id) => !!bundle[id]);
      if (included.length === 0) {
        setReportError(
          "Nothing to export yet — the selected tools have no data saved on this device."
        );
        return;
      }

      const formats: Exclude<ReportFormat, "all">[] =
        reportFormat === "all" ? ["csv", "txt", "pdf"] : [reportFormat];
      const files: ReportFile[] = [];
      for (const fmt of formats) {
        files.push(...(await buildReportFiles(bundle, included, fmt, generatedOn, staleness)));
      }

      if (reportFormat === "all" || files.length > 1) {
        const zip = await filesToZipBlob(files);
        triggerDownload(zip, "application/zip", `activepayos_report_${generatedOn}.zip`);
      } else {
        triggerDownload(files[0].data, FORMAT_MIME[reportFormat], files[0].name);
      }
    } catch (err) {
      setReportError(
        err instanceof Error && err.message
          ? `Export failed — ${err.message}`
          : "Export failed — please try again."
      );
    } finally {
      setReporting(false);
    }
  }

  const showTransferBanner = !!transfer && !transferDismissed;

  return (
    <main className="space-y-8">
      <PlanFlow current="budget" />
      <header className="rounded-3xl border bg-white p-6 md:p-8 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Budget Builder</h1>
            <p className="mt-2 max-w-2xl text-sm text-gray-600">
              Build a monthly budget and watch the money flow as a Sankey diagram. Edit any row and
              the chart updates instantly, then export it as an image.
            </p>
            <p className="mt-2 max-w-2xl text-xs text-gray-500">
              Planning estimate only — the numbers here are whatever you enter. Verify pay figures
              against your LES and myPay.
            </p>
            <HoverHint className="mt-1" />
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <span
              className="w-fit rounded-full border bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700"
              title="Your numbers stay in your browser. Nothing is sent to a server."
            >
              🔒 Private — runs entirely in your browser
            </span>
            <span
              className="hidden items-center rounded-full border p-1 text-xs lg:inline-flex"
              role="group"
              aria-label="Layout"
              title="Side-by-side keeps the editor next to the chart; stacked gives the chart the full width."
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
            <Link
              href="/toolkits/wealth-projector"
              className="w-fit rounded-full border border-black bg-black px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-gray-800"
              title="Open the Wealth Projector — your saved budget's TSP, IRA, and savings pace pre-fill the projection."
            >
              Project my wealth →
            </Link>
          </div>
        </div>
      </header>

      {!mounted ? (
        <div className="rounded-3xl border bg-white p-10 text-center text-sm text-gray-500 shadow-sm">
          Loading budget builder…
        </div>
      ) : (
        <>
          {showTransferBanner && transfer && (
            <div className="rounded-3xl border border-[var(--brand-blue)]/40 bg-[var(--brand-blue)]/5 p-5 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <h2 className="text-base font-semibold">
                    Imported from your Pay Calculator
                  </h2>
                  <p className="mt-1 max-w-2xl text-sm text-gray-600">
                    Your {transfer.meta.grade} pay ({transfer.meta.year}
                    {transfer.meta.receivesBah && transfer.meta.location !== "-"
                      ? ` · ${transfer.meta.location}`
                      : ""}
                    ) pre-filled this budget. Taxes, FICA
                    {transfer.deductions.tsp > 0 ? ", TSP" : ""}
                    {transfer.deductions.sgli > 0 ? ", and SGLI" : ""} were added as expenses, so
                    your leftover is real spendable money. Pick how income is shown — everything
                    stays editable.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={dismissTransfer}
                  className="shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-white"
                >
                  Dismiss
                </button>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <span
                  className="inline-flex items-center rounded-full border bg-white p-1 text-xs"
                  role="group"
                  aria-label="Income breakdown"
                >
                  <button
                    type="button"
                    onClick={() => applyTransfer("bysource")}
                    className={`rounded-full px-3 py-1 font-medium transition ${
                      importMode === "bysource"
                        ? "bg-[var(--field-bg)] text-[var(--field-text)]"
                        : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    Break out by source
                  </button>
                  <button
                    type="button"
                    onClick={() => applyTransfer("combined")}
                    className={`rounded-full px-3 py-1 font-medium transition ${
                      importMode === "combined"
                        ? "bg-[var(--field-bg)] text-[var(--field-text)]"
                        : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    Combine into one number
                  </button>
                </span>
                <span className="text-xs text-gray-500">
                  {importMode === "combined"
                    ? "One “Military pay (gross)” income row."
                    : "Base Pay, BAH, BAS, and special pays as separate rows."}
                </span>
              </div>
              {importedNote && (
                <p className="mt-3 rounded-xl border bg-white px-3 py-2 text-xs text-gray-600">
                  {importedNote}
                </p>
              )}
            </div>
          )}

          <div
            className={
              stackedLayout ? "space-y-6" : "grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]"
            }
          >
          {/* ------------------------------ Editor ------------------------------ */}
          <section
            className={
              stackedLayout
                ? "gap-6 md:columns-2 xl:columns-3 [&>*]:mb-6 [&>*]:break-inside-avoid"
                : "space-y-6"
            }
          >
            <div className="rounded-3xl border bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Income</h2>
                <span className="text-sm font-semibold">{fmtUSD0(graph.totalIncome)}</span>
              </div>
              <div className="mt-4 space-y-2">
                {income.map((it) => (
                  <Row
                    key={it.id}
                    item={it}
                    onLabel={(label) => update(setIncome, it.id, { label })}
                    onAmount={(amount) => update(setIncome, it.id, { amount })}
                    onRemove={() => remove(setIncome, it.id)}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={() => add(setIncome, "New income")}
                className="mt-3 w-full rounded-xl border border-dashed px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900"
              >
                + Add income
              </button>
            </div>

            <div className="rounded-3xl border bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Expenses &amp; savings</h2>
                <span className="text-sm font-semibold">{fmtUSD0(visibleExpenseTotal)}</span>
              </div>
              <div className="mt-4 space-y-2">
                {expenses.map((it) => (
                  <Row
                    key={it.id}
                    item={it}
                    onLabel={(label) => update(setExpenses, it.id, { label })}
                    onAmount={(amount) => update(setExpenses, it.id, { amount })}
                    onRemove={() => remove(setExpenses, it.id)}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={() => add(setExpenses, "New expense")}
                className="mt-3 w-full rounded-xl border border-dashed px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900"
              >
                + Add expense
              </button>
            </div>

            {/* --------------------------- 50/30/20 coach --------------------------- */}
            <div className="rounded-3xl border bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-semibold">
                  50/30/20 coach{" "}
                  <InfoDot text="A starter guideline: 50% of after-tax income to needs, 30% to wants, 20% to savings & debt payoff. Tap a category chip below if we sorted it into the wrong bucket. Toggle the coach off if you'd rather budget without it." />
                </h2>
                <div className="flex items-center gap-2">
                  {showCoach && coach.afterTaxMonthly > 0 && (
                    <span
                      className="cursor-help text-xs text-gray-500"
                      title="Your total income minus the tax/FICA rows — the denominator the 50/30/20 percentages are measured against."
                    >
                      after-tax {fmtUSD0(coach.afterTaxMonthly)}/mo
                    </span>
                  )}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={showCoach}
                    onClick={() => setShowCoach((v) => !v)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                      showCoach
                        ? "border-emerald-600/60 bg-emerald-50 text-emerald-700"
                        : "text-gray-500 hover:text-gray-900"
                    }`}
                    title="Turn the 50/30/20 coach on or off"
                  >
                    {showCoach ? "On" : "Off"}
                  </button>
                </div>
              </div>

              {!showCoach ? (
                <p className="mt-4 rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-600">
                  Coach is off — your budget is unchanged. Toggle it on to measure your categories
                  against the 50/30/20 guideline.
                </p>
              ) : coach.afterTaxMonthly <= 0 ? (
                <p className="mt-4 rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-600">
                  Add your income above and the coach will measure your budget against the
                  50/30/20 guideline.
                </p>
              ) : (
                <>
                  <div className="mt-4 space-y-3">
                    {(["needs", "wants", "savings"] as const).map((key) => {
                      const b = coach.buckets[key];
                      const diff = b.pct - BUCKET_TARGETS[key];
                      const over = diff > 0.02;
                      const under = diff < -0.02;
                      const offGuideline = key === "savings" ? under : over;
                      const barColor =
                        key === "needs" ? "#3b82f6" : key === "wants" ? "#f59e0b" : "#22c55e";
                      return (
                        <div key={key}>
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium">
                              {BUCKET_LABELS[key]}{" "}
                              <span className="text-gray-400">
                                · target {Math.round(BUCKET_TARGETS[key] * 100)}%
                              </span>
                            </span>
                            <span
                              className="font-medium"
                              style={{ color: offGuideline ? "#b45309" : "#15803d" }}
                            >
                              {Math.round(b.pct * 100)}% · {fmtUSD0(b.total)}
                            </span>
                          </div>
                          <div className="relative mt-1 h-2 w-full overflow-hidden rounded-full bg-gray-200">
                            <div
                              className="h-2 rounded-full"
                              style={{
                                width: `${Math.min(100, b.pct * 100)}%`,
                                backgroundColor: barColor,
                              }}
                            />
                            {/* Target tick */}
                            <div
                              className="absolute top-0 h-2 w-0.5 bg-gray-500/70"
                              style={{ left: `${BUCKET_TARGETS[key] * 100}%` }}
                            />
                          </div>
                          <div className="mt-0.5 text-[11px] text-gray-500">
                            {key === "savings"
                              ? under
                                ? `${fmtUSD0(Math.abs(b.deltaMonthly))}/mo short of the 20% guideline.`
                                : "On or above the guideline — keep it automatic."
                              : over
                              ? `${fmtUSD0(b.deltaMonthly)}/mo over the guideline.`
                              : "Within the guideline."}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Row chips: tap to re-bucket a category */}
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {coach.rows
                      .filter((r) => r.amount > 0)
                      .map((r) => {
                        const chipColor =
                          r.bucket === "needs"
                            ? "border-blue-300 bg-blue-50 text-blue-800"
                            : r.bucket === "wants"
                            ? "border-amber-300 bg-amber-50 text-amber-800"
                            : r.bucket === "savings"
                            ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                            : "border-gray-300 bg-gray-100 text-gray-500";
                        return (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => cycleBucket(r.id, r.bucket)}
                            className={`rounded-full border px-2 py-0.5 text-[11px] font-medium transition hover:opacity-80 ${chipColor}`}
                            title={`${BUCKET_LABELS[r.bucket]} — tap to change bucket`}
                          >
                            {r.label || "Expense"}
                            {r.bucket === "offtop" ? " (excluded)" : ""}
                          </button>
                        );
                      })}
                    {tspMonthly > 0 && (
                      <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                        TSP {fmtUSD0(tspMonthly)}/mo (savings)
                      </span>
                    )}
                    {iraMonthlyEff > 0 && (
                      <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                        IRA {fmtUSD0(iraMonthlyEff)}/mo (savings)
                      </span>
                    )}
                  </div>
                  {coach.offTopTotal > 0 && (
                    <p className="mt-2 text-[11px] text-gray-400">
                      Taxes &amp; FICA ({fmtUSD0(coach.offTopTotal)}/mo) come off the top and are
                      excluded from the 50/30/20 split.
                    </p>
                  )}

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleAutoBalance}
                      className="rounded-full border border-black bg-black px-4 py-2 text-xs font-medium text-white hover:bg-gray-800"
                      title="Rewrite category amounts to match 50/30/20 of your after-tax income."
                    >
                      Auto-balance to 50/30/20
                    </button>
                    <span className="text-[11px] text-gray-500">
                      Rewrites amounts in place — you can edit or reset anything after.
                    </span>
                  </div>
                  {coachNote && (
                    <p className="mt-2 rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-600">
                      {coachNote}
                    </p>
                  )}
                </>
              )}
            </div>

            {/* ------------------------------ TSP ------------------------------ */}
            <div className="rounded-3xl border bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-semibold">
                  TSP (retirement){" "}
                  <InfoDot
                    text={`${TSP_LIMIT_SENTENCE}\n\nContributions are a percent of base pay only — not BAH or BAS. Enter the percent and we do the math; it flows through the chart as its own outflow.\n\n${TSP_AGENCY_MONEY_NOTE}\n\nIf your pay import already includes TSP as an expense row, leave this off to avoid double-counting.`}
                  />
                </h2>
                <div className="flex items-center gap-2">
                  {showTspPanel && <span className="text-sm font-semibold">{fmtUSD0(tspMonthly)}/mo</span>}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={showTspPanel}
                    onClick={() => setShowTspPanel((v) => !v)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                      showTspPanel
                        ? "border-emerald-600/60 bg-emerald-50 text-emerald-700"
                        : "text-gray-500 hover:text-gray-900"
                    }`}
                    title="Turn the percentage-based TSP section on or off"
                  >
                    {showTspPanel ? "On" : "Off"}
                  </button>
                </div>
              </div>

              {!showTspPanel && (
                <p className="mt-4 rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-600">
                  {importedTsp
                    ? `Already configured on the Pay Calculator (${Math.round(
                        importedTsp.pct * 100
                      )}% ${importedTsp.type}, ${fmtUSD0(
                        importedTsp.monthly
                      )}/mo) and imported as an expense row — no need to set it twice. Toggle on only to model a different percentage here.`
                    : "TSP is off. Toggle on to model a percentage-of-base-pay contribution."}
                </p>
              )}

              {showTspPanel && (
              <>
              <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
                <span className="text-gray-600">Contribute</span>
                <div className="field flex items-center rounded-lg px-2 py-1">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={Math.round(tspPct * 100)}
                    onChange={(e) =>
                      setTspPct(Math.max(0, Math.min(100, Number(e.target.value) || 0)) / 100)
                    }
                    className="w-12 bg-transparent text-right outline-none"
                    aria-label="TSP percent"
                  />
                  <span className="text-gray-500">%</span>
                </div>
                <span className="text-gray-600">of base pay</span>
                <select
                  value={tspBase?.id ?? ""}
                  onChange={(e) => setTspBaseId(e.target.value)}
                  className="field rounded-lg px-2 py-1"
                  aria-label="Which income row is your base pay"
                  title="TSP is a percent of base pay only — pick your base pay row."
                >
                  {income.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.label || "Income"}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={maxTsp}
                  className="rounded-lg border px-2 py-1 text-xs font-medium hover:bg-gray-100"
                  title={`Set the percentage that reaches the ${fmtUSD0(
                    TSP_ELECTIVE_DEFERRAL_LIMIT_2026
                  )} 2026 annual limit. ${TSP_MAX_EARLY_WARNING}`}
                >
                  Max
                </button>
              </div>
              <div className="mt-1 text-xs text-gray-500">
                ≈ {fmtUSD0(tspMonthly)}/mo · {fmtUSD0(tspAnnual)}/yr
              </div>

              {/* Annual limit progress */}
              <div className="mt-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-600">2026 annual limit</span>
                  <span className="text-gray-500">
                    {fmtUSD0(tspAnnual)} / {fmtUSD0(TSP_ELECTIVE_DEFERRAL_LIMIT_2026)}
                  </span>
                </div>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-gray-200">
                  <div
                    className="h-2 rounded-full"
                    style={{
                      width: `${Math.min(100, tspPctToMax * 100)}%`,
                      backgroundColor:
                        tspPctToMax > 1 ? "#ef4444" : tspPctToMax >= 0.95 ? "#f59e0b" : "#22c55e",
                    }}
                  />
                </div>
                <div
                  className="mt-1 text-xs font-medium"
                  style={{
                    color: tspPctToMax > 1 ? "#ef4444" : tspPctToMax >= 0.95 ? "#b45309" : "#15803d",
                  }}
                >
                  {tspAnnual <= 0
                    ? "Set a percentage to start contributing."
                    : tspPctToMax > 1
                    ? // The pacing warning below spells out the stop and its cost,
                      // so this line stays to the overage when that one is showing.
                      showTspPacingWarning
                      ? `Over the annual limit by ${fmtUSD0(
                          tspAnnual - TSP_ELECTIVE_DEFERRAL_LIMIT_2026
                        )}.`
                      : `Over the annual limit by ${fmtUSD0(
                          tspAnnual - TSP_ELECTIVE_DEFERRAL_LIMIT_2026
                        )} — payroll stops contributions once you hit the cap.`
                    : tspPctToMax >= 0.95
                    ? "You'll just about max out the annual limit — nice."
                    : `${fmtUSD0(TSP_ELECTIVE_DEFERRAL_LIMIT_2026 - tspAnnual)} (${Math.round(
                        (1 - tspPctToMax) * 100
                      )}%) left before you hit the limit.`}
                </div>
              </div>

              {showTspPacingWarning && (
                <div className="mt-3 space-y-1.5">
                  <p className="text-xs leading-5 text-amber-700">
                    You&rsquo;d forfeit about {fmtUSD0(Math.round(tspPacing.matchLostTotal))} of BRS
                    match this year. At {tspPctLabel(tspPct)} you reach the{" "}
                    {fmtUSD0(tspPacing.limit)} limit in{" "}
                    {tspStopMonth}, then contribute nothing for {tspStoppedPhrase} — and your service
                    only matches money that actually goes in that month. Contributing faster
                    doesn&rsquo;t get you more. It can get you less.
                  </p>
                  <p className="text-xs leading-5 text-amber-700">
                    The automatic 1% keeps arriving in those months. Only the match on your own money
                    — up to 4% — stops, and it is not added back later.
                  </p>
                  <div className="flex flex-wrap items-center gap-2 pt-0.5">
                    <button
                      type="button"
                      onClick={() => setTspPct(tspPacing.evenPct)}
                      className="rounded-lg border px-2 py-1 text-xs font-medium hover:bg-gray-100"
                      title={`Sets your contribution to ${tspPctLabel(tspPacing.evenPct)} — ${fmtUSD0(
                        Math.round(tspPacing.evenMonthly)
                      )}/mo, so your last dollar lands on your December paycheck and you keep the full match all year.`}
                    >
                      Spread it evenly — {tspPctLabel(tspPacing.evenPct)}
                    </button>
                    <span className="text-xs text-gray-500">
                      {fmtUSD0(Math.round(tspPacing.evenMonthly))}/mo — your last dollar lands in
                      December.
                    </span>
                  </div>
                  <p className="text-xs leading-5 text-amber-700">
                    Estimate: it assumes twelve equal months, flat base pay, that you are past 2 years
                    of service (when your service starts matching), and that you are under 50 — at 50
                    and over, contributions past the limit roll into catch-up instead of stopping.
                    Election changes take effect at the end of the current month, so act a month
                    before you would hit the limit. Part-way through the year already? The calculator
                    below uses what you have put in so far.
                  </p>
                </div>
              )}

              <TspResetCalculator
                className="mt-3"
                monthlyBasePay={Math.max(0, tspBase?.amount ?? 0)}
                currentPct={tspPct}
                onApply={(pct) => setTspPct(pct)}
              />

              <p className="mt-3 text-xs text-gray-500">
                Wondering what this grows into over your commitment?{" "}
                <a
                  href="/toolkits/wealth-projector"
                  className="font-medium underline underline-offset-2 hover:text-gray-900"
                >
                  Project it year by year →
                </a>
              </p>

              {/* Fund allocation (collapsible) */}
              <button
                type="button"
                onClick={() => setShowFunds((s) => !s)}
                className="mt-4 text-xs font-medium text-gray-600 underline underline-offset-2 hover:text-gray-900"
              >
                {showFunds ? "Hide" : "Show"} fund allocation
              </button>

              {showFunds && (
                <div className="mt-3 space-y-3">
                  <div className="flex h-3 w-full overflow-hidden rounded-full bg-gray-200">
                    {TSP_FUNDS.map((f) =>
                      (fundAlloc[f.key] || 0) > 0 ? (
                        <div
                          key={f.key}
                          style={{
                            width: `${fundTotal > 0 ? ((fundAlloc[f.key] || 0) / fundTotal) * 100 : 0}%`,
                            backgroundColor: f.color,
                          }}
                          title={`${f.name}: ${fundAlloc[f.key]}%`}
                        />
                      ) : null
                    )}
                  </div>
                  {fundTotal !== 100 && (
                    <p className="text-xs text-amber-600">
                      Allocations total {fundTotal}% — aim for 100%.
                    </p>
                  )}
                  <div className="space-y-2">
                    {TSP_FUNDS.map((f) => (
                      <div key={f.key} className="flex items-center gap-2 text-xs">
                        <span
                          className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: f.color }}
                        />
                        <span className="w-12 font-medium">{f.name}</span>
                        <div className="field flex items-center rounded-md px-1.5 py-0.5">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step={5}
                            value={fundAlloc[f.key] || 0}
                            onChange={(e) =>
                              setFundAlloc((prev) => ({
                                ...prev,
                                [f.key]: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                              }))
                            }
                            className="w-10 bg-transparent text-right outline-none"
                            aria-label={`${f.name} percent`}
                          />
                          <span className="text-gray-500">%</span>
                        </div>
                        <span className="text-gray-500">
                          {fmtUSD0((tspMonthly * (fundAlloc[f.key] || 0)) / 100)}/mo
                        </span>
                        <span className="hidden flex-1 text-gray-400 sm:block">{f.blurb}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500">
                    Prefer one-and-done? TSP Lifecycle (L) funds auto-diversify and rebalance toward a
                    target retirement date.
                  </p>
                </div>
              )}
              </>
              )}
            </div>

            {/* --------------------------- Civilian IRA --------------------------- */}
            <div className="rounded-3xl border bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-semibold">
                  Civilian IRA (optional){" "}
                  <InfoDot
                    text={`${IRA_LIMIT_SENTENCE}\n\nAn Individual Retirement Account you open yourself at a brokerage — separate from the TSP, with its own limit, so maxing one has no effect on the other.\n\nA common home for leftover money after expenses. Flows through the chart as its own outflow and counts toward the savings bucket.\n\n${ROTH_IRA_PHASEOUT_NOTE}`}
                  />
                </h2>
                <div className="flex items-center gap-2">
                  {iraEnabled && <span className="text-sm font-semibold">{fmtUSD0(iraMonthlyEff)}/mo</span>}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={iraEnabled}
                    onClick={() => setIraEnabled((v) => !v)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                      iraEnabled
                        ? "border-emerald-600/60 bg-emerald-50 text-emerald-700"
                        : "text-gray-500 hover:text-gray-900"
                    }`}
                    title="Turn the civilian IRA contribution on or off"
                  >
                    {iraEnabled ? "On" : "Off"}
                  </button>
                </div>
              </div>

              {!iraEnabled ? (
                <p className="mt-4 rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-600">
                  Toggle on to route part of your budget{leftover > 0 ? ` (like your ${fmtUSD0(leftover)} leftover)` : ""} into a
                  Roth or Traditional IRA at a brokerage of your choice.
                </p>
              ) : (
                <>
                  <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-gray-600">Contribute</span>
                    <div className="field flex items-center rounded-lg px-2 py-1">
                      <span className="text-gray-500">$</span>
                      <input
                        type="number"
                        min={0}
                        step={25}
                        value={iraMonthly === 0 ? "" : iraMonthly}
                        placeholder="0"
                        onChange={(e) => {
                          const v = e.target.value === "" ? 0 : Number(e.target.value);
                          setIraMonthly(Number.isFinite(v) ? Math.max(0, v) : 0);
                        }}
                        className="w-20 bg-transparent text-right outline-none"
                        aria-label="Monthly IRA contribution"
                      />
                    </div>
                    <span className="text-gray-600">/mo into a</span>
                    <select
                      value={iraType}
                      onChange={(e) => setIraType(e.target.value as IraType)}
                      className="field rounded-lg px-2 py-1"
                      aria-label="IRA type"
                    >
                      {(Object.keys(IRA_TYPE_LABELS) as IraType[]).map((t) => (
                        <option key={t} value={t}>
                          {IRA_TYPE_LABELS[t]}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setIraMonthly(IRA_CONTRIBUTION_LIMIT_2026 / 12)}
                      className="rounded-lg border px-2 py-1 text-xs font-medium hover:bg-gray-100"
                      title={`Set the monthly contribution that reaches the ${fmtUSD0(
                        IRA_CONTRIBUTION_LIMIT_2026
                      )} 2026 IRA annual limit (${fmtUSD0(IRA_CONTRIBUTION_LIMIT_2026 / 12)}/mo).`}
                    >
                      Max
                    </button>
                    {leftover > 0 && (
                      <button
                        type="button"
                        onClick={sweepLeftoverToIra}
                        className="rounded-lg border border-emerald-600/60 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
                        title="Add your unallocated leftover (income − expenses) to the monthly IRA contribution."
                      >
                        + Sweep {fmtUSD0(leftover)} leftover
                      </button>
                    )}
                  </div>

                  {/* Annual IRA limit progress */}
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-600">2026 IRA annual limit</span>
                      <span className="text-gray-500">
                        {fmtUSD0(iraAnnual)} / {fmtUSD0(IRA_CONTRIBUTION_LIMIT_2026)}
                      </span>
                    </div>
                    <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-gray-200">
                      <div
                        className="h-2 rounded-full"
                        style={{
                          width: `${Math.min(100, iraPctToMax * 100)}%`,
                          backgroundColor:
                            iraPctToMax > 1 ? "#ef4444" : iraPctToMax >= 0.95 ? "#f59e0b" : "#22c55e",
                        }}
                      />
                    </div>
                    {iraPctToMax > 1 && (
                      <p className="mt-1 text-xs text-red-600">
                        Over the annual IRA limit by {fmtUSD0(iraAnnual - IRA_CONTRIBUTION_LIMIT_2026)} —
                        contributions above the limit trigger an excise tax unless withdrawn.
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowIraContext((s) => !s)}
                    className="mt-4 text-xs font-medium text-gray-600 underline underline-offset-2 hover:text-gray-900"
                  >
                    {showIraContext ? "Hide" : "Show"} typical fees &amp; returns at large firms
                  </button>
                  {showIraContext && (
                    <div className="mt-3 space-y-2 text-xs text-gray-600">
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[420px] text-left">
                          <thead>
                            <tr className="border-b text-[11px] text-gray-500">
                              <th className="py-1 font-medium">Firm</th>
                              <th className="py-1 font-medium">Index-fund expense ratio</th>
                              <th className="py-1 font-medium">Account fee</th>
                              <th className="py-1 font-medium">Advisory / robo</th>
                            </tr>
                          </thead>
                          <tbody>
                            {IRA_PROVIDER_CONTEXT.map((pvd) => (
                              <tr key={pvd.name} className="border-b last:border-0 align-top">
                                <td className="py-1.5 font-medium">{pvd.name}</td>
                                <td className="py-1.5">{pvd.indexExpenseRatioPct}</td>
                                <td className="py-1.5">{pvd.accountFee}</td>
                                <td className="py-1.5">{pvd.advisoryNote}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p>
                        A broad stock index fund has averaged roughly 10%/yr over the long run
                        (before inflation) — but expected returns are assumptions, not promises, and
                        any given year can be far above or below.
                      </p>
                      <p className="font-medium text-gray-700">{IRA_FEE_DISCLAIMER}</p>
                    </div>
                  )}

                  <p className="mt-3 text-xs text-gray-500">
                    See what this grows into — fees, Roth vs Traditional, and all —{" "}
                    <a
                      href="/toolkits/wealth-projector"
                      className="font-medium underline underline-offset-2 hover:text-gray-900"
                    >
                      in the Wealth Projector →
                    </a>
                  </p>
                </>
              )}
            </div>

            {/* --------------------------- Savings goals --------------------------- */}
            <div className="rounded-3xl border bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                  Savings goals{" "}
                  <InfoDot text="Funded by your savings categories plus any unallocated leftover (TSP is retirement money, so it doesn't count here). An emergency fund of 3 months of essentials is the standard first goal." />
                </h2>
                <span
                  className="cursor-help text-sm font-semibold"
                  title="Your goal-funding pace: savings-bucket categories plus any unallocated leftover. TSP is excluded because retirement money can't fund near-term goals."
                >
                  {fmtUSD0(goalContributionMonthly)}/mo
                </span>
              </div>

              {goals.length > 0 && (
                <div className="mt-4 space-y-4">
                  {goals.map((g) => {
                    const p = goalProgress(g, goalContributionMonthly);
                    return (
                      <div key={g.id} className="rounded-2xl border p-3">
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={g.label}
                            onChange={(e) => updateGoal(g.id, { label: e.target.value })}
                            className="field min-w-0 flex-1 rounded-lg px-2.5 py-1.5 text-sm"
                            aria-label="Goal name"
                          />
                          <button
                            type="button"
                            onClick={() => removeGoal(g.id)}
                            className="rounded-lg border px-2 py-1.5 text-sm text-gray-500 hover:text-gray-900"
                            aria-label={`Remove goal ${g.label}`}
                            title="Remove goal"
                          >
                            ✕
                          </button>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                          <span className="text-gray-600">Target</span>
                          <div className="field flex items-center rounded-lg px-2 py-1">
                            <span className="text-gray-500">$</span>
                            <input
                              type="number"
                              min={0}
                              step={100}
                              value={g.target === 0 ? "" : g.target}
                              placeholder="0"
                              onChange={(e) => {
                                const v = e.target.value === "" ? 0 : Number(e.target.value);
                                updateGoal(g.id, {
                                  target: Number.isFinite(v) ? Math.max(0, v) : 0,
                                });
                              }}
                              className="w-20 bg-transparent text-right outline-none"
                              aria-label="Goal target amount"
                            />
                          </div>
                          <span className="text-gray-600">saved so far</span>
                          <div className="field flex items-center rounded-lg px-2 py-1">
                            <span className="text-gray-500">$</span>
                            <input
                              type="number"
                              min={0}
                              step={100}
                              value={g.saved === 0 ? "" : g.saved}
                              placeholder="0"
                              onChange={(e) => {
                                const v = e.target.value === "" ? 0 : Number(e.target.value);
                                updateGoal(g.id, {
                                  saved: Number.isFinite(v) ? Math.max(0, v) : 0,
                                });
                              }}
                              className="w-20 bg-transparent text-right outline-none"
                              aria-label="Amount already saved"
                            />
                          </div>
                        </div>
                        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-200">
                          <div
                            className="h-2 rounded-full bg-emerald-500"
                            style={{ width: `${p.fraction * 100}%` }}
                          />
                        </div>
                        <div className="mt-1 text-[11px] text-gray-500">
                          {g.target <= 0
                            ? "Set a target amount to project a finish date."
                            : p.done
                            ? "Funded — nice work. 🎉"
                            : p.monthsToGoal === null
                            ? `${fmtUSD0(p.remaining)} to go — add monthly savings to project a date.`
                            : `${fmtUSD0(p.remaining)} to go · about ${p.monthsToGoal} month${
                                p.monthsToGoal === 1 ? "" : "s"
                              } at this pace (${goalEtaLabel(p.monthsToGoal, new Date())}).`}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                {!goals.some((g) => /emergency/i.test(g.label)) && emergencyTarget > 0 && (
                  <button
                    type="button"
                    onClick={() => addGoal("Emergency fund (3 months)", emergencyTarget)}
                    className="rounded-xl border border-dashed px-3 py-2 text-xs font-medium text-gray-600 hover:text-gray-900"
                    title="3 months of your essential (needs) spending — the DoD Financial Readiness starter goal."
                  >
                    + Emergency fund ({fmtUSD0(emergencyTarget)})
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => addGoal("New goal", 0)}
                  className="rounded-xl border border-dashed px-3 py-2 text-xs font-medium text-gray-600 hover:text-gray-900"
                >
                  + Add goal
                </button>
              </div>
            </div>

            <div className="rounded-3xl border bg-gray-50 p-5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Income − expenses</span>
                <span className="font-bold" style={{ color: leftover < 0 ? "#ef4444" : "#22c55e" }}>
                  {leftover < 0
                    ? `Overspent ${fmtUSD0(Math.abs(leftover))}`
                    : captured
                    ? `Captured ${fmtUSD0(leftover)} into ${capturedLabel || "category"}`
                    : `${fmtUSD0(leftover)} unallocated`}
                </span>
              </div>

              {/* Capture-the-remainder control */}
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <label htmlFor="capture-into" className="text-gray-600">
                  Put leftover into
                </label>
                <select
                  id="capture-into"
                  value={captureInto}
                  onChange={(e) => setCaptureInto(e.target.value)}
                  className="field rounded-lg px-2 py-1 text-xs"
                >
                  <option value="">Show as “Unallocated”</option>
                  {expenses.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.label || "Expense"}
                    </option>
                  ))}
                </select>
                {leftover > 0 && (
                  <button
                    type="button"
                    onClick={allocateLeftover}
                    className="rounded-lg border border-emerald-600/60 px-2 py-1 font-medium text-emerald-700 hover:bg-emerald-50"
                    title="Add the leftover amount into the selected category (or Savings) as a real value."
                  >
                    Add {fmtUSD0(leftover)} to {capturedLabel || "Savings"}
                  </button>
                )}
              </div>

              <p className="mt-2 flex items-center gap-1.5 text-xs text-gray-500">
                Tip: keep housing within your BAH and make savings automatic.
                <InfoDot text="'Put leftover into' folds the remainder into a category on the chart; the button writes it in as a real amount so your budget is fully allocated." />
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="text-xs text-gray-500">✓ Saved automatically to this device</span>
                <button
                  type="button"
                  onClick={clearLocal}
                  className="rounded-full border px-3 py-1.5 text-xs font-medium hover:bg-gray-100"
                >
                  Clear &amp; reset
                </button>
              </div>
              {savedNote && <p className="mt-2 text-xs text-gray-500">{savedNote}</p>}
            </div>
          </section>

          {/* ------------------------------ Chart ------------------------------ */}
          <section className="rounded-3xl border bg-white p-5 shadow-sm md:p-6 lg:self-start">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold">Money flow</h2>
                <p className="mt-1 text-xs text-gray-500">
                  Income on the left flows into your total, then out to each category. Edit any row to
                  update it live.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setExpenseOrder((o) => (o === "custom" ? "desc" : o === "desc" ? "asc" : "custom"))
                }
                className="w-fit shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium hover:bg-gray-100"
                title="Toggle how expenses are ordered in the chart"
              >
                {expenseOrder === "custom"
                  ? "Sort: as entered"
                  : expenseOrder === "desc"
                  ? "Sort: high → low"
                  : "Sort: low → high"}
              </button>
            </div>

            <div className="mt-5 overflow-hidden rounded-2xl border">
              <SankeySvg graph={graph} colors={colors} svgRef={svgRef} />
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={exportPng}
                className="rounded-full border border-black bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
              >
                Export PNG
              </button>
              <button
                type="button"
                onClick={exportSvg}
                className="rounded-full border px-4 py-2 text-sm font-medium hover:bg-gray-100"
              >
                Export SVG
              </button>
              <span className="text-xs text-gray-500">
                Generated in your browser — the image never leaves your device.
              </span>
            </div>

            {/* -------------------- Budget / cross-tool report -------------------- */}
            <div className="mt-6">
              <ReportPanel
                description="Generated entirely in your browser — nothing leaves your device. Other tools' sections are rebuilt from data already saved on this device."
                sections={reportSections}
                selectedSections={selectedSections}
                onSectionsChange={setSelectedSections}
                formats={REPORT_FORMATS}
                format={reportFormat}
                onFormatChange={(v) => setReportFormat(v as ReportFormat)}
                onDownload={downloadReport}
                busy={reporting}
                disabled={selectedAvailableCount === 0}
                disabledReason="Choose at least one section to include."
                error={reportError}
              />
            </div>
          </section>
        </div>
        </>
      )}
    </main>
  );
}

function Row({
  item,
  onLabel,
  onAmount,
  onRemove,
}: {
  item: BudgetItem;
  onLabel: (v: string) => void;
  onAmount: (v: number) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={item.label}
        onChange={(e) => onLabel(e.target.value)}
        className="field min-w-0 flex-1 rounded-lg px-2.5 py-1.5 text-sm"
        aria-label="Label"
      />
      <div className="field flex items-center rounded-lg px-2 py-1.5">
        <span className="text-sm text-gray-500">$</span>
        <input
          type="number"
          min={0}
          step={10}
          value={item.amount === 0 ? "" : item.amount}
          placeholder="0"
          onChange={(e) => {
            const v = e.target.value === "" ? 0 : Number(e.target.value);
            onAmount(Number.isFinite(v) ? Math.max(0, v) : 0);
          }}
          className="w-20 bg-transparent text-right text-sm outline-none"
          aria-label="Amount"
        />
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="rounded-lg border px-2 py-1.5 text-sm text-gray-500 hover:text-gray-900"
        aria-label={`Remove ${item.label}`}
        title="Remove"
      >
        ✕
      </button>
    </div>
  );
}
