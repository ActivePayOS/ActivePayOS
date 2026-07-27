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
const LABEL_TOP = 58;
const LABEL_BOTTOM = H - MB - 12;

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

type LabelPosition = {
  y: number;
  labelSize: number;
  valueSize: number;
  twoLine: boolean;
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

function fitLabel(label: string, maxChars: number) {
  return label.length > maxChars ? `${label.slice(0, Math.max(0, maxChars - 1))}…` : label;
}

function sideLabelLayout(nodes: Positioned[]) {
  const sorted = [...nodes].sort((a, b) => a.cy - b.cy);
  const count = sorted.length;
  const range = LABEL_BOTTOM - LABEL_TOP;
  const twoLine = count <= 10 && (count <= 1 || range / (count - 1) >= 30);
  const desiredGap = twoLine ? 36 : 18;
  const minGap = count <= 1 ? desiredGap : Math.min(desiredGap, range / (count - 1));
  const labelSize = minGap < 18 ? 9 : minGap < 24 ? 10.5 : 12.5;
  const valueSize = minGap < 18 ? 0 : minGap < 24 ? 9 : 11;
  const topPad = twoLine ? 3 : 0;
  const bottomPad = twoLine ? 12 : 0;

  const placed = sorted.map((n) => ({
    node: n,
    y: Math.max(LABEL_TOP + topPad, Math.min(LABEL_BOTTOM - bottomPad, n.cy)),
  }));

  for (let i = 1; i < placed.length; i += 1) {
    placed[i].y = Math.max(placed[i].y, placed[i - 1].y + minGap);
  }

  const overflow = placed.length ? placed[placed.length - 1].y - (LABEL_BOTTOM - bottomPad) : 0;
  if (overflow > 0) {
    for (const item of placed) item.y -= overflow;
  }

  for (let i = placed.length - 2; i >= 0; i -= 1) {
    placed[i].y = Math.min(placed[i].y, placed[i + 1].y - minGap);
  }

  const underflow = placed.length ? LABEL_TOP + topPad - placed[0].y : 0;
  if (underflow > 0) {
    for (const item of placed) item.y += underflow;
  }

  return new Map<string, LabelPosition>(
    placed.map(({ node, y }) => [node.id, { y, labelSize, valueSize, twoLine }])
  );
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
  const leftLabelPositions = sideLabelLayout(positioned.filter((n) => n.column === 0));
  const rightLabelPositions = sideLabelLayout(positioned.filter((n) => n.column === 2));

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
          const labelPosition = (left ? leftLabelPositions : rightLabelPositions).get(n.id);
          const labelY = labelPosition?.y ?? n.cy;
          const labelSize = labelPosition?.labelSize ?? 12.5;
          const valueSize = labelPosition?.valueSize ?? 11;
          const twoLine = labelPosition?.twoLine ?? true;
          const label = fitLabel(n.label, left ? 24 : 20);
          const shifted = Math.abs(labelY - n.cy) > 8;
          // Anti-overlap spreading can move a label well away from its band, so
          // every label carries a color chip and any leader line is drawn in
          // the node's own color — the label ↔ band mapping stays readable even
          // when a small node (SGLI) sits beside a big one (TSP).
          const chipCy = twoLine ? labelY - 7 : labelY;
          const textX = left ? tx - 12 : tx + 12;
          return (
            <g key={`lbl-${n.id}`}>
              {shifted && (
                <path
                  d={`M${left ? n.x : n.x + NODE_W},${n.cy} L${left ? tx + 4 : tx - 4},${chipCy}`}
                  stroke={n.color}
                  strokeOpacity={0.55}
                  strokeWidth={1.5}
                  fill="none"
                />
              )}
              <rect
                x={left ? tx - 8 : tx}
                y={chipCy - 4}
                width={8}
                height={8}
                rx={2}
                fill={n.color}
              />
              <text
                x={textX}
                y={twoLine ? labelY - 3 : labelY + 4}
                textAnchor={anchor}
                fontSize={labelSize}
                fontWeight={600}
                fill={colors.foreground}
              >
                {label}
                {label !== n.label ? <title>{n.label}</title> : null}
              </text>
              {twoLine && valueSize > 0 ? (
                <text x={textX} y={labelY + 12} textAnchor={anchor} fontSize={valueSize} fill={colors.muted}>
                  {fmtUSD0(n.value)}
                </text>
              ) : null}
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
