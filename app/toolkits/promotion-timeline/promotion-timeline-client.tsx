"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
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
import { buildCompensationProjection } from "@/lib/promotion/compensation";

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

function yearsLabel(months: number): string {
  const yr = Math.floor(months / 12);
  const mo = months % 12;
  const parts: string[] = [];
  if (yr) parts.push(`${yr} yr`);
  if (mo) parts.push(`${mo} mo`);
  return parts.join(" ") || "0 mo";
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
  const [zip, setZip] = useState<string>("");
  const [dependents, setDependents] = useState<boolean>(false);

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

  const comp = useMemo(
    () =>
      buildCompensationProjection(
        { branch, track, startGrade, contractYears, accessionDate },
        basepay,
        { zip, withDependents: dependents }
      ),
    [branch, track, startGrade, contractYears, accessionDate, basepay, zip, dependents]
  );

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

          <label className="block text-sm font-medium text-gray-700">
            Duty ZIP <span className="font-normal text-gray-400">(optional, for BAH)</span>
            <input
              type="text"
              inputMode="numeric"
              placeholder="e.g. 92134"
              className={selectCls}
              value={zip}
              onChange={(e) => setZip(e.target.value)}
            />
          </label>

          <label className="flex items-center gap-2 self-end pb-2 text-sm font-medium text-gray-700">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={dependents}
              onChange={(e) => setDependents(e.target.checked)}
            />
            With dependents
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

      {/* Compensation projection: taxable vs non-taxable */}
      <section className="rounded-3xl border bg-white p-6 md:p-8 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">Projected compensation</h2>
            <p className="mt-1 text-sm text-gray-600">
              Total pay over your projected career, split into{" "}
              <span className="font-medium text-gray-900">taxable</span> (base pay) and{" "}
              <span className="font-medium text-gray-900">non-taxable</span> (BAH + BAS).
            </p>
          </div>
          <span className="rounded-full border bg-gray-50 px-3 py-1 text-xs text-gray-600">
            {comp.year} rates
          </span>
        </div>

        {comp.hasBah ? (
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
            Including BAH for the entered ZIP {dependents ? "(with dependents)" : "(without dependents)"}.
            BAH is held at the current rate for each grade.
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
            {comp.bahStatus
              ? "That ZIP is not in the 2026 local BAH rate data, so the non-taxable totals include BAS only. Check the ZIP or verify with the official BAH calculator."
              : "Add a duty ZIP (and dependent status) above to fold BAH into the non-taxable totals. Showing base pay + BAS only for now."}
          </div>
        )}

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {[
            { label: `Through your contract (${contractYears} yr)`, t: comp.toETS },
            { label: "If you serve to 20-yr retirement", t: comp.toRetire },
          ].map((card) => (
            <div key={card.label} className="rounded-2xl border p-5">
              <div className="text-sm font-medium text-gray-700">{card.label}</div>
              <div className="mt-2 text-3xl font-bold tracking-tight">{usd(card.t.total)}</div>
              <div className="mt-1 text-xs text-gray-500">
                Total projected compensation ({Math.round(card.t.months / 12)} yr)
              </div>

              <div className="mt-4 flex h-3 w-full overflow-hidden rounded-full bg-gray-200">
                <div
                  className="h-full bg-gray-800"
                  style={{ width: `${100 - card.t.untaxablePct}%` }}
                  title="Taxable (base pay)"
                />
                <div
                  className="h-full bg-emerald-500"
                  style={{ width: `${card.t.untaxablePct}%` }}
                  title="Non-taxable (BAH + BAS)"
                />
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    <span className="inline-block h-2.5 w-2.5 rounded-full bg-gray-800" />
                    Taxable (base)
                  </div>
                  <div className="mt-0.5 font-semibold text-gray-900">{usd(card.t.taxable)}</div>
                </div>
                <div>
                  <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
                    Non-taxable
                  </div>
                  <div className="mt-0.5 font-semibold text-gray-900">{usd(card.t.untaxable)}</div>
                </div>
              </div>
              <div className="mt-2 text-xs text-gray-500">
                {card.t.untaxablePct.toFixed(0)}% of this total is generally non-taxable.
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="py-2 pr-3 font-medium">Grade</th>
                <th className="py-2 px-3 font-medium">Time held</th>
                <th className="py-2 px-3 text-right font-medium">Monthly base</th>
                <th className="py-2 px-3 text-right font-medium">Monthly BAS</th>
                <th className="py-2 px-3 text-right font-medium">Monthly BAH</th>
                <th className="py-2 pl-3 text-right font-medium">Phase total</th>
              </tr>
            </thead>
            <tbody>
              {comp.phases.map((p) => (
                <tr key={p.grade} className="border-b last:border-0">
                  <td className="py-2 pr-3 font-medium text-gray-900">{p.grade}</td>
                  <td className="py-2 px-3 text-gray-600">{yearsLabel(p.months)}</td>
                  <td className="py-2 px-3 text-right">{usd(p.monthlyBase)}</td>
                  <td className="py-2 px-3 text-right">{usd(p.monthlyBas)}</td>
                  <td className="py-2 px-3 text-right">{comp.hasBah ? usd(p.monthlyBah) : "—"}</td>
                  <td className="py-2 pl-3 text-right font-semibold text-gray-900">
                    {usd(p.taxable + p.untaxable)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-gray-500">
          Phase totals span the projected time at each grade out to the 20-yr mark and include DFAS
          longevity (over-N-years) base-pay raises. Monthly figures are shown at entry to each grade.
          BAS uses the {comp.year} {track === "officer" ? "officer" : "enlisted"} rate. Planning
          estimates only.
        </p>
      </section>

      {/* Retirement value: Legacy High-3 vs BRS trade-off */}
      <section className="rounded-3xl border bg-white p-6 md:p-8 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">Retirement value at 20 years</h2>
            <p className="mt-1 text-sm text-gray-600">
              A 20-year career also earns a lifetime pension — the biggest number most plans leave
              out. Here is the trade-off between the two military retirement systems.
            </p>
          </div>
          <span className="rounded-full border bg-gray-50 px-3 py-1 text-xs text-gray-600">
            High-3 basis: {usd(comp.retirement.high3Monthly)}/mo
          </span>
        </div>

        <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50 p-4">
          <div className="text-sm font-medium text-gray-700">
            Estimated 20-year value (service pay + {comp.retirement.payoutYears}-yr pension)
          </div>
          <div className="mt-1 text-3xl font-bold tracking-tight">
            {usd(comp.toRetire.total + Math.min(comp.retirement.legacy.lifetimeValue, comp.retirement.brs.lifetimeValue))}
            {" – "}
            {usd(comp.toRetire.total + Math.max(comp.retirement.legacy.lifetimeValue, comp.retirement.brs.lifetimeValue))}
          </div>
          <div className="mt-1 text-xs text-gray-500">
            {usd(comp.toRetire.total)} in pay earned over 20 years, plus an illustrative{" "}
            {comp.retirement.payoutYears}-year pension. The range spans the two retirement systems below.
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {[comp.retirement.legacy, comp.retirement.brs].map((sys) => {
            const isYours = sys.key === comp.retirement.yourSystem;
            return (
              <div
                key={sys.key}
                className={`rounded-2xl border p-5 ${isYours ? "border-emerald-300 ring-1 ring-emerald-200" : ""}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-gray-900">{sys.label}</div>
                  {isYours && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800">
                      Your system
                    </span>
                  )}
                </div>
                <div className="mt-2 text-2xl font-bold tracking-tight">{usd(sys.monthlyPension)}/mo</div>
                <div className="mt-0.5 text-xs text-gray-500">
                  {sys.multiplierPct.toFixed(0)}% of High-3 · {usd(sys.annualPension)}/yr
                </div>

                <dl className="mt-4 space-y-1.5 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-gray-600">{comp.retirement.payoutYears}-yr pension</dt>
                    <dd className="font-medium text-gray-900">{usd(sys.pensionPayout)}</dd>
                  </div>
                  {sys.key === "brs" && (
                    <>
                      <div className="flex justify-between gap-3">
                        <dt className="text-gray-600">Gov TSP match (with growth)</dt>
                        <dd className="font-medium text-gray-900">{usd(sys.tspGovWithGrowth)}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-gray-600">Continuation pay (est.)</dt>
                        <dd className="font-medium text-gray-900">{usd(sys.continuationPay)}</dd>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between gap-3 border-t pt-1.5">
                    <dt className="font-medium text-gray-900">Illustrative total</dt>
                    <dd className="font-bold text-gray-900">{usd(sys.lifetimeValue)}</dd>
                  </div>
                </dl>
              </div>
            );
          })}
        </div>

        <div className="mt-5 rounded-2xl border bg-gray-50 p-4 text-xs leading-5 text-gray-600">
          <div className="font-medium text-gray-900">The trade-off</div>
          <p className="mt-1">
            <strong>Legacy High-3</strong> pays a larger pension for life (50% vs 40% of your High-3
            base at 20 years) but has no government TSP match. <strong>BRS</strong> trades a smaller
            pension for a portable, invested TSP match you keep even if you separate before 20 years,
            plus continuation pay around the 12-year mark. Over a full 20-year career the Legacy
            pension usually leads on guaranteed income; BRS can catch up or pull ahead when TSP
            returns are strong and you value portability. Members who entered on or after Jan 1, 2018
            are under BRS; Legacy generally applies to those who entered before 2018.
          </p>
          <p className="mt-2">
            Estimates assume reaching 20 years at the projected grade, a {comp.retirement.payoutYears}-year
            pension with no COLA, and about {comp.retirement.tspGrowthPct.toFixed(0)}% average annual
            growth on the government TSP match. Pensions use your <em>High-3</em> (average of the
            highest 36 months of base pay). Continuation pay varies by branch and year
            ({comp.retirement.continuationMultiple}×–13× monthly base). Planning estimates only —
            verify with DFAS, the TSP, and your branch.
          </p>
        </div>
      </section>

      {/* Plan the raise (merged from the Promotion Pay Planner) */}
      <section className="rounded-3xl border bg-gray-50 p-6 md:p-8">
        <h2 className="text-lg font-semibold">Plan the raise before it hits</h2>
        <p className="mt-1 text-sm text-gray-600">
          Each promotion above is a pay bump. Decide where it goes before lifestyle creep does.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {[
            { pct: "50%", label: "Save & invest", note: "TSP, Roth IRA, or emergency fund first." },
            { pct: "30%", label: "Pay down debt", note: "High-interest balances, if any." },
            { pct: "20%", label: "Guilt-free", note: "Lifestyle upgrades you actually want." },
          ].map((x) => (
            <div key={x.label} className="rounded-2xl border bg-white p-4">
              <div className="text-2xl font-bold tracking-tight">{x.pct}</div>
              <div className="mt-1 text-sm font-medium text-gray-900">{x.label}</div>
              <div className="mt-1 text-xs text-gray-500">{x.note}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          <Link href="/" className="rounded-full border bg-white px-4 py-2 font-medium hover:bg-gray-100">
            Pay Calculator →
          </Link>
          <Link
            href="/toolkits/budget-planner"
            className="rounded-full border bg-white px-4 py-2 font-medium hover:bg-gray-100"
          >
            Budget Planner →
          </Link>
          <Link
            href="/toolkits/retirement-tsp"
            className="rounded-full border bg-white px-4 py-2 font-medium hover:bg-gray-100"
          >
            TSP & Retirement →
          </Link>
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
