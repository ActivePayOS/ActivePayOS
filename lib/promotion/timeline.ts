// lib/promotion/timeline.ts
// Pure, client-safe engine that turns contract details into an ordered list of
// promotion + milestone events with projected dates and base pay. Date "now" is
// passed in (todayISO) so the function stays deterministic and testable.

import {
  BranchId,
  Track,
  BRANCHES,
  stepsForTrack,
} from "@/data/promotion/timing";
import { BasePayDataset, basePayFor } from "@/lib/pay/basepay-lookup";

export type TimelineInputs = {
  branch: BranchId;
  track: Track;
  startGrade: string;
  accessionDate: string; // YYYY-MM-DD (date entered service / commissioned)
  contractYears: number;
  todayISO: string; // YYYY-MM-DD
};

export type EventKind =
  | "start"
  | "promotion"
  | "early-promotion"
  | "gi-bill"
  | "service"
  | "retirement"
  | "today";

type TimelineEvent = {
  id: string;
  dateISO: string;
  sinceStart: string; // "3 yr 2 mo"
  monthsFromStart: number;
  kind: EventKind;
  title: string;
  detail?: string;
  grade?: string;
  monthlyBasePay?: number | null;
  payDelta?: number | null;
  estimate: boolean;
  past: boolean; // before todayISO
};

export type TimelineResult = {
  events: TimelineEvent[];
  etsDateISO: string;
  retirementDateISO: string;
  startGrade: string;
  finalGrade: string;
  branchLabel: string;
  earlyPromotionLabel: string;
  source: { label: string; url: string };
};

// ---- date helpers (UTC, no argless Date) --------------------------------

function parseISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y || 1970, (m || 1) - 1, d || 1));
}
function toISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}
function addMonths(iso: string, months: number): string {
  const d = parseISO(iso);
  d.setUTCMonth(d.getUTCMonth() + months);
  return toISO(d);
}
function addDays(iso: string, days: number): string {
  const d = parseISO(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toISO(d);
}
function ymBetween(aISO: string, bISO: string): { months: number; label: string } {
  const a = parseISO(aISO);
  const b = parseISO(bISO);
  let months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  if (b.getUTCDate() < a.getUTCDate()) months -= 1;
  const sign = months < 0 ? "-" : "";
  const abs = Math.abs(months);
  const yr = Math.floor(abs / 12);
  const mo = abs % 12;
  const parts: string[] = [];
  if (yr) parts.push(`${yr} yr`);
  parts.push(`${mo} mo`);
  return { months, label: `${sign}${parts.join(" ")}` };
}

function gradeRank(grade: string): number {
  const m = grade.match(/(\d+)/);
  return m ? Number(m[1]) : 0;
}

// ---- engine -------------------------------------------------------------

export function buildPromotionTimeline(
  inputs: TimelineInputs,
  dataset: BasePayDataset
): TimelineResult {
  const branch = BRANCHES[inputs.branch];
  const accession = inputs.accessionDate;
  const today = inputs.todayISO;
  const events: TimelineEvent[] = [];

  const make = (
    partial: Omit<TimelineEvent, "sinceStart" | "monthsFromStart" | "past">
  ): TimelineEvent => {
    const ym = ymBetween(accession, partial.dateISO);
    return {
      ...partial,
      monthsFromStart: ym.months,
      sinceStart: ym.label,
      past: partial.dateISO < today,
    };
  };

  // Service start (service month 0 — an E-1 start shows the reduced
  // first-4-months rate).
  const startPay = basePayFor(dataset, inputs.startGrade, 0, 0);
  events.push(
    make({
      id: "start",
      dateISO: accession,
      kind: "start",
      title: `Enter service as ${inputs.startGrade}`,
      detail: `${branch.label} - estimated path from this point forward.`,
      grade: inputs.startGrade,
      monthlyBasePay: startPay,
      payDelta: null,
      estimate: false,
    })
  );

  // Promotions (only grades above the starting grade)
  const startRank = gradeRank(inputs.startGrade);
  const steps = stepsForTrack(inputs.branch, inputs.track).filter(
    (s) => gradeRank(s.toGrade) > startRank
  );

  let prevPay = startPay;
  let prevTisMonths = 0; // TIS at which the prior grade is held
  let finalGrade = inputs.startGrade;
  for (const step of steps) {
    const dateISO = addMonths(accession, step.tisMonths);
    const years = step.tisMonths / 12;
    const pay = basePayFor(dataset, step.toGrade, years);
    const delta = pay != null && prevPay != null ? pay - prevPay : null;

    // Early-promotion window — only meaningful if it lands AFTER you've earned
    // the prior grade (otherwise it collides with the previous promotion).
    if (step.earlyMonths && step.tisMonths - step.earlyMonths > prevTisMonths) {
      const earlyISO = addMonths(accession, step.tisMonths - step.earlyMonths);
      events.push(
        make({
          id: `early-${step.toGrade}`,
          dateISO: earlyISO,
          kind: "early-promotion",
          title: `Earliest ${step.toGrade} (${branch.earlyPromotionLabel})`,
          detail: `Top performers may pin ${step.toGrade} ~${step.earlyMonths} months early.`,
          grade: step.toGrade,
          monthlyBasePay: basePayFor(dataset, step.toGrade, (step.tisMonths - step.earlyMonths) / 12),
          payDelta: null,
          estimate: true,
        })
      );
    }

    events.push(
      make({
        id: `promo-${step.toGrade}`,
        dateISO,
        kind: "promotion",
        title: `Promote to ${step.toGrade}`,
        detail: step.competitive
          ? `${step.note ?? ""} Earliest typical eligibility.`.trim()
          : step.note,
        grade: step.toGrade,
        monthlyBasePay: pay,
        payDelta: delta,
        estimate: !!step.competitive,
      })
    );

    prevPay = pay;
    prevTisMonths = step.tisMonths;
    finalGrade = step.toGrade;
  }

  // Milestones
  const etsISO = addMonths(accession, Math.round(inputs.contractYears * 12));
  const retirementISO = addMonths(accession, 240);

  events.push(
    make({
      id: "gi-initial",
      dateISO: addDays(accession, 90),
      kind: "gi-bill",
      title: "Post-9/11 GI Bill: initial eligibility",
      detail: "About 90 days of active service reaches the 50% benefit tier.",
      estimate: true,
    })
  );
  events.push(
    make({
      id: "gi-100",
      dateISO: addMonths(accession, 36),
      kind: "gi-bill",
      title: "Post-9/11 GI Bill: 100% tier",
      detail: "36 months of aggregate active service reaches the full benefit.",
      estimate: true,
    })
  );
  events.push(
    make({
      id: "tsp-vest",
      dateISO: addMonths(accession, 24),
      kind: "service",
      title: "TSP automatic 1% vested",
      detail: "Government automatic 1% contribution vests at 2 years of service.",
      estimate: false,
    })
  );

  // Reenlistment window (only if it lands meaningfully after start)
  const reenlistISO = addMonths(etsISO, -12);
  if (reenlistISO > accession) {
    events.push(
      make({
        id: "reenlist",
        dateISO: reenlistISO,
        kind: "service",
        title: "Reenlistment window (typical)",
        detail: "Reenlistment commonly opens ~12 months before contract end.",
        estimate: true,
      })
    );
  }

  events.push(
    make({
      id: "ets",
      dateISO: etsISO,
      kind: "service",
      title: "Contract end (ETS / EAOS)",
      detail: `End of the ${inputs.contractYears}-year service commitment.`,
      estimate: false,
    })
  );
  events.push(
    make({
      id: "brs-cont",
      dateISO: addMonths(accession, 144),
      kind: "service",
      title: "BRS continuation pay decision (~12 yr)",
      detail: "Blended Retirement System continuation pay is offered around 12 years.",
      estimate: true,
    })
  );
  events.push(
    make({
      id: "retire",
      dateISO: retirementISO,
      kind: "retirement",
      title: "Active-duty retirement eligibility (20 yr)",
      detail: "20 years of active service reaches retirement eligibility.",
      estimate: false,
    })
  );

  // Today marker (only if within the projected span)
  events.push(
    make({
      id: "today",
      dateISO: today,
      kind: "today",
      title: "Today",
      estimate: false,
    })
  );

  // Sort by date, then by a stable kind priority for same-day ties.
  const kindOrder: Record<EventKind, number> = {
    start: 0,
    today: 1,
    "early-promotion": 2,
    promotion: 3,
    "gi-bill": 4,
    service: 5,
    retirement: 6,
  };
  events.sort((a, b) => {
    if (a.dateISO !== b.dateISO) return a.dateISO < b.dateISO ? -1 : 1;
    return kindOrder[a.kind] - kindOrder[b.kind];
  });

  // Officer promotion timing is governed by DOPMA (uniform across services);
  // reflect that in the cited source rather than the branch's enlisted portal.
  const source =
    inputs.track === "officer"
      ? { label: `${branch.label} officer promotions (DOPMA-based)`, url: branch.source.url }
      : branch.source;

  return {
    events,
    etsDateISO: etsISO,
    retirementDateISO: retirementISO,
    startGrade: inputs.startGrade,
    finalGrade,
    branchLabel: branch.label,
    earlyPromotionLabel: branch.earlyPromotionLabel,
    source,
  };
}
