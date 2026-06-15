// data/promotion/timing.ts
//
// Active-duty promotion timing by branch, used by the Promotion & Milestone
// Timeline tool. These are PLANNING ESTIMATES based on typical, widely published
// time-in-service (TIS) / time-in-grade (TIG) points. Junior grades are largely
// time-based and fairly predictable; senior grades are board- or exam-driven
// ("competitive") and are shown as *earliest typical* eligibility, not guarantees.
//
// Numbers are intentionally easy to adjust as regulations change. Always verify
// against the official source linked per branch.

export type BranchId =
  | "army"
  | "marines"
  | "navy"
  | "airforce"
  | "spaceforce"
  | "coastguard";

export type Track = "enlisted" | "officer";

export type PromotionStep = {
  /** Grade reached at this step, e.g. "E-5" or "O-3". */
  toGrade: string;
  /** Typical time-in-service (months from entry/commission) to pin on. */
  tisMonths: number;
  /** True when the promotion is board/exam-driven (competitive) rather than time-based. */
  competitive?: boolean;
  /** If an early-promotion path exists, how many months sooner it can occur. */
  earlyMonths?: number;
  /** Short context note shown on the event. */
  note?: string;
};

export type BranchTiming = {
  id: BranchId;
  label: string;
  /** Name of the early-promotion mechanism for this branch (BTZ, meritorious, etc.). */
  earlyPromotionLabel: string;
  /** Official promotion reference. */
  source: { label: string; url: string };
  enlisted: PromotionStep[];
  /** Officer steps; if omitted, the shared DOPMA schedule is used. */
  officer?: PromotionStep[];
};

// Officer promotion timing is governed by DOPMA and is effectively uniform across
// the services (phase points measured in years of commissioned service).
const DOPMA_OFFICER: PromotionStep[] = [
  { toGrade: "O-2", tisMonths: 18, note: "Typically automatic at 18 months commissioned service." },
  { toGrade: "O-3", tisMonths: 48, note: "Typically automatic around 4 years (24 months TIG as O-2)." },
  { toGrade: "O-4", tisMonths: 120, competitive: true, earlyMonths: 12, note: "Board (major). ~10 years; below-zone can be ~1 year early." },
  { toGrade: "O-5", tisMonths: 192, competitive: true, note: "Board (lieutenant colonel / commander). ~16 years." },
  { toGrade: "O-6", tisMonths: 264, competitive: true, note: "Board (colonel / captain). ~22 years." },
];

export const BRANCHES: Record<BranchId, BranchTiming> = {
  army: {
    id: "army",
    label: "Army",
    earlyPromotionLabel: "early / secondary-zone",
    source: { label: "Army HRC Promotions", url: "https://www.hrc.army.mil/content/Active%20Duty%20Promotions" },
    enlisted: [
      { toGrade: "E-2", tisMonths: 6, note: "Automatic at 6 months TIS." },
      { toGrade: "E-3", tisMonths: 12, note: "Automatic at 12 months TIS, 4 months TIG." },
      { toGrade: "E-4", tisMonths: 24, earlyMonths: 6, note: "Automatic at 24 months TIS, 6 months TIG; waiverable earlier." },
      { toGrade: "E-5", tisMonths: 36, competitive: true, earlyMonths: 12, note: "Semi-centralized board + promotion points." },
      { toGrade: "E-6", tisMonths: 84, competitive: true, note: "Semi-centralized board + promotion points." },
      { toGrade: "E-7", tisMonths: 144, competitive: true, note: "Centralized (HQDA) board." },
      { toGrade: "E-8", tisMonths: 204, competitive: true, note: "Centralized (HQDA) board." },
      { toGrade: "E-9", tisMonths: 252, competitive: true, note: "Centralized (HQDA) board." },
    ],
  },
  marines: {
    id: "marines",
    label: "Marine Corps",
    earlyPromotionLabel: "meritorious",
    source: { label: "USMC Promotions (MCO 1400.32)", url: "https://www.marines.mil/" },
    enlisted: [
      { toGrade: "E-2", tisMonths: 6, note: "Automatic at 6 months TIS." },
      { toGrade: "E-3", tisMonths: 14, note: "Automatic at 9 months TIS, 8 months TIG." },
      { toGrade: "E-4", tisMonths: 24, competitive: true, earlyMonths: 6, note: "Composite score (cutting scores)." },
      { toGrade: "E-5", tisMonths: 48, competitive: true, earlyMonths: 6, note: "Composite score (cutting scores)." },
      { toGrade: "E-6", tisMonths: 96, competitive: true, note: "Centralized board." },
      { toGrade: "E-7", tisMonths: 132, competitive: true, note: "Centralized board." },
      { toGrade: "E-8", tisMonths: 168, competitive: true, note: "Centralized board." },
      { toGrade: "E-9", tisMonths: 216, competitive: true, note: "Centralized board." },
    ],
  },
  navy: {
    id: "navy",
    label: "Navy",
    earlyPromotionLabel: "early-promote (EP)",
    source: { label: "MyNavy HR (advancement & promotions)", url: "https://www.mynavyhr.navy.mil/" },
    enlisted: [
      { toGrade: "E-2", tisMonths: 9, note: "Automatic at 9 months TIS." },
      { toGrade: "E-3", tisMonths: 18, note: "Automatic at 9 months TIG." },
      { toGrade: "E-4", tisMonths: 36, competitive: true, note: "Navy-wide advancement exam (PO3)." },
      { toGrade: "E-5", tisMonths: 72, competitive: true, note: "Navy-wide advancement exam (PO2)." },
      { toGrade: "E-6", tisMonths: 132, competitive: true, note: "Navy-wide advancement exam (PO1)." },
      { toGrade: "E-7", tisMonths: 156, competitive: true, note: "Exam + selection board (CPO)." },
      { toGrade: "E-8", tisMonths: 192, competitive: true, note: "Selection board (SCPO)." },
      { toGrade: "E-9", tisMonths: 228, competitive: true, note: "Selection board (MCPO)." },
    ],
  },
  airforce: {
    id: "airforce",
    label: "Air Force",
    earlyPromotionLabel: "BTZ (below-the-zone)",
    source: { label: "Air Force Promotions (AFPC)", url: "https://www.afpc.af.mil/Promotion/" },
    enlisted: [
      { toGrade: "E-2", tisMonths: 6, note: "Automatic at 6 months TIS." },
      { toGrade: "E-3", tisMonths: 16, note: "Automatic at 16 months TIS." },
      { toGrade: "E-4", tisMonths: 36, earlyMonths: 6, note: "36 months TIS / 20 TIG; BTZ up to 6 months early." },
      { toGrade: "E-5", tisMonths: 60, competitive: true, note: "WAPS (exam + points)." },
      { toGrade: "E-6", tisMonths: 96, competitive: true, note: "WAPS (exam + points)." },
      { toGrade: "E-7", tisMonths: 168, competitive: true, note: "WAPS + board." },
      { toGrade: "E-8", tisMonths: 204, competitive: true, note: "Evaluation board." },
      { toGrade: "E-9", tisMonths: 228, competitive: true, note: "Evaluation board." },
    ],
  },
  spaceforce: {
    id: "spaceforce",
    label: "Space Force",
    earlyPromotionLabel: "BTZ (below-the-zone)",
    source: { label: "Space Force Promotions (AFPC)", url: "https://www.afpc.af.mil/Promotion/" },
    enlisted: [
      { toGrade: "E-2", tisMonths: 6, note: "Automatic at 6 months TIS." },
      { toGrade: "E-3", tisMonths: 16, note: "Automatic at 16 months TIS." },
      { toGrade: "E-4", tisMonths: 36, earlyMonths: 6, note: "36 months TIS / 20 TIG; BTZ up to 6 months early." },
      { toGrade: "E-5", tisMonths: 60, competitive: true, note: "Guardian promotion process (exam + points)." },
      { toGrade: "E-6", tisMonths: 96, competitive: true, note: "Guardian promotion process." },
      { toGrade: "E-7", tisMonths: 168, competitive: true, note: "Board." },
      { toGrade: "E-8", tisMonths: 204, competitive: true, note: "Board." },
      { toGrade: "E-9", tisMonths: 228, competitive: true, note: "Board." },
    ],
  },
  coastguard: {
    id: "coastguard",
    label: "Coast Guard",
    earlyPromotionLabel: "early advancement",
    source: { label: "USCG Advancement & Promotions", url: "https://www.dcms.uscg.mil/ppc/" },
    enlisted: [
      { toGrade: "E-2", tisMonths: 6, note: "Automatic at 6 months TIS." },
      { toGrade: "E-3", tisMonths: 12, note: "Automatic at 6 months TIG." },
      { toGrade: "E-4", tisMonths: 36, competitive: true, note: "Servicewide exam (SWE)." },
      { toGrade: "E-5", tisMonths: 72, competitive: true, note: "Servicewide exam (SWE)." },
      { toGrade: "E-6", tisMonths: 120, competitive: true, note: "Servicewide exam (SWE)." },
      { toGrade: "E-7", tisMonths: 156, competitive: true, note: "SWE + service-wide listing." },
      { toGrade: "E-8", tisMonths: 192, competitive: true, note: "Board." },
      { toGrade: "E-9", tisMonths: 228, competitive: true, note: "Board." },
    ],
  },
};

export const BRANCH_OPTIONS: { value: BranchId; label: string }[] = (
  Object.values(BRANCHES) as BranchTiming[]
).map((b) => ({ value: b.id, label: b.label }));

export function officerSteps(branch: BranchId): PromotionStep[] {
  return BRANCHES[branch].officer ?? DOPMA_OFFICER;
}

export function enlistedSteps(branch: BranchId): PromotionStep[] {
  return BRANCHES[branch].enlisted;
}

export function stepsForTrack(branch: BranchId, track: Track): PromotionStep[] {
  return track === "officer" ? officerSteps(branch) : enlistedSteps(branch);
}

// Starting grades available at accession for each track.
export const START_GRADES: Record<Track, string[]> = {
  enlisted: ["E-1", "E-2", "E-3", "E-4"],
  officer: ["O-1", "O-2", "O-3"],
};
