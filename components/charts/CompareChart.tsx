"use client";

import { fmtUSD0 } from "@/lib/sankey/model";
import type { ThemeColors } from "@/components/sankey/useThemeColors";

// Themed, exportable grouped-bar chart comparing two pay scenarios (A vs B).
// Self-contained SVG with concrete colors + a baked-in watermark, so it exports
// cleanly to PNG/SVG via the same helpers the Sankey uses.

const W = 920;
const H = 480;
const ML = 24; // left edge for metric labels
const BAR_X = 220; // bars start here
const BAR_MAX = 410; // max bar pixel width
const RIGHT = W - 36; // right edge for delta labels
const TOP = 104;
const BOTTOM = 40;
const BAR_H = 26;
const BAR_GAP = 12;

const COLOR_A = "#3b82f6"; // You
const COLOR_B = "#8b5cf6"; // Comparison

export type CompareMetric = { label: string; a: number; b: number };

export default function CompareChart({
  gradeA,
  gradeB,
  metrics,
  colors,
  svgRef,
}: {
  gradeA: string;
  gradeB: string;
  metrics: CompareMetric[];
  colors: ThemeColors;
  svgRef?: React.Ref<SVGSVGElement>;
}) {
  const globalMax = Math.max(1, ...metrics.flatMap((m) => [m.a, m.b]));
  const scale = BAR_MAX / globalMax;
  const n = Math.max(1, metrics.length);
  const groupH = (H - TOP - BOTTOM) / n;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      role="img"
      aria-label={`Pay comparison: ${gradeA} vs ${gradeB}`}
      style={{ fontFamily: "Arial, Helvetica, sans-serif" }}
    >
      <rect x={0} y={0} width={W} height={H} fill={colors.card} rx={16} />

      {/* Title */}
      <text x={ML} y={42} fontSize={20} fontWeight={700} fill={colors.foreground}>
        Pay comparison
      </text>
      <text x={ML} y={64} fontSize={13} fill={colors.muted}>
        {gradeA} vs {gradeB} — same location, dependents, TSP &amp; special pays
      </text>

      {/* Legend */}
      <g>
        <rect x={ML} y={78} width={12} height={12} rx={2} fill={COLOR_A} />
        <text x={ML + 18} y={88} fontSize={12} fill={colors.foreground}>
          You ({gradeA})
        </text>
        <rect x={ML + 130} y={78} width={12} height={12} rx={2} fill={COLOR_B} />
        <text x={ML + 148} y={88} fontSize={12} fill={colors.foreground}>
          {gradeB}
        </text>
      </g>

      {metrics.map((m, i) => {
        const groupTop = TOP + i * groupH;
        const blockH = BAR_H * 2 + BAR_GAP;
        const barsTop = groupTop + (groupH - blockH) / 2;
        const wA = Math.max(2, m.a * scale);
        const wB = Math.max(2, m.b * scale);
        const d = m.b - m.a;
        const deltaColor = d < 0 ? "#ef4444" : "#15803d";
        return (
          <g key={m.label}>
            <text x={ML} y={groupTop + groupH / 2} fontSize={13} fontWeight={600} fill={colors.foreground}>
              {m.label}
            </text>

            {/* A bar */}
            <rect x={BAR_X} y={barsTop} width={wA} height={BAR_H} rx={3} fill={COLOR_A} />
            <text x={BAR_X + wA + 8} y={barsTop + BAR_H - 8} fontSize={12} fontWeight={600} fill={colors.foreground}>
              {fmtUSD0(m.a)}
            </text>

            {/* B bar */}
            <rect x={BAR_X} y={barsTop + BAR_H + BAR_GAP} width={wB} height={BAR_H} rx={3} fill={COLOR_B} />
            <text x={BAR_X + wB + 8} y={barsTop + BAR_H + BAR_GAP + BAR_H - 8} fontSize={12} fontWeight={600} fill={colors.foreground}>
              {fmtUSD0(m.b)}
            </text>

            {/* Delta */}
            <text x={RIGHT} y={groupTop + groupH / 2 + 4} textAnchor="end" fontSize={14} fontWeight={700} fill={deltaColor}>
              {d >= 0 ? "+" : "−"}
              {fmtUSD0(Math.abs(d))}
            </text>
          </g>
        );
      })}

      <text x={W / 2} y={H - 12} textAnchor="middle" fontSize={11} fill={colors.muted}>
        ActivePayOS · activepayos.com — estimates only; verify with your LES
      </text>
    </svg>
  );
}
