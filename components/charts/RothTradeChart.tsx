"use client";

import { useState } from "react";
import { fmtUSD0 } from "@/lib/sankey/model";
import type { RothTradeoffResult } from "@/lib/projection/roth-tradeoff";
import { compactUSD, niceStep } from "./WealthCharts";

// Roth vs Traditional across time: the pre-tax balance is identical on both
// paths, so the chart draws what you actually KEEP if you withdrew each year —
// Roth (tax already paid) vs Traditional (balance minus the deferred tax
// bill). The widening gap between the lines IS the deferred tax bill growing
// with the balance; the dotted line shows the small tax paid up front on the
// Roth path. Same hover pattern as the other Wealth Projector charts.

export const ROTH_COLOR = "#0ea5e9";
export const TRAD_COLOR = "#f97316";
const UPFRONT_COLOR = "#64748b";

export default function RothTradeChart({ result }: { result: RothTradeoffResult }) {
  const W = 920;
  const H = 360;
  const ML = 68;
  const MR = 20;
  const MT = 26;
  const MB = 36;
  const [hover, setHover] = useState<number | null>(null);

  const years = result.years;
  const n = years.length;
  if (n === 0) return null;

  const maxV = Math.max(1, ...years.map((y) => y.rothAfterTax));
  const x = (i: number) => ML + (i / Math.max(1, n - 1)) * (W - ML - MR);
  const y = (v: number) => MT + (1 - v / maxV) * (H - MT - MB);

  const line = (pick: (yr: (typeof years)[number]) => number) =>
    years.map((yr, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(pick(yr)).toFixed(1)}`).join("");

  // Shaded band between the two lines = the deferred tax bill on Traditional.
  const bandPath = `${line((yr) => yr.rothAfterTax)}L${years
    .map((yr, i) => `${x(n - 1 - i).toFixed(1)},${y(years[n - 1 - i].tradAfterTax).toFixed(1)}`)
    .join("L")}Z`;

  const step = niceStep(maxV / 4);
  const gridVals: number[] = [];
  for (let v = step; v <= maxV; v += step) gridVals.push(v);
  const labelEvery = n <= 10 ? 1 : n <= 20 ? 2 : 5;

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const vx = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((vx - ML) / (W - ML - MR)) * (n - 1));
    setHover(i >= 0 && i < n ? i : null);
  };
  const h = hover !== null ? years[hover] : null;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="After-tax value over time: Roth versus Traditional"
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

      <path d={bandPath} fill={TRAD_COLOR} fillOpacity={0.1} />
      <path d={line((yr) => yr.rothAfterTax)} fill="none" stroke={ROTH_COLOR} strokeWidth={2.5} />
      <path d={line((yr) => yr.tradAfterTax)} fill="none" stroke={TRAD_COLOR} strokeWidth={2.5} />
      <path
        d={line((yr) => yr.taxPaidUpFront)}
        fill="none"
        stroke={UPFRONT_COLOR}
        strokeWidth={1.5}
        strokeDasharray="5 4"
      />

      {years.map((yr, i) =>
        i % labelEvery === 0 || i === n - 1 ? (
          <text key={yr.year} x={x(i)} y={H - 12} textAnchor="middle" fontSize={11} fill="#6b7280">
            {`yr ${yr.year}`}
          </text>
        ) : null
      )}

      <g transform={`translate(${ML + 8}, ${MT - 8})`} fontSize={12}>
        <line x1={0} x2={18} y1={7} y2={7} stroke={ROTH_COLOR} strokeWidth={2.5} />
        <text x={22} y={11} fill="#374151">
          Roth — keep it all (tax already paid)
        </text>
        <line x1={250} x2={268} y1={7} y2={7} stroke={TRAD_COLOR} strokeWidth={2.5} />
        <text x={272} y={11} fill="#374151">
          Traditional — after the deferred tax bill
        </text>
        <line x1={530} x2={548} y1={7} y2={7} stroke={UPFRONT_COLOR} strokeWidth={1.5} strokeDasharray="5 4" />
        <text x={552} y={11} fill="#374151">
          Roth tax paid up front (cumulative)
        </text>
      </g>

      {h && hover !== null && (
        <g pointerEvents="none">
          <line x1={x(hover)} x2={x(hover)} y1={MT} y2={H - MB} stroke="#94a3b8" strokeWidth={1} />
          {(() => {
            const width = 240;
            const height = 92;
            const left = x(hover) + 12 + width > W ? x(hover) - width - 12 : x(hover) + 12;
            const top = Math.max(8, y(h.rothAfterTax) - height / 2);
            const rows: [string, string, string?][] = [
              [`Year ${h.year}`, "", undefined],
              ["Roth keeps", fmtUSD0(h.rothAfterTax), ROTH_COLOR],
              ["Traditional keeps", fmtUSD0(h.tradAfterTax), TRAD_COLOR],
              ["Deferred tax bill", fmtUSD0(h.deferredTaxBill), TRAD_COLOR],
              ["Roth tax paid so far", fmtUSD0(h.taxPaidUpFront), UPFRONT_COLOR],
            ];
            return (
              <g transform={`translate(${left}, ${top})`}>
                <rect width={width} height={height} rx={10} fill="#0f172a" opacity={0.92} />
                {rows.map((r, i) => (
                  <g key={i} transform={`translate(10, ${18 + i * 15})`}>
                    {r[2] && <circle cx={4} cy={-4} r={4} fill={r[2]} />}
                    <text x={r[2] ? 14 : 0} fontSize={11.5} fill="#e2e8f0">
                      {r[0]}
                    </text>
                    <text x={width - 20} fontSize={11.5} fill="#ffffff" textAnchor="end" fontWeight={600}>
                      {r[1]}
                    </text>
                  </g>
                ))}
              </g>
            );
          })()}
        </g>
      )}
    </svg>
  );
}
