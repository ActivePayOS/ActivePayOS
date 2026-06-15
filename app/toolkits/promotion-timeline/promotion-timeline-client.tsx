"use client";

import { useMemo, useState } from "react";
import {
  BRANCH_OPTIONS,
  BranchId,
  Track,
  START_GRADES,
} from "@/data/promotion/timing";
import { BasePayDataset } from "@/lib/pay/basepay-lookup";
import {
  buildPromotionTimeline,
  TimelineInputs,
  EventKind,
} from "@/lib/promotion/timeline";

type ExportFormat = "pdf" | "csv" | "txt";

const EXPORT_FORMATS: { value: ExportFormat; label: string }[] = [
  { value: "pdf", label: "PDF — visual timeline" },
  { value: "csv", label: "CSV — event table" },
  { value: "txt", label: "Text — plain list" },
];

const DOT_CLASS: Record<EventKind, string> = {
  start: "bg-gray-700",
  promotion: "bg-emerald-600",
  "early-promotion": "bg-amber-500",
  "gi-bill": "bg-blue-600",
  service: "bg-gray-400",
  retirement: "bg-purple-600",
  today: "bg-white ring-2 ring-red-500",
};

const KIND_BADGE: Partial<Record<EventKind, { label: string; cls: string }>> = {
  "early-promotion": { label: "Early", cls: "bg-amber-100 text-amber-800" },
  "gi-bill": { label: "GI Bill", cls: "bg-blue-100 text-blue-800" },
  retirement: { label: "Retirement", cls: "bg-purple-100 text-purple-800" },
  today: { label: "Today", cls: "bg-red-100 text-red-700" },
};

function usd(n: number | null | undefined): string {
  if (n == null) return "";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

const LEGEND: { kind: EventKind; label: string }[] = [
  { kind: "promotion", label: "Promotion" },
  { kind: "early-promotion", label: "Early promotion" },
  { kind: "gi-bill", label: "GI Bill" },
  { kind: "service", label: "Service milestone" },
  { kind: "retirement", label: "Retirement" },
  { kind: "today", label: "Today" },
];

export default function PromotionTimelineClient({ basepay }: { basepay: BasePayDataset }) {
  const todayISO = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const [branch, setBranch] = useState<BranchId>("army");
  const [track, setTrack] = useState<Track>("enlisted");
  const [startGrade, setStartGrade] = useState<string>("E-1");
  const [accessionDate, setAccessionDate] = useState<string>(todayISO);
  const [contractYears, setContractYears] = useState<number>(4);

  const [format, setFormat] = useState<ExportFormat>("pdf");
  const [exporting, setExporting] = useState(false);

  function onTrackChange(next: Track) {
    setTrack(next);
    // Reset start grade to the first valid grade for the new track.
    setStartGrade(START_GRADES[next][0]);
  }

  const inputs: TimelineInputs = useMemo(
    () => ({ branch, track, startGrade, accessionDate, contractYears, todayISO }),
    [branch, track, startGrade, accessionDate, contractYears, todayISO]
  );

  const result = useMemo(() => buildPromotionTimeline(inputs, basepay), [inputs, basepay]);

  async function downloadTimeline() {
    setExporting(true);
    try {
      const res = await fetch("/api/export-timeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...inputs, format }),
      });
      if (!res.ok) {
        alert("Export failed. Please check your inputs and try again.");
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `activepayos_PromotionTimeline_${branch}_${startGrade}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  const selectCls =
    "mt-1 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-black/20";

  return (
    <main className="mx-auto max-w-5xl p-6 md:p-10 space-y-8">
      <header className="rounded-3xl border bg-white p-6 md:p-8 shadow-sm">
        <h1 className="text-3xl font-semibold tracking-tight">Promotion & Milestone Timeline</h1>
        <p className="mt-2 text-sm text-gray-600">
          Plot your projected promotions and key milestones over time from your contract details —
          with the base-pay raise at each step. Junior promotions are largely time-based; senior
          ones are board/exam-driven and shown as <em>earliest typical</em> eligibility.
        </p>
        <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          Planning estimates only — not an official DoD, DFAS, or VA tool. Promotions above the
          junior grades are competitive and not guaranteed. Verify with your chain of command,
          branch policy, and the VA.
        </div>
      </header>

      {/* Inputs */}
      <section className="rounded-3xl border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Contract details</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block text-sm font-medium text-gray-700">
            Branch
            <select className={selectCls} value={branch} onChange={(e) => setBranch(e.target.value as BranchId)}>
              {BRANCH_OPTIONS.map((b) => (
                <option key={b.value} value={b.value}>{b.label}</option>
              ))}
            </select>
          </label>

          <label className="block text-sm font-medium text-gray-700">
            Track
            <select className={selectCls} value={track} onChange={(e) => onTrackChange(e.target.value as Track)}>
              <option value="enlisted">Enlisted</option>
              <option value="officer">Officer</option>
            </select>
          </label>

          <label className="block text-sm font-medium text-gray-700">
            Starting grade (at entry)
            <select className={selectCls} value={startGrade} onChange={(e) => setStartGrade(e.target.value)}>
              {START_GRADES[track].map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </label>

          <label className="block text-sm font-medium text-gray-700">
            Date entered service
            <input
              type="date"
              className={selectCls}
              value={accessionDate}
              onChange={(e) => setAccessionDate(e.target.value)}
            />
          </label>

          <label className="block text-sm font-medium text-gray-700">
            Contract length (years)
            <input
              type="number"
              min={1}
              max={30}
              className={selectCls}
              value={contractYears}
              onChange={(e) => {
                const v = Number(e.target.value);
                setContractYears(Number.isFinite(v) ? Math.min(30, Math.max(1, v)) : 4);
              }}
            />
          </label>
        </div>

        <p className="mt-4 text-sm text-gray-700">
          Projected path: <strong>{result.startGrade} → {result.finalGrade}</strong>{" "}
          <span className="text-gray-500">
            ({result.branchLabel}, {track === "officer" ? "Officer" : "Enlisted"}, {contractYears}-yr contract)
          </span>
        </p>

        {/* Export controls */}
        <div className="mt-5 flex flex-wrap items-center gap-2 border-t pt-5">
          <span className="text-sm font-medium text-gray-700">Export:</span>
          <select
            aria-label="Export format"
            value={format}
            onChange={(e) => setFormat(e.target.value as ExportFormat)}
            className="rounded-full border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-black/20"
          >
            {EXPORT_FORMATS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={downloadTimeline}
            disabled={exporting}
            className="rounded-full border border-black bg-black px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {exporting ? "Preparing..." : "Download"}
          </button>
        </div>
      </section>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-gray-600">
        {LEGEND.map((l) => (
          <span key={l.kind} className="inline-flex items-center gap-1.5">
            <span className={`inline-block h-3 w-3 rounded-full ${DOT_CLASS[l.kind]}`} />
            {l.label}
          </span>
        ))}
      </div>

      {/* Timeline */}
      <section className="rounded-3xl border bg-white p-6 md:p-8 shadow-sm">
        <ol className="relative ml-24 border-l-2 border-gray-200">
          {result.events.map((e) => {
            const badge = KIND_BADGE[e.kind];
            return (
              <li key={e.id} className="relative mb-7 pl-6 last:mb-0">
                {/* dot */}
                <span
                  className={`absolute -left-[9px] top-1 h-4 w-4 rounded-full border-2 border-white ${DOT_CLASS[e.kind]}`}
                  aria-hidden
                />
                {/* date column to the left of the spine */}
                <span className="absolute -left-[120px] top-0 w-[92px] text-right">
                  <span className="block text-xs font-semibold text-gray-900">{e.dateISO}</span>
                  <span className="block text-[11px] text-gray-500">{e.sinceStart}</span>
                </span>

                <div className={`flex flex-wrap items-baseline gap-x-2 ${e.past ? "opacity-70" : ""}`}>
                  <span className="text-sm font-semibold text-gray-900">{e.title}</span>
                  {badge && (
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${badge.cls}`}>
                      {badge.label}
                    </span>
                  )}
                  {e.estimate && e.kind !== "today" && (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500">
                      estimate
                    </span>
                  )}
                </div>

                {e.monthlyBasePay != null && (
                  <div className="mt-0.5 text-sm">
                    <span className="font-medium text-gray-900">{usd(e.monthlyBasePay)}/mo base</span>
                    {e.payDelta != null && e.payDelta !== 0 && (
                      <span className={`ml-2 ${e.payDelta > 0 ? "text-emerald-700" : "text-red-700"}`}>
                        {e.payDelta > 0 ? "+" : ""}
                        {usd(e.payDelta)}
                      </span>
                    )}
                  </div>
                )}

                {e.detail && <p className="mt-0.5 text-xs text-gray-500">{e.detail}</p>}
              </li>
            );
          })}
        </ol>
      </section>

      {/* Source */}
      <section className="rounded-2xl border bg-gray-50 p-4 text-xs text-gray-600">
        <div className="font-medium text-gray-900">Sources & accuracy</div>
        <p className="mt-1">
          Promotion timing reference:{" "}
          <a className="underline" href={result.source.url} target="_blank" rel="noreferrer">
            {result.source.label}
          </a>
          . GI Bill tiers per the VA Post-9/11 GI Bill. Pay uses the {basepay.year} DFAS base-pay
          tables (grade × years of service). Figures are estimates; competitive promotions depend on
          performance, manning, and boards.
        </p>
      </section>
    </main>
  );
}
