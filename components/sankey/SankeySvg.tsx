"use client";

import { useMemo, useState } from "react";
import type { SankeyGraph } from "@/lib/sankey/model";
import { fmtUSD0, POOL_ID } from "@/lib/sankey/model";
import type { ThemeColors } from "./useThemeColors";

// Hand-rolled SVG Sankey (COA A): zero dependencies, themed from CSS variables,
// and self-contained so it exports cleanly to SVG/PNG. The budget is a shallow,
// balanced DAG (income sources → pool → expense categories), so the layout is a
// straightforward column-stack with cubic-bezier ribbons.

const W = 920;
const H = 480;
const ML = 150; // left margin (room for income labels)
const MR = 150; // right margin (room for expense labels)
const MT = 46; // top margin (captions + pool label)
const MB = 34; // bottom margin (watermark)
const NODE_W = 18;
const PAD = 14; // vertical gap between stacked nodes
// Each side label is two stacked lines (name over $ amount). This is the minimum
// center-to-center spacing they need so adjacent labels never collide; thin nodes
// can sit closer than this, so labels are nudged apart and tethered with a leader.
const LABEL_MIN_GAP = 30;

const COL_X: Record<0 | 1 | 2, number> = {
  0: ML,
  1: (ML + (W - MR - NODE_W)) / 2,
  2: W - MR - NODE_W,
};

type Positioned = {
  id: string;
  label: string;
  column: 0 | 1 | 2;
  value: number;
  color: string;
  kind: SankeyGraph["nodes"][number]["kind"];
  x: number;
  y: number;
  h: number;
  cy: number;
};

type Ribbon = {
  key: string;
  d: string;
  color: string;
  sourceId: string;
  targetId: string;
};

function ribbonPath(sx: number, sy: number, tx: number, ty: number, w: number) {
  const cx1 = sx + (tx - sx) * 0.5;
  const cx2 = sx + (tx - sx) * 0.5;
  return [
    `M${sx},${sy}`,
    `C${cx1},${sy} ${cx2},${ty} ${tx},${ty}`,
    `L${tx},${ty + w}`,
    `C${cx2},${ty + w} ${cx1},${sy + w} ${sx},${sy + w}`,
    "Z",
  ].join(" ");
}

function layout(graph: SankeyGraph) {
  const T = Math.max(graph.totalIncome, graph.totalExpense);
  if (!(T > 0)) return null;

  const innerTop = MT;
  const availH = H - MB - innerTop;

  const byCol: Record<0 | 1 | 2, SankeyGraph["nodes"]> = { 0: [], 1: [], 2: [] };
  for (const n of graph.nodes) byCol[n.column].push(n);

  const maxCount = Math.max(byCol[0].length, byCol[1].length, byCol[2].length);
  const scale = (availH - (maxCount - 1) * PAD) / T;
  if (!(scale > 0)) return null;

  const positioned: Positioned[] = [];
  for (const c of [0, 1, 2] as const) {
    const colNodes = byCol[c];
    const colH = T * scale + (colNodes.length - 1) * PAD;
    let y = innerTop + (availH - colH) / 2;
    for (const n of colNodes) {
      const h = n.value * scale;
      positioned.push({ ...n, x: COL_X[c], y, h, cy: y + h / 2 });
      y += h + PAD;
    }
  }

  const map = new Map(positioned.map((p) => [p.id, p]));
  const pool = map.get(POOL_ID);
  if (!pool) return null;

  const ribbons: Ribbon[] = [];
  let inOff = pool.y; // incoming links stack on the pool's left edge
  let outOff = pool.y; // outgoing links stack on the pool's right edge

  // Inflows: each income/shortfall node → pool (full-height ribbon).
  for (const n of positioned.filter((p) => p.column === 0)) {
    ribbons.push({
      key: `${n.id}->${POOL_ID}`,
      d: ribbonPath(n.x + NODE_W, n.y, pool.x, inOff, n.h),
      color: n.color,
      sourceId: n.id,
      targetId: POOL_ID,
    });
    inOff += n.h;
  }
  // Outflows: pool → each expense/surplus node (full-height ribbon).
  for (const n of positioned.filter((p) => p.column === 2)) {
    ribbons.push({
      key: `${POOL_ID}->${n.id}`,
      d: ribbonPath(pool.x + NODE_W, outOff, n.x, n.y, n.h),
      color: n.color,
      sourceId: POOL_ID,
      targetId: n.id,
    });
    outOff += n.h;
  }

  return { positioned, ribbons };
}

// Spread label anchor points so no two collide, while keeping them as close to
// their node centers as possible. A forward pass enforces the minimum gap; if the
// stack overflows the bottom we slide it up and re-settle from the bottom edge.
function deOverlapLabels(
  nodes: Positioned[],
  top: number,
  bottom: number,
  minGap: number
): Map<string, number> {
  const sorted = [...nodes].sort((a, b) => a.cy - b.cy);
  const ys = sorted.map((n) => n.cy);

  for (let i = 1; i < ys.length; i++) {
    if (ys[i] < ys[i - 1] + minGap) ys[i] = ys[i - 1] + minGap;
  }

  const overflow = ys.length ? ys[ys.length - 1] - bottom : 0;
  if (overflow > 0) {
    for (let i = ys.length - 1; i >= 0; i--) {
      const ceiling = i === ys.length - 1 ? bottom : ys[i + 1] - minGap;
      if (ys[i] > ceiling) ys[i] = ceiling;
    }
  }

  if (ys.length && ys[0] < top) {
    let shift = top - ys[0];
    for (let i = 0; i < ys.length && shift > 0; i++) {
      ys[i] += shift;
      const next = i + 1 < ys.length ? ys[i + 1] : Infinity;
      shift = ys[i] + minGap > next ? ys[i] + minGap - next : 0;
    }
  }

  return new Map(sorted.map((n, i) => [n.id, ys[i]]));
}

export default function SankeySvg({
  graph,
  colors,
  svgRef,
  leftCaption = "INCOME",
  rightCaption = "WHERE IT GOES",
}: {
  graph: SankeyGraph;
  colors: ThemeColors;
  svgRef?: React.Ref<SVGSVGElement>;
  leftCaption?: string;
  rightCaption?: string;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const computed = useMemo(() => layout(graph), [graph]);

  if (!computed) {
    return (
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Empty budget">
        <rect x={0} y={0} width={W} height={H} fill={colors.card} rx={16} />
        <text x={W / 2} y={H / 2} textAnchor="middle" fill={colors.muted} fontSize={16}>
          Add some income and expenses to see your money flow.
        </text>
      </svg>
    );
  }

  const { positioned, ribbons } = computed;

  // Side-label anchors, de-collided independently per side so the name/$ pairs
  // never overlap each other (thin nodes would otherwise stack their labels).
  const labelTop = MT + 12;
  const labelBottom = H - MB - 6;
  const leftLabelY = deOverlapLabels(
    positioned.filter((n) => n.column === 0),
    labelTop,
    labelBottom,
    LABEL_MIN_GAP
  );
  const rightLabelY = deOverlapLabels(
    positioned.filter((n) => n.column === 2),
    labelTop,
    labelBottom,
    LABEL_MIN_GAP
  );

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      role="img"
      aria-label="Sankey diagram of your monthly budget"
      style={{ fontFamily: "Arial, Helvetica, sans-serif" }}
    >
      <rect x={0} y={0} width={W} height={H} fill={colors.card} rx={16} />

      {/* Column captions */}
      <text x={ML} y={22} textAnchor="end" fontSize={12} fill={colors.muted} letterSpacing="0.08em">
        {leftCaption}
      </text>
      <text
        x={W - MR + NODE_W}
        y={22}
        textAnchor="start"
        fontSize={12}
        fill={colors.muted}
        letterSpacing="0.08em"
      >
        {rightCaption}
      </text>

      {/* Ribbons */}
      <g>
        {ribbons.map((r) => {
          const active = hovered === null || r.sourceId === hovered || r.targetId === hovered;
          return (
            <path
              key={r.key}
              d={r.d}
              fill={r.color}
              fillOpacity={active ? 0.5 : 0.12}
              style={{ transition: "fill-opacity 120ms" }}
            />
          );
        })}
      </g>

      {/* Nodes */}
      <g>
        {positioned.map((n) => (
          <rect
            key={n.id}
            x={n.x}
            y={n.y}
            width={NODE_W}
            height={Math.max(1, n.h)}
            fill={n.color}
            rx={2}
            onMouseEnter={() => setHovered(n.id)}
            onMouseLeave={() => setHovered(null)}
            style={{ cursor: "pointer" }}
          />
        ))}
      </g>

      {/* Labels */}
      <g>
        {positioned.map((n) => {
          if (n.column === 1) {
            // pool: label above the node
            return (
              <g key={`lbl-${n.id}`}>
                <text x={n.x + NODE_W / 2} y={n.y - 16} textAnchor="middle" fontSize={13} fontWeight={700} fill={colors.foreground}>
                  {n.label}
                </text>
                <text x={n.x + NODE_W / 2} y={n.y - 3} textAnchor="middle" fontSize={11} fill={colors.muted}>
                  {fmtUSD0(n.value)}
                </text>
              </g>
            );
          }
          const left = n.column === 0;
          const tx = left ? n.x - 8 : n.x + NODE_W + 8;
          const anchor = left ? "end" : "start";
          const labelCy = (left ? leftLabelY : rightLabelY).get(n.id) ?? n.cy;
          const edgeX = left ? n.x : n.x + NODE_W;
          const leadX = left ? n.x - 6 : n.x + NODE_W + 6;
          const displaced = Math.abs(labelCy - n.cy) > 1.5;
          return (
            <g key={`lbl-${n.id}`}>
              {displaced && (
                <path
                  d={`M${edgeX},${n.cy} L${leadX},${labelCy}`}
                  stroke={colors.line}
                  strokeWidth={1}
                  fill="none"
                />
              )}
              <text x={tx} y={labelCy - 3} textAnchor={anchor} fontSize={12.5} fontWeight={600} fill={colors.foreground}>
                {n.label}
              </text>
              <text x={tx} y={labelCy + 12} textAnchor={anchor} fontSize={11} fill={colors.muted}>
                {fmtUSD0(n.value)}
              </text>
            </g>
          );
        })}
      </g>

      {/* Branding + disclaimer baked into the export */}
      <text x={W / 2} y={H - 11} textAnchor="middle" fontSize={11} fill={colors.muted}>
        ActivePayOS · activepayos.com — estimates only; verify with your LES
      </text>
    </svg>
  );
}
