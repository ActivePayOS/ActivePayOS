"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

// Design Lab — three candidate UI directions for the site overhaul, rendered
// over the same sample scenario so they compare fairly. Unlisted and
// noindexed; this page exists for the maintainers to flip through options
// (including on phones) before one direction is applied site-wide.
//
// Sample scenario used everywhere: Marine Corps E-5 @ 6 YOS, ZIP 92134,
// single, 5% TSP with BRS match, staying 5 more years, projecting to age 60.

const emptySubscribe = () => () => {};

type Variant = "paper" | "cockpit" | "guided";

const VARIANTS: { key: Variant; label: string; tagline: string }[] = [
  {
    key: "paper",
    label: "A · Paper",
    tagline: "Calm and minimal — almost no chrome; every explanation lives behind an ⓘ.",
  },
  {
    key: "cockpit",
    label: "B · Cockpit",
    tagline: "Data-forward dashboard — stat tiles, dense grids, hover anything for depth.",
  },
  {
    key: "guided",
    label: "C · Guided",
    tagline: "One question at a time — a conversational flow with context on demand.",
  },
];

// ---- Shared sample data ----------------------------------------------------
const D = {
  grade: "E-5",
  yos: 6,
  branch: "Marine Corps",
  zip: "92134",
  base: 4110,
  bah: 3975,
  bas: 477,
  gross: 8562,
  takeHome: 7139,
  tspMonthly: 411, // you + match
  sep: { year: 2031, amount: 64349 },
  age60: { year: 2064, amount: 1573414, real: 615653 },
};

const usd = (n: number) => `$${Math.round(n).toLocaleString()}`;

const EXPLAIN = {
  gross:
    "Base Pay + BAH + BAS — gross monthly military compensation before taxes and deductions. BAH and BAS are generally not taxed.",
  takeHome:
    "Gross minus estimated federal tax, FICA, TSP contribution, and SGLI — what actually lands in the bank.",
  base: "From the 2026 DFAS pay table for E-5 at 6 years of service.",
  bah: "Housing allowance for ZIP 92134 (San Diego), without dependents. Non-taxable.",
  bas: "Standard food allowance, enlisted rate. Non-taxable.",
  tsp: "Your 5% of base pay plus the full 5% BRS agency contribution — it rises with every promotion and pay raise.",
  sep: "Projected combined balance (TSP + investments + savings) the year you separate.",
  age60:
    "The same money left invested to age 60 at long-run fund returns — most of it is growth, not new contributions.",
};

// ---- ⓘ popover: hover on desktop, tap (focus) on mobile --------------------
function InfoDot({ text, dark = false }: { text: string; dark?: boolean }) {
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-label={text}
        className={`inline-flex h-4 w-4 items-center justify-center rounded-full border text-[10px] font-semibold leading-none transition ${
          dark
            ? "border-slate-500 text-slate-400 hover:border-slate-300 hover:text-slate-200"
            : "border-gray-300 text-gray-400 hover:border-gray-500 hover:text-gray-700"
        }`}
      >
        i
      </button>
      <span
        role="tooltip"
        className="pointer-events-none invisible absolute left-1/2 top-full z-30 mt-2 w-64 max-w-[75vw] -translate-x-1/2 rounded-xl bg-slate-900 px-3 py-2 text-left text-[11px] font-normal leading-4 text-slate-100 opacity-0 shadow-lg transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}

// ============================================================================
// A · PAPER — calm minimal. No cards, hairline dividers, generous whitespace.
// ============================================================================
function PaperVariant() {
  return (
    <div className="rounded-3xl border bg-white px-6 py-10 shadow-sm md:px-14 md:py-14">
      <p className="text-xs uppercase tracking-[0.2em] text-gray-400">Pay Calculator</p>
      <h2 className="mt-2 text-3xl font-light tracking-tight md:text-4xl">
        {D.branch} · {D.grade} · {D.yos} years
      </h2>

      {/* Inputs as quiet inline controls */}
      <div className="mt-8 flex flex-wrap gap-x-10 gap-y-5 text-sm">
        {(
          [
            ["Rank", D.grade],
            ["Years of service", String(D.yos)],
            ["Duty ZIP", D.zip],
            ["Filing", "Single"],
          ] as const
        ).map(([label, value]) => (
          <label key={label} className="block">
            <span className="block text-[11px] uppercase tracking-wide text-gray-400">
              {label}
            </span>
            <select
              className="mt-1 border-0 border-b border-gray-300 bg-transparent py-1 pr-6 text-base focus:border-gray-900 focus:outline-none focus:ring-0"
              defaultValue={value}
              aria-label={label}
            >
              <option>{value}</option>
            </select>
          </label>
        ))}
      </div>

      <hr className="my-10 border-gray-200" />

      {/* One number, then dotted-leader lines */}
      <div className="flex items-baseline gap-3">
        <span className="text-5xl font-light tracking-tight md:text-6xl">{usd(D.gross)}</span>
        <span className="text-sm text-gray-500">/ month</span>
        <InfoDot text={EXPLAIN.gross} />
      </div>
      <p className="mt-2 flex items-center gap-2 text-sm text-gray-500">
        {`≈ ${usd(D.takeHome)} take-home`}
        <InfoDot text={EXPLAIN.takeHome} />
      </p>

      <dl className="mt-8 max-w-md space-y-3 text-sm">
        {(
          [
            ["Base pay", D.base, EXPLAIN.base],
            ["Housing (BAH)", D.bah, EXPLAIN.bah],
            ["Food (BAS)", D.bas, EXPLAIN.bas],
            ["Into TSP monthly", D.tspMonthly, EXPLAIN.tsp],
          ] as const
        ).map(([label, value, why]) => (
          <div key={label} className="flex items-baseline gap-2">
            <dt className="flex items-center gap-1.5 text-gray-600">
              {label}
              <InfoDot text={why} />
            </dt>
            <span className="mx-1 flex-1 border-b border-dotted border-gray-300" />
            <dd className="font-medium tabular-nums">{usd(value)}</dd>
          </div>
        ))}
      </dl>

      <hr className="my-10 border-gray-200" />

      <div className="flex flex-wrap items-baseline gap-x-10 gap-y-4">
        <div>
          <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-gray-400">
            At separation · {D.sep.year} <InfoDot text={EXPLAIN.sep} />
          </p>
          <p className="mt-1 text-2xl font-light">{usd(D.sep.amount)}</p>
        </div>
        <div>
          <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-gray-400">
            Left invested to age 60 <InfoDot text={EXPLAIN.age60} />
          </p>
          <p className="mt-1 text-2xl font-light">{usd(D.age60.amount)}</p>
        </div>
        <a href="#" className="ml-auto text-sm font-medium underline underline-offset-4">
          Build the budget →
        </a>
      </div>
    </div>
  );
}

// ============================================================================
// B · COCKPIT — data-forward dashboard. Tiles, density, hover everything.
// ============================================================================
function CockpitVariant() {
  const tiles = [
    { label: "Gross / mo", value: usd(D.gross), why: EXPLAIN.gross, accent: "#38bdf8" },
    { label: "Take-home / mo", value: usd(D.takeHome), why: EXPLAIN.takeHome, accent: "#4ade80" },
    { label: "TSP flow / mo", value: usd(D.tspMonthly), why: EXPLAIN.tsp, accent: "#a78bfa" },
    { label: `By ${D.sep.year} (ETS)`, value: usd(D.sep.amount), why: EXPLAIN.sep, accent: "#fbbf24" },
  ];
  const mix = [
    { label: "Base", v: D.base, c: "#38bdf8" },
    { label: "BAH", v: D.bah, c: "#4ade80" },
    { label: "BAS", v: D.bas, c: "#fbbf24" },
  ];
  const mixTotal = mix.reduce((a, m) => a + m.v, 0);
  // Simple projection sparkline points (log-ish growth to age 60).
  const spark = [64, 92, 138, 210, 320, 480, 700, 1020, 1573];

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-700 bg-slate-900 text-slate-100 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700/70 px-5 py-3">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold">
            {D.grade} · {D.yos} YOS · {D.zip}
          </span>
          <span className="rounded-full bg-slate-700/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-300">
            {D.branch}
          </span>
        </div>
        <div className="flex gap-1 text-xs">
          {["Summary", "Visuals", "Compare", "Table"].map((t, i) => (
            <button
              key={t}
              type="button"
              className={`rounded-full px-3 py-1 font-medium ${
                i === 0 ? "bg-slate-100 text-slate-900" : "text-slate-400 hover:text-slate-100"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px bg-slate-700/50 lg:grid-cols-4">
        {tiles.map((t) => (
          <div
            key={t.label}
            title={t.why}
            className="cursor-help bg-slate-900 px-5 py-4 transition hover:bg-slate-800/80"
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-400">
              {t.label}
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums" style={{ color: t.accent }}>
              {t.value}
            </p>
          </div>
        ))}
      </div>

      <div className="grid gap-px bg-slate-700/50 lg:grid-cols-2">
        {/* Pay mix bar */}
        <div className="bg-slate-900 px-5 py-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-400">
            Monthly pay mix
          </p>
          <div className="mt-3 flex h-4 w-full overflow-hidden rounded-full">
            {mix.map((m) => (
              <div
                key={m.label}
                title={`${m.label}: ${usd(m.v)} (${Math.round((m.v / mixTotal) * 100)}%)`}
                className="cursor-help transition hover:opacity-80"
                style={{ width: `${(m.v / mixTotal) * 100}%`, backgroundColor: m.c }}
              />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400">
            {mix.map((m) => (
              <span key={m.label} className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: m.c }} />
                {m.label} {usd(m.v)}
              </span>
            ))}
          </div>
        </div>

        {/* Projection sparkline */}
        <div className="bg-slate-900 px-5 py-4">
          <p className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-400">
            <span>Net worth → age 60</span>
            <span className="cursor-help text-slate-500" title={EXPLAIN.age60}>
              {`${usd(D.age60.amount)} nominal · ${usd(D.age60.real)} today's $`}
            </span>
          </p>
          <svg viewBox="0 0 300 64" className="mt-3 block w-full" aria-label="Projected net worth sparkline">
            <polyline
              fill="none"
              stroke="#38bdf8"
              strokeWidth={2.5}
              points={spark
                .map((v, i) => `${(i / (spark.length - 1)) * 292 + 4},${60 - (v / 1573) * 54}`)
                .join(" ")}
            />
            <line x1={(2 / 8) * 292 + 4} x2={(2 / 8) * 292 + 4} y1={4} y2={60} stroke="#f87171" strokeWidth={1} strokeDasharray="3 3" />
            <text x={(2 / 8) * 292 + 8} y={12} fontSize={8} fill="#f87171">
              ETS
            </text>
          </svg>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-700/70 px-5 py-3 text-xs text-slate-400">
        <span>Hover any figure for how it&apos;s computed · long-press on mobile</span>
        <div className="flex gap-2">
          <button className="rounded-full bg-slate-100 px-3 py-1.5 font-semibold text-slate-900" type="button">
            Send to Budget →
          </button>
          <button className="rounded-full border border-slate-600 px-3 py-1.5 font-medium text-slate-200" type="button">
            Project wealth →
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// C · GUIDED — conversational stepper. One question at a time, context on tap.
// ============================================================================
function GuidedVariant() {
  const steps = [
    {
      q: "Who are you?",
      a: `${D.branch} ${D.grade}, ${D.yos} years in`,
      detail:
        "Rank and time in service pick the row in the DFAS pay table. Branch only changes which special pays we offer and the promotion schedule.",
    },
    {
      q: "Where are you stationed?",
      a: `ZIP ${D.zip} · no dependents`,
      detail: EXPLAIN.bah,
    },
    {
      q: "What are you saving?",
      a: "5% of base pay to TSP (full BRS match)",
      detail: EXPLAIN.tsp,
    },
    {
      q: "How long are you staying in?",
      a: `5 more years · then project to age 60`,
      detail: EXPLAIN.age60,
    },
  ];

  return (
    <div className="rounded-3xl border bg-white p-6 shadow-sm md:p-10">
      <ol className="relative space-y-6 border-l-2 border-gray-200 pl-6 md:pl-8">
        {steps.map((s, i) => (
          <li key={s.q} className="relative">
            <span className="absolute -left-[31px] flex h-6 w-6 items-center justify-center rounded-full bg-gray-900 text-[11px] font-bold text-white md:-left-[39px]">
              {i + 1}
            </span>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              {s.q}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-[var(--field-bg)] px-3 py-1.5 text-sm font-medium text-[var(--field-text)]">
                {s.a}
              </span>
              <button type="button" className="text-xs text-gray-400 underline underline-offset-2">
                change
              </button>
            </div>
            <details className="mt-1.5">
              <summary className="cursor-pointer list-none text-xs text-gray-400 hover:text-gray-600">
                Why this matters ▾
              </summary>
              <p className="mt-1 max-w-md text-xs leading-5 text-gray-500">{s.detail}</p>
            </details>
          </li>
        ))}

        <li className="relative">
          <span className="absolute -left-[31px] flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-[11px] font-bold text-white md:-left-[39px]">
            ✓
          </span>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            Your answer
          </p>
          <div className="mt-2 max-w-md rounded-2xl bg-gray-50 p-5">
            <p className="text-sm text-gray-500">You make</p>
            <p className="text-3xl font-bold tracking-tight">{`${usd(D.gross)}/mo`}</p>
            <p className="mt-1 text-sm text-gray-500">{`${usd(D.takeHome)} after taxes and TSP`}</p>
            <div className="my-4 border-t" />
            <p className="text-sm text-gray-500">If you leave in {D.sep.year} you walk with</p>
            <p className="text-2xl font-bold tracking-tight">{usd(D.sep.amount)}</p>
            <p className="mt-1 text-sm text-gray-500">
              {`…which becomes ${usd(D.age60.amount)} at age 60, untouched.`}
            </p>
            <button
              type="button"
              className="mt-5 w-full rounded-full bg-gray-900 py-3 text-sm font-semibold text-white transition hover:bg-gray-700"
            >
              Now build my budget →
            </button>
            <button
              type="button"
              className="mt-2 w-full rounded-full border py-2.5 text-sm font-medium text-gray-600"
            >
              Or explore the full projection
            </button>
          </div>
        </li>
      </ol>
    </div>
  );
}

// ---- Direction notes shown under each variant ------------------------------
const NOTES: Record<Variant, { pros: string[]; mobile: string }> = {
  paper: {
    pros: [
      "Least ink on screen — one number owns the page, everything else whispers.",
      "All context is opt-in via ⓘ (hover on desktop, tap on mobile) — zero helper-text clutter.",
      "Feels editorial and trustworthy; works well for screenshots and sharing.",
    ],
    mobile: "Single column with the same ⓘ taps; dotted-leader rows wrap cleanly.",
  },
  cockpit: {
    pros: [
      "Most information per screen — tiles + mix bar + projection at a glance.",
      "Every figure is hoverable for its formula; power users never leave the page.",
      "Distinct visual identity (dark panel) that makes the tools feel like instruments.",
    ],
    mobile: "Tiles fall into a 2-column grid; tooltips become long-press; tabs scroll horizontally.",
  },
  guided: {
    pros: [
      "Lowest cognitive load for first-time users — one decision at a time.",
      "Context lives in 'why this matters' disclosures, so the path stays clean.",
      "Naturally narrates the Pay → Budget → Project journey with a single CTA.",
    ],
    mobile: "Mobile-first by construction — it's already a vertical flow with tap disclosures.",
  },
};

export default function DesignLabClient() {
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);
  // Remember the last-viewed option between visits (read lazily; the UI only
  // renders after mount, so there is no hydration mismatch).
  const [variant, setVariant] = useState<Variant>(() => {
    if (typeof window === "undefined") return "paper";
    try {
      const saved = localStorage.getItem("apo-design-lab");
      return saved === "cockpit" || saved === "guided" ? saved : "paper";
    } catch {
      return "paper";
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("apo-design-lab", variant);
    } catch {
      /* ignore */
    }
  }, [variant]);

  const active = VARIANTS.find((v) => v.key === variant)!;

  return (
    <main className="space-y-6">
      <header className="rounded-3xl border bg-white p-6 shadow-sm md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Design Lab</h1>
            <p className="mt-1 max-w-2xl text-sm text-gray-600">
              Three candidate directions for the UI overhaul, rendered over the same sample
              scenario (Marine E-5, 6 YOS, San Diego, staying 5 more years). Flip through below —
              try it on a phone too — and tell us which one to build out.
            </p>
          </div>
          <span className="rounded-full border bg-gray-50 px-3 py-1 text-xs text-gray-600">
            Internal preview — not linked or indexed
          </span>
        </div>
      </header>

      {!mounted ? (
        <div className="rounded-3xl border bg-white p-10 text-center text-sm text-gray-500 shadow-sm">
          Loading…
        </div>
      ) : (
        <>
          {/* Sticky switcher */}
          <div className="sticky top-16 z-30 rounded-2xl border bg-white p-2 shadow-md">
            <div className="flex flex-wrap items-center gap-2">
              {VARIANTS.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => setVariant(v.key)}
                  aria-pressed={variant === v.key}
                  className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                    variant === v.key
                      ? "bg-gray-900 text-white"
                      : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  {v.label}
                </button>
              ))}
              <p className="hidden min-w-0 flex-1 truncate pl-2 text-xs text-gray-500 md:block">
                {active.tagline}
              </p>
            </div>
          </div>

          {variant === "paper" && <PaperVariant />}
          {variant === "cockpit" && <CockpitVariant />}
          {variant === "guided" && <GuidedVariant />}

          {/* Direction notes */}
          <section className="rounded-3xl border bg-gray-50 p-6">
            <h2 className="text-sm font-semibold text-gray-800">
              {`What "${active.label}" means if we build it out`}
            </h2>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-6 text-gray-600">
              {NOTES[variant].pros.map((p) => (
                <li key={p}>{p}</li>
              ))}
              <li>
                <strong>On mobile:</strong> {NOTES[variant].mobile}
              </li>
            </ul>
            <p className="mt-4 text-xs text-gray-500">
              All three keep the privacy stance, the journey strip, the disclaimers, and the data
              sources exactly as they are — this is purely the presentation layer. Mixing is
              allowed (e.g. Paper for calculators + Cockpit for the projector&apos;s charts).
            </p>
          </section>
        </>
      )}
    </main>
  );
}
