"use client";

import { useState } from "react";
import { fmtUSD0 } from "@/lib/sankey/model";
import { gradeNumber, type CareerProjection } from "@/lib/projection/career";

// Interactive SVG charts for the Wealth Projector. Self-contained (no chart
// library): stacked growth areas, the pay/rank step chart that shows how the
// engine computes contributions, and yearly money-in vs. growth bars. All
// three share the same hover pattern — pointer position → nearest data point
// → tooltip — so the interaction feels consistent across tabs.

export const ACCOUNT_COLORS: Record<string, string> = {
  tsp: "#3b82f6",
  invest: "#22c55e",
  savings: "#f59e0b",
  ira: "#8b5cf6",
  k401: "#ec4899",
};

export const ACCOUNT_LABELS: Record<string, string> = {
  tsp: "TSP",
  invest: "Investments",
  savings: "Savings",
  ira: "IRA",
  k401: "401(k)",
};

// One shade per pay grade for the rank band (junior → senior).
const GRADE_SHADES = [
  "#bfdbfe",
  "#93c5fd",
  "#60a5fa",
  "#3b82f6",
  "#2563eb",
  "#1d4ed8",
  "#1e40af",
  "#312e81",
  "#1e1b4b",
];
export function gradeColor(grade: string): string {
  return GRADE_SHADES[Math.min(GRADE_SHADES.length - 1, Math.max(0, gradeNumber(grade) - 1))];
}

export function niceStep(raw: number): number {
  const mag = Math.pow(10, Math.floor(Math.log10(Math.max(1, raw))));
  const norm = raw / mag;
  const nice = norm >= 5 ? 5 : norm >= 2 ? 2.5 : norm >= 1 ? 2 : 1;
  return nice * mag;
}

export function compactUSD(v: number): string {
  const a = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (a >= 1_000_000) return `${sign}$${(a / 1_000_000).toFixed(1)}M`;
  if (a >= 1_000) return `${sign}$${Math.round(a / 1_000)}k`;
  return `${sign}$${Math.round(a)}`;
}

/** Convert a pointer event on an <svg viewBox> to viewBox x. */
function svgX(e: React.PointerEvent<SVGSVGElement>, W: number): number {
  const rect = e.currentTarget.getBoundingClientRect();
  return ((e.clientX - rect.left) / rect.width) * W;
}

function Tooltip({
  x,
  y,
  W,
  lines,
}: {
  x: number;
  y: number;
  W: number;
  lines: { label: string; value: string; color?: string }[];
}) {
  const width = 190;
  const height = 20 + lines.length * 17;
  const left = x + 12 + width > W ? x - width - 12 : x + 12;
  return (
    <g transform={`translate(${left}, ${Math.max(8, y - height / 2)})`} pointerEvents="none">
      <rect width={width} height={height} rx={10} fill="#0f172a" opacity={0.92} />
      {lines.map((l, i) => (
        <g key={i} transform={`translate(10, ${20 + i * 17})`}>
          {l.color && <circle cx={4} cy={-4} r={4} fill={l.color} />}
          <text x={l.color ? 14 : 0} y={0} fontSize={12} fill="#e2e8f0">
            {l.label}
          </text>
          <text x={width - 20} y={0} fontSize={12} fill="#ffffff" textAnchor="end" fontWeight={600}>
            {l.value}
          </text>
        </g>
      ))}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Growth: stacked account areas over the full horizon + separation marker.
// ---------------------------------------------------------------------------
export function GrowthChart({
  projection,
  startBalances,
  startYear,
  currentAge,
  serviceYears,
  baselineSeries,
  baselineLabel = "Before tuning",
  svgRef,
}: {
  projection: CareerProjection;
  startBalances: { tsp: number; invest: number; savings: number; ira?: number; k401?: number };
  startYear: number;
  currentAge: number;
  serviceYears: number;
  /**
   * Optional comparison totals drawn as a muted dotted line over the stack —
   * e.g. the projection before the user started tuning inputs. Points are
   * matched to the main projection by yearIndex, so a series that is shorter
   * or longer just draws across the years the two have in common. Omit (or
   * pass null / an empty array) and the chart renders exactly as it does
   * without the overlay — the export path relies on that.
   */
  baselineSeries?: { yearIndex: number; total: number }[] | null;
  /** Legend text for the comparison line. */
  baselineLabel?: string;
  /** Optional ref to the SVG element, for PNG/SVG/PDF export. */
  svgRef?: React.Ref<SVGSVGElement>;
}) {
  const W = 920;
  const H = 400;
  const ML = 68;
  const MR = 20;
  // Top margin leaves a dedicated band for the legend so in-plot labels (the
  // "separation" marker) never collide with it.
  const MT = 44;
  const MB = 44;
  const [hover, setHover] = useState<number | null>(null);

  const startBal = {
    tsp: startBalances.tsp,
    invest: startBalances.invest,
    savings: startBalances.savings,
    ira: startBalances.ira ?? 0,
    k401: startBalances.k401 ?? 0,
  };
  const startTotal = startBal.tsp + startBal.invest + startBal.savings + startBal.ira + startBal.k401;
  const points = [
    {
      yearIndex: 0,
      age: currentAge,
      balances: startBal,
      total: startTotal,
      realTotal: startTotal,
    },
    ...projection.years,
  ];
  const n = points.length - 1;

  // Comparison overlay. Resolve each baseline point to a column of the main
  // projection by yearIndex (dropping years the two don't share, so a shorter
  // or longer baseline simply clamps to the overlap), de-duplicated and sorted
  // left to right. Empty/absent baseline → an empty list, and every derived
  // value below collapses back to the plain chart.
  const rawBaseline = baselineSeries && baselineSeries.length > 0 ? baselineSeries : null;
  const basePoints: { i: number; total: number }[] = [];
  if (rawBaseline) {
    const columnOf = new Map<number, number>();
    points.forEach((p, i) => columnOf.set(p.yearIndex, i));
    const byColumn = new Map<number, number>();
    for (const b of rawBaseline) {
      const i = columnOf.get(b?.yearIndex);
      const total = b?.total;
      if (i === undefined || typeof total !== "number" || !Number.isFinite(total)) continue;
      byColumn.set(i, Math.max(0, total));
    }
    for (const [i, total] of [...byColumn.entries()].sort((a, b) => a[0] - b[0])) {
      basePoints.push({ i, total });
    }
  }
  const showBaseline = basePoints.length > 0;

  // Spreading an empty list leaves maxTotal exactly as it was before the
  // overlay existed; with a baseline, a tuned-up "before" curve can't clip.
  const maxTotal = Math.max(1, ...points.map((p) => p.total), ...basePoints.map((b) => b.total));
  const x = (i: number) => ML + (i / Math.max(1, n)) * (W - ML - MR);
  const y = (v: number) => MT + (1 - v / maxTotal) * (H - MT - MB);

  const allKeys = ["tsp", "ira", "k401", "invest", "savings"] as const;
  // Only stack/label accounts that ever hold money, so the default view stays
  // the familiar three-account chart.
  const keys = allKeys.filter((k) => points.some((p) => (p.balances[k] ?? 0) > 0.5));
  const stacked = points.map((p) => {
    let acc = 0;
    const levels: Record<string, { from: number; to: number }> = {};
    for (const k of keys) {
      const v = p.balances[k] ?? 0;
      levels[k] = { from: acc, to: acc + v };
      acc += v;
    }
    return levels;
  });

  const areaPath = (key: (typeof allKeys)[number]) => {
    const top = stacked.map((s, i) => `${x(i).toFixed(1)},${y(s[key].to).toFixed(1)}`);
    const bottom = stacked
      .map((s, i) => `${x(i).toFixed(1)},${y(s[key].from).toFixed(1)}`)
      .reverse();
    return `M${top.join("L")}L${bottom.join("L")}Z`;
  };

  const realLine = points
    .map((p, i) => `${x(i).toFixed(1)},${y(p.realTotal).toFixed(1)}`)
    .join("L");

  const BASELINE_COLOR = "#94a3b8";
  const BASELINE_DASH = "2 6"; // dotted — reads apart from the 6/4 today's-$ dashes
  const baseSeg = basePoints.map((b) => `${x(b.i).toFixed(1)},${y(b.total).toFixed(1)}`);
  // A single overlapping year still shows: a zero-length segment + round caps
  // draws a dot rather than nothing.
  const baselinePath = showBaseline
    ? `M${baseSeg.join("L")}${baseSeg.length === 1 ? `L${baseSeg[0]}` : ""}`
    : null;
  // Legend chip sits after the "Total in today's dollars" chip; trim the label
  // to whatever room is left so a long label can't run past the plot.
  const legendBaseX = keys.length * 96 + 190;
  const legendRoom = W - MR - (ML + 8) - legendBaseX - 22;
  const legendMax = Math.max(6, Math.floor(legendRoom / 6.4));
  const legendFull = (baselineLabel || "").trim() || "Before tuning";
  const legendText =
    legendFull.length > legendMax ? `${legendFull.slice(0, Math.max(1, legendMax - 1))}…` : legendFull;

  const step = niceStep(maxTotal / 4);
  const gridVals: number[] = [];
  for (let v = step; v <= maxTotal; v += step) gridVals.push(v);
  const labelEvery = n <= 8 ? 1 : n <= 16 ? 2 : n <= 30 ? 5 : 10;
  const sepX = serviceYears > 0 && serviceYears < n ? x(serviceYears) : null;

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const vx = svgX(e, W);
    const i = Math.round(((vx - ML) / (W - ML - MR)) * n);
    setHover(i >= 0 && i <= n ? i : null);
  };

  const h = hover !== null ? points[hover] : null;
  const hBase = hover === null ? undefined : basePoints.find((b) => b.i === hover);

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      role="img"
      aria-label={
        showBaseline
          ? `Projected balances by year, stacked by account, with a ${legendFull} comparison line`
          : "Projected balances by year, stacked by account"
      }
      className="block h-auto w-full touch-none select-none"
      onPointerMove={onMove}
      onPointerLeave={() => setHover(null)}
    >
      <rect width={W} height={H} fill="white" />
      {gridVals.map((v) => (
        <g key={v}>
          <line x1={ML} x2={W - MR} y1={y(v)} y2={y(v)} stroke="#e5e7eb" strokeWidth={1} />
          <text x={ML - 8} y={y(v) + 4} textAnchor="end" fontSize={12} fill="#6b7280">
            {compactUSD(v)}
          </text>
        </g>
      ))}
      {[...keys].reverse().map((k) => (
        <path key={k} d={areaPath(k)} fill={ACCOUNT_COLORS[k]} fillOpacity={0.75} />
      ))}
      {baselinePath && (
        <path
          d={baselinePath}
          fill="none"
          stroke={BASELINE_COLOR}
          strokeWidth={2}
          strokeDasharray={BASELINE_DASH}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      <path d={`M${realLine}`} fill="none" stroke="#374151" strokeWidth={2} strokeDasharray="6 4" />

      {sepX !== null && (
        <g>
          <line x1={sepX} x2={sepX} y1={MT} y2={H - MB} stroke="#ef4444" strokeWidth={1.5} strokeDasharray="4 4" />
          <text x={sepX + 5} y={MT + 18} fontSize={11} fill="#ef4444" fontWeight={600}>
            separation
          </text>
        </g>
      )}

      {points.map((p, i) =>
        i % labelEvery === 0 || i === n ? (
          <g key={i}>
            <text x={x(i)} y={H - 24} textAnchor="middle" fontSize={12} fill="#6b7280">
              {startYear + p.yearIndex}
            </text>
            <text x={x(i)} y={H - 9} textAnchor="middle" fontSize={10} fill="#9ca3af">
              age {p.age}
            </text>
          </g>
        ) : null
      )}

      <g transform={`translate(${ML + 8}, 10)`} fontSize={12}>
        {keys.map((k, i) => (
          <g key={k} transform={`translate(${i * 96}, 0)`}>
            <rect width={10} height={10} y={2} rx={2} fill={ACCOUNT_COLORS[k]} fillOpacity={0.8} />
            <text x={14} y={11} fill="#374151">
              {ACCOUNT_LABELS[k]}
            </text>
          </g>
        ))}
        <g transform={`translate(${keys.length * 96 + 10}, 0)`}>
          <line x1={0} x2={18} y1={7} y2={7} stroke="#374151" strokeWidth={2} strokeDasharray="6 4" />
          <text x={22} y={11} fill="#374151">
            Total in today&apos;s dollars
          </text>
        </g>
        {showBaseline && (
          <g transform={`translate(${legendBaseX}, 0)`}>
            <line
              x1={0}
              x2={18}
              y1={7}
              y2={7}
              stroke={BASELINE_COLOR}
              strokeWidth={2}
              strokeDasharray={BASELINE_DASH}
              strokeLinecap="round"
            />
            <text x={22} y={11} fill="#374151">
              {legendText}
            </text>
          </g>
        )}
      </g>

      {h && hover !== null && (
        <g>
          <line x1={x(hover)} x2={x(hover)} y1={MT} y2={H - MB} stroke="#94a3b8" strokeWidth={1} />
          {hBase && <circle cx={x(hover)} cy={y(hBase.total)} r={3.5} fill={BASELINE_COLOR} />}
          <circle cx={x(hover)} cy={y(h.total)} r={4} fill="#0f172a" />
          <Tooltip
            x={x(hover)}
            y={y(h.total)}
            W={W}
            lines={[
              { label: `${startYear + h.yearIndex} · age ${h.age}`, value: "" },
              ...keys.map((k) => ({
                label: ACCOUNT_LABELS[k],
                value: fmtUSD0(h.balances[k] ?? 0),
                color: ACCOUNT_COLORS[k],
              })),
              { label: "Total", value: fmtUSD0(h.total) },
              { label: "Today's $", value: fmtUSD0(h.realTotal) },
              ...(hBase
                ? [
                    { label: "Baseline", value: fmtUSD0(hBase.total), color: BASELINE_COLOR },
                    {
                      label: "Difference",
                      value: `${h.total - hBase.total < 0 ? "-" : "+"}${fmtUSD0(Math.abs(h.total - hBase.total))}`,
                    },
                  ]
                : []),
            ]}
          />
        </g>
      )}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Pay & Rank: base-pay step line while serving, promotion markers, rank band.
// This is the "show your work" view — the pay that feeds every contribution.
// ---------------------------------------------------------------------------
export function PayRankChart({
  projection,
  startYear,
}: {
  projection: CareerProjection;
  startYear: number;
}) {
  const W = 920;
  const H = 380;
  const ML = 68;
  const MR = 20;
  const MT = 24;
  const MB = 64;
  const [hover, setHover] = useState<number | null>(null);

  const pts = projection.payTimeline;
  if (pts.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-gray-500">
        No service window to chart — set “years more you&apos;ll serve” above 0.
      </div>
    );
  }

  const n = pts.length;
  const maxPay = Math.max(...pts.map((p) => p.basePayMonthly)) * 1.15;
  const x = (m: number) => ML + (m / Math.max(1, n - 1)) * (W - ML - MR);
  const y = (v: number) => MT + (1 - v / maxPay) * (H - MT - MB - 20);

  const payPath = pts
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.basePayMonthly).toFixed(1)}`)
    .join("");
  const tspPath = pts
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.tspMonthly).toFixed(1)}`)
    .join("");

  // Contiguous rank segments for the band under the chart.
  const segments: { grade: string; from: number; to: number }[] = [];
  for (let i = 0; i < n; i++) {
    const last = segments[segments.length - 1];
    if (last && last.grade === pts[i].grade) last.to = i;
    else segments.push({ grade: pts[i].grade, from: i, to: i });
  }

  const step = niceStep(maxPay / 4);
  const gridVals: number[] = [];
  for (let v = step; v <= maxPay; v += step) gridVals.push(v);

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const vx = svgX(e, W);
    const i = Math.round(((vx - ML) / (W - ML - MR)) * (n - 1));
    setHover(i >= 0 && i < n ? i : null);
  };
  const h = hover !== null ? pts[hover] : null;

  const bandY = H - MB + 8;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="Monthly base pay and rank while serving, with promotion markers"
      className="block w-full touch-none select-none"
      onPointerMove={onMove}
      onPointerLeave={() => setHover(null)}
    >
      <rect width={W} height={H} fill="white" />
      {gridVals.map((v) => (
        <g key={v}>
          <line x1={ML} x2={W - MR} y1={y(v)} y2={y(v)} stroke="#e5e7eb" strokeWidth={1} />
          <text x={ML - 8} y={y(v) + 4} textAnchor="end" fontSize={12} fill="#6b7280">
            {compactUSD(v)}
          </text>
        </g>
      ))}

      <path d={payPath} fill="none" stroke="#0b5cff" strokeWidth={2.5} />
      <path d={tspPath} fill="none" stroke="#22c55e" strokeWidth={2} strokeDasharray="5 3" />

      {projection.promotions.map((p) => (
        <g key={p.monthIndex}>
          <line
            x1={x(p.monthIndex)}
            x2={x(p.monthIndex)}
            y1={MT + 14}
            y2={H - MB + 4}
            stroke="#8b5cf6"
            strokeWidth={1.5}
            strokeDasharray="3 3"
          />
          <text
            x={x(p.monthIndex)}
            y={H - MB - 4}
            textAnchor="middle"
            fontSize={11}
            fontWeight={600}
            fill="#8b5cf6"
          >
            {`${p.toGrade}${p.competitive ? "*" : ""} promotion`}
          </text>
        </g>
      ))}

      {/* Rank band */}
      {segments.map((s) => (
        <g key={`${s.grade}-${s.from}`}>
          <rect
            x={x(s.from)}
            y={bandY}
            width={Math.max(2, x(s.to) - x(s.from))}
            height={16}
            fill={gradeColor(s.grade)}
            rx={3}
          />
          {x(s.to) - x(s.from) > 34 && (
            <text
              x={(x(s.from) + x(s.to)) / 2}
              y={bandY + 12}
              textAnchor="middle"
              fontSize={10}
              fontWeight={600}
              fill="#ffffff"
            >
              {s.grade}
            </text>
          )}
        </g>
      ))}

      {/* Year labels */}
      {pts.map((p, i) =>
        i % 12 === 0 ? (
          <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize={11} fill="#6b7280">
            {startYear + Math.floor(p.monthIndex / 12)}
          </text>
        ) : null
      )}

      <g transform={`translate(${ML + 8}, ${MT - 6})`} fontSize={12}>
        <line x1={0} x2={18} y1={7} y2={7} stroke="#0b5cff" strokeWidth={2.5} />
        <text x={22} y={11} fill="#374151">
          Base pay /mo
        </text>
        <line x1={130} x2={148} y1={7} y2={7} stroke="#22c55e" strokeWidth={2} strokeDasharray="5 3" />
        <text x={152} y={11} fill="#374151">
          TSP going in /mo (you + match)
        </text>
        <text x={W - ML - 240} y={11} fill="#8b5cf6">
          * board/exam-driven — not guaranteed
        </text>
      </g>

      {h && hover !== null && (
        <g>
          <line x1={x(hover)} x2={x(hover)} y1={MT} y2={H - MB} stroke="#94a3b8" strokeWidth={1} />
          <Tooltip
            x={x(hover)}
            y={y(h.basePayMonthly)}
            W={W}
            lines={[
              {
                label: `${startYear + Math.floor(h.monthIndex / 12)} · ${h.grade}`,
                value: "",
              },
              { label: "Base pay", value: `${fmtUSD0(h.basePayMonthly)}/mo`, color: "#0b5cff" },
              { label: "Into TSP", value: `${fmtUSD0(h.tspMonthly)}/mo`, color: "#22c55e" },
            ]}
          />
        </g>
      )}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Flows: yearly bars — money you put in vs. growth the market added.
// ---------------------------------------------------------------------------
export function FlowsChart({
  projection,
  startYear,
}: {
  projection: CareerProjection;
  startYear: number;
}) {
  const W = 920;
  const H = 360;
  const ML = 68;
  const MR = 20;
  const MT = 24;
  const MB = 40;
  const [hover, setHover] = useState<number | null>(null);

  const years = projection.years;
  const n = years.length;
  const maxV = Math.max(1, ...years.map((y) => Math.max(y.yearContributions + Math.max(0, y.yearGrowth), Math.abs(Math.min(0, y.yearGrowth)))));
  const zeroY = MT + (H - MT - MB) * (maxV / (maxV + Math.abs(Math.min(0, Math.min(...years.map((y) => y.yearGrowth))))) || 1) * 0.999;
  // Simpler: symmetric scale around zero only when negatives exist.
  const minG = Math.min(0, ...years.map((y) => y.yearGrowth));
  const span = maxV - minG;
  const yv = (v: number) => MT + ((maxV - v) / span) * (H - MT - MB);
  void zeroY;

  const slot = (W - ML - MR) / n;
  const barW = Math.max(4, Math.min(34, slot * 0.62));
  const xi = (i: number) => ML + slot * i + (slot - barW) / 2;
  const labelEvery = n <= 10 ? 1 : n <= 20 ? 2 : 5;

  const step = niceStep(span / 4);
  const gridVals: number[] = [];
  for (let v = Math.ceil(minG / step) * step; v <= maxV; v += step) gridVals.push(v);

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const vx = svgX(e, W);
    const i = Math.floor((vx - ML) / slot);
    setHover(i >= 0 && i < n ? i : null);
  };
  const h = hover !== null ? years[hover] : null;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="Yearly contributions versus market growth"
      className="block w-full touch-none select-none"
      onPointerMove={onMove}
      onPointerLeave={() => setHover(null)}
    >
      <rect width={W} height={H} fill="white" />
      {gridVals.map((v) => (
        <g key={v}>
          <line
            x1={ML}
            x2={W - MR}
            y1={yv(v)}
            y2={yv(v)}
            stroke={v === 0 ? "#9ca3af" : "#e5e7eb"}
            strokeWidth={1}
          />
          <text x={ML - 8} y={yv(v) + 4} textAnchor="end" fontSize={12} fill="#6b7280">
            {compactUSD(v)}
          </text>
        </g>
      ))}

      {years.map((yr, i) => {
        const g = yr.yearGrowth;
        const contribTop = yv(yr.yearContributions + Math.max(0, g));
        const growthTop = yv(Math.max(0, g));
        return (
          <g key={yr.yearIndex} opacity={hover === null || hover === i ? 1 : 0.55}>
            {/* growth (bottom of stack when positive, below axis when negative) */}
            {g >= 0 ? (
              <rect x={xi(i)} y={growthTop} width={barW} height={yv(0) - growthTop} fill="#8b5cf6" rx={2} />
            ) : (
              <rect x={xi(i)} y={yv(0)} width={barW} height={yv(g) - yv(0)} fill="#ef4444" rx={2} />
            )}
            {/* contributions stacked above positive growth */}
            <rect
              x={xi(i)}
              y={contribTop}
              width={barW}
              height={Math.max(0, yv(Math.max(0, g)) - contribTop)}
              fill="#0ea5e9"
              rx={2}
            />
            {!yr.serving && (
              <rect x={xi(i)} y={H - MB + 4} width={barW} height={3} fill="#d1d5db" rx={1.5} />
            )}
          </g>
        );
      })}

      {years.map((yr, i) =>
        i % labelEvery === 0 || i === n - 1 ? (
          <text
            key={yr.yearIndex}
            x={xi(i) + barW / 2}
            y={H - 12}
            textAnchor="middle"
            fontSize={11}
            fill="#6b7280"
          >
            {startYear + yr.yearIndex}
          </text>
        ) : null
      )}

      <g transform={`translate(${ML + 8}, ${MT - 6})`} fontSize={12}>
        <rect width={10} height={10} y={2} rx={2} fill="#0ea5e9" />
        <text x={14} y={11} fill="#374151">
          Money you put in
        </text>
        <rect x={140} width={10} height={10} y={2} rx={2} fill="#8b5cf6" />
        <text x={154} y={11} fill="#374151">
          Growth the market added
        </text>
        <rect x={330} width={10} height={3} y={6} rx={1.5} fill="#d1d5db" />
        <text x={344} y={11} fill="#374151">
          after separation
        </text>
      </g>

      {h && hover !== null && (
        <Tooltip
          x={xi(hover) + barW / 2}
          y={yv(Math.max(0, h.yearGrowth) + h.yearContributions)}
          W={W}
          lines={[
            { label: `${startYear + h.yearIndex} · age ${h.age}`, value: "" },
            { label: "Put in", value: fmtUSD0(h.yearContributions), color: "#0ea5e9" },
            {
              label: "Growth",
              value: fmtUSD0(h.yearGrowth),
              color: h.yearGrowth >= 0 ? "#8b5cf6" : "#ef4444",
            },
            { label: "End balance", value: fmtUSD0(h.total) },
          ]}
        />
      )}
    </svg>
  );
}
