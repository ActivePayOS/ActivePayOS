// Cross-tool hand-off: the thread that makes Pay → Budget → Wealth Projector
// one continuous flow.
//
// The Pay Calculator silently snapshots the career-shaped inputs (grade, YOS,
// branch, TSP%) to localStorage as the user works; the Wealth Projector picks
// them up on load, and the journey strip (components/PlanFlow.tsx) uses the
// same snapshots to show which steps already have data. Everything stays in
// the browser — this is a hand-off, not telemetry.

import type { Track } from "@/data/promotion/timing";
import type { BranchId as TimingBranchId } from "@/data/promotion/timing";
import type { ProjectionExport } from "@/lib/export/projection";

export const PAY_SNAPSHOT_KEY = "activepayos:pay-snapshot:v1";
export const BUDGET_KEY = "activepayos:budget:v1";
export const PROJECTION_SNAPSHOT_KEY = "activepayos:projection-snapshot:v1";

export type PaySnapshot = {
  v: 1;
  generatedOn: string; // YYYY-MM-DD
  /** Promotion-timing branch id (mapped from the Pay Calculator's ids). */
  branch?: TimingBranchId;
  track: Track;
  /** Plain grade the Wealth Projector understands (E-1..E-9 / O-1..O-6). */
  grade: string;
  yos: number;
  tspPct: number;
  /** Official pay table year selected in the calculator. */
  payYear?: number;
  /** Monthly gross from the calculator, for the journey strip summary. */
  grossMonthly?: number;
  /** Current duty ZIP (BAH) — seeds the projector's Next-PCS trade space. */
  zip?: string;
  /** BAH with-dependents status from the calculator's family-size input. */
  dependents?: boolean;
  /** Duty-station allowance mode. Older snapshots omit this and remain stateside. */
  stationMode?: "stateside" | "oconus";
  /** Human-readable overseas duty location (no address is stored). */
  oconusLocation?: string;
  /** Current recurring monthly allowances copied from DTMO/LES. */
  ohaMonthly?: number;
  oconusColaMonthly?: number;
};

// Pay Calculator branch ids → promotion-timing branch ids.
const BRANCH_MAP: Record<string, TimingBranchId> = {
  army: "army",
  usmc: "marines",
  navy: "navy",
  usaf: "airforce",
  ussf: "spaceforce",
  uscg: "coastguard",
};

export function mapPayBranch(payBranchId: string | undefined | null): TimingBranchId | undefined {
  return payBranchId ? BRANCH_MAP[payBranchId] : undefined;
}

/**
 * Map a Pay Calculator grade (which includes pseudo/special grades) onto the
 * plain grade + track the career projection understands. Returns null for
 * grades outside the projector's model (warrant officers, cadets).
 */
export function mapPayGrade(payGrade: string): { grade: string; track: Track } | null {
  const g = (payGrade || "").trim();
  if (g === "E-1 <4mo") return { grade: "E-1", track: "enlisted" };
  if (/^E-[1-9]$/.test(g)) return { grade: g, track: "enlisted" };
  // Prior-enlisted officer grades pay differently but promote as officers.
  const oe = g.match(/^O-([1-3])E$/);
  if (oe) return { grade: `O-${oe[1]}`, track: "officer" };
  if (/^O-([1-9]|10)$/.test(g)) {
    // The projector models O-1..O-6; clamp flag/general grades to O-6.
    const n = Math.min(6, Number(g.split("-")[1]));
    return { grade: `O-${n}`, track: "officer" };
  }
  return null; // W-*, Cadet, anything unknown
}

function isSnapshot(x: unknown): x is PaySnapshot {
  if (!x || typeof x !== "object") return false;
  const s = x as Partial<PaySnapshot>;
  return (
    s.v === 1 &&
    typeof s.grade === "string" &&
    (s.track === "enlisted" || s.track === "officer") &&
    typeof s.yos === "number" &&
    typeof s.tspPct === "number"
  );
}

export function savePaySnapshot(s: Omit<PaySnapshot, "v" | "generatedOn">): boolean {
  if (typeof window === "undefined") return false;
  try {
    const snapshot: PaySnapshot = {
      v: 1,
      generatedOn: new Date().toISOString().slice(0, 10),
      ...s,
    };
    localStorage.setItem(PAY_SNAPSHOT_KEY, JSON.stringify(snapshot));
    return true;
  } catch {
    return false;
  }
}

export function loadPaySnapshot(): PaySnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PAY_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isSnapshot(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// ---- Wealth Projector snapshot ------------------------------------------
// The projector persists its latest computed report (debounced, silently —
// same spirit as the pay snapshot) so any page can export the projection
// without revisiting the tool.

export type ProjectionSnapshot = {
  v: 1;
  generatedOn: string; // YYYY-MM-DD
  export: ProjectionExport;
};

function isProjectionSnapshot(x: unknown): x is ProjectionSnapshot {
  if (!x || typeof x !== "object") return false;
  const s = x as Partial<ProjectionSnapshot>;
  if (s.v !== 1 || typeof s.generatedOn !== "string") return false;
  const e = s.export as Partial<ProjectionExport> | undefined;
  return (
    !!e &&
    typeof e === "object" &&
    !!e.scenario &&
    typeof e.scenario === "object" &&
    Array.isArray(e.years) &&
    Array.isArray(e.promotions) &&
    !!e.totals &&
    typeof e.totals === "object" &&
    typeof (e.totals as { final?: unknown }).final === "number"
  );
}

export function saveProjectionSnapshot(exportData: ProjectionExport): boolean {
  if (typeof window === "undefined") return false;
  try {
    const snapshot: ProjectionSnapshot = {
      v: 1,
      generatedOn: exportData.generatedOn || new Date().toISOString().slice(0, 10),
      export: exportData,
    };
    localStorage.setItem(PROJECTION_SNAPSHOT_KEY, JSON.stringify(snapshot));
    return true;
  } catch {
    return false;
  }
}

export function loadProjectionSnapshot(): ProjectionSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PROJECTION_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isProjectionSnapshot(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Does a saved budget exist on this device? (For the journey strip.) */
export function hasSavedBudget(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(BUDGET_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.income) && Array.isArray(parsed?.expenses);
  } catch {
    return false;
  }
}
