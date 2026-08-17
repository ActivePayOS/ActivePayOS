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
  /**
   * Typical months on the *promotion clock* when this step pins.
   *
   * Enlisted: months of total service. Officer: months of COMMISSIONED service,
   * counted from commissioning — prior enlisted time does not count here (it
   * raises the pay-table column instead). See TIMING_BASIS.
   */
  tisMonths: number;
  /** True when the promotion is board/exam-driven (competitive) rather than time-based. */
  competitive?: boolean;
  /** If an early-promotion path exists, how many months sooner it can occur. */
  earlyMonths?: number;
  /** Short context note shown on the event. */
  note?: string;
  /**
   * Officer steps only: months in grade required before this step pins, counted
   * from the previous grade's date of rank. Present on the DOPMA-derived
   * schedules built by officerTigSchedule(); the enlisted schedules are plain
   * time-in-service and leave this undefined.
   */
  tigMonths?: number;
};

export type BranchTiming = {
  id: BranchId;
  label: string;
  /** Name of the early-promotion mechanism for this branch (BTZ, meritorious, etc.). */
  earlyPromotionLabel: string;
  /** Official promotion reference. */
  source: { label: string; url: string };
  enlisted: PromotionStep[];
  /**
   * Officer steps, when a branch needs a hand-written ladder. Omit it (all six
   * currently do) and the schedule is derived from the branch's time-in-grade
   * figures by officerStepsForBranch().
   */
  officer?: PromotionStep[];
};

// ---------------------------------------------------------------------------
// Officer timing: time in grade, not time in service
// ---------------------------------------------------------------------------
//
// Officer promotion is gated by TIME IN GRADE measured from the date of rank
// (10 U.S.C. 619(a)(1)), not by total time in uniform. Prior enlisted service
// raises the pay-table column but does NOT back-date an officer's date of rank
// and does NOT accelerate promotion — only prior active commissioned service or
// constructive credit (10 U.S.C. 533) does that. Modelling officer steps as
// points on a total-service clock is what made a prior-enlisted O-1 come out of
// the projection as an O-2 on day one.
//
// So the officer schedule is built from per-step time-in-grade figures and
// accumulated into commissioned-service points, rather than hard-coded.

/** Officer time-in-grade figures in months, keyed by the grade REACHED. */
export type OfficerTigMonths = Readonly<Record<string, number>>;

/** A partial set of the same, for caller/UI overrides. */
export type OfficerTigOverrides = Readonly<Partial<Record<string, number>>>;

/**
 * Statutory MINIMUM time in grade before promotion, in months, keyed by the
 * grade reached — 10 U.S.C. 619(a)(1): 18 months as an O-1, 2 years as an O-2,
 * 3 years as an O-3/O-4/O-5, 1 year as an O-6/O-7. A Service Secretary may
 * lengthen these; nobody may shorten them.
 */
export const STATUTORY_OFFICER_TIG_MONTHS: OfficerTigMonths = {
  "O-2": 18,
  "O-3": 24,
  "O-4": 36,
  "O-5": 36,
  "O-6": 36,
  "O-7": 12,
};

/**
 * Service-secretary lengthening of the statutory floor.
 *
 * DAFI 36-2501 para A2.1 makes second lieutenants eligible for first lieutenant
 * once they hold 24 months time in grade computed from their CGDOR, and first
 * lieutenants are promoted to captain after 24 months TIG. Air Force and Space
 * Force therefore run 24 months where the statute allows 18. These are defaults
 * only — every figure is overridable, because the current DAFI could not be
 * machine-verified and 18 months is still widely quoted.
 */
export const SERVICE_OFFICER_TIG_MONTHS: Partial<Record<BranchId, OfficerTigOverrides>> = {
  airforce: { "O-2": 24, "O-3": 24 },
  spaceforce: { "O-2": 24, "O-3": 24 },
};

/**
 * Board phase points, in months of commissioned service. Senior grades are not
 * paced by the statutory TIG minimum at all — a major board sits ~10 years in,
 * far beyond the 3 years in grade the statute requires — so these published
 * phase points act as a floor for the competitive steps.
 */
const OFFICER_PHASE_POINTS: readonly PromotionStep[] = [
  // Phase points are the AVERAGE commissioned service at which officers
  // actually pin (AFI 36-2501 defines them that way) — not the earliest legal
  // date. Time in grade is a floor beneath them, so a service that lengthens
  // TIG pushes the step later, but a shorter statutory floor never pulls a
  // step earlier than the published norm. Without these, deriving O-3 purely
  // from TIG (18 + 24) would pin captain at 42 months for the four services
  // that use the statutory minimum, ~6 months before it typically happens.
  { toGrade: "O-2", tisMonths: 18 },
  { toGrade: "O-3", tisMonths: 48 },
  {
    toGrade: "O-4",
    tisMonths: 120,
    competitive: true,
    earlyMonths: 12,
    note: "Board (major). ~10 years commissioned; below-zone can be ~1 year early.",
  },
  {
    toGrade: "O-5",
    tisMonths: 192,
    competitive: true,
    note: "Board (lieutenant colonel / commander). ~16 years commissioned.",
  },
  {
    toGrade: "O-6",
    tisMonths: 264,
    competitive: true,
    note: "Board (colonel / captain). ~22 years commissioned.",
  },
];

/** Where an effective time-in-grade figure came from. */
export type OfficerTigSource = "statute" | "service" | "override";

/** What actually sets the pin date for a step. */
export type OfficerTigPacing = "time-in-grade" | "phase-point";

/** One officer step, with the time-in-grade arithmetic exposed for display. */
export type OfficerTigEntry = {
  toGrade: string;
  /** Months in grade actually modelled for this step. */
  tigMonths: number;
  /** 10 U.S.C. 619(a)(1) minimum for this step. */
  statutoryTigMonths: number;
  /** This branch's published default, when its Secretary lengthens the statute. */
  serviceTigMonths: number | null;
  /** Whether the modelled figure is the statute, the service default, or a caller override. */
  source: OfficerTigSource;
  /** Commissioned-service month the step pins at, accumulated across the ladder. */
  tisMonths: number;
  /** Time-based steps are paced by TIG; board steps by the published phase point. */
  pacedBy: OfficerTigPacing;
  competitive: boolean;
};

/**
 * The effective time-in-grade figure for every officer step: the statutory
 * minimum, lengthened by the service's own policy, then by any caller override.
 * Exposed so the UI can show the number it is using and let the member change it.
 */
export function officerTigSchedule(
  branch: BranchId,
  overrides?: OfficerTigOverrides
): OfficerTigEntry[] {
  const serviceDefaults = SERVICE_OFFICER_TIG_MONTHS[branch];
  const entries: OfficerTigEntry[] = [];
  let prevTis = 0;

  for (const step of OFFICER_PHASE_POINTS) {
    const statutory = STATUTORY_OFFICER_TIG_MONTHS[step.toGrade] ?? 0;
    const serviceRaw = serviceDefaults?.[step.toGrade];
    const service = typeof serviceRaw === "number" ? serviceRaw : null;
    const overrideRaw = overrides?.[step.toGrade];
    const override =
      typeof overrideRaw === "number" && Number.isFinite(overrideRaw) && overrideRaw >= 0
        ? overrideRaw
        : null;

    const tigMonths = override ?? service ?? statutory;
    const source: OfficerTigSource =
      override != null ? "override" : service != null ? "service" : "statute";

    const tigPin = prevTis + tigMonths;
    const competitive = !!step.competitive;
    // Every step pins at the later of its published phase point and the moment
    // the member is legally eligible. Lengthening TIG (the Air Force's 24
    // months at O-1) pushes the step out; a shorter floor never drags it in
    // ahead of the norm.
    const tisMonths = Math.max(step.tisMonths, tigPin);

    entries.push({
      toGrade: step.toGrade,
      tigMonths,
      statutoryTigMonths: statutory,
      serviceTigMonths: service,
      source,
      tisMonths,
      pacedBy: competitive && tisMonths > tigPin ? "phase-point" : "time-in-grade",
      competitive,
    });

    prevTis = tisMonths;
  }

  return entries;
}

function officerNote(entry: OfficerTigEntry, base?: string): string | undefined {
  if (entry.competitive) return base;
  const years = entry.tisMonths / 12;
  const yearLabel =
    Number.isInteger(years) ? `${years}` : years.toFixed(1).replace(/\.0$/, "");
  return (
    `Typically automatic at ${entry.tigMonths} months time in grade — ` +
    `about ${yearLabel} year${years === 1 ? "" : "s"} of commissioned service. ` +
    `Prior enlisted time does not count toward this.`
  );
}

// Building the ladder is cheap but gradeAtTis asks for it once per simulated
// month, so memoize on the only two things that change it.
const officerStepCache = new Map<string, PromotionStep[]>();

/**
 * The officer promotion ladder for a branch, as commissioned-service points
 * derived from the effective time-in-grade figures.
 */
export function officerStepsForBranch(
  branch: BranchId,
  overrides?: OfficerTigOverrides
): PromotionStep[] {
  const key = `${branch}|${overrides ? JSON.stringify(overrides) : ""}`;
  const hit = officerStepCache.get(key);
  if (hit) return hit;

  const schedule = officerTigSchedule(branch, overrides);
  const steps = schedule.map((entry, idx) => {
    const base = OFFICER_PHASE_POINTS[idx];
    const step: PromotionStep = {
      toGrade: entry.toGrade,
      tisMonths: entry.tisMonths,
      tigMonths: entry.tigMonths,
    };
    if (entry.competitive) step.competitive = true;
    if (base.earlyMonths) step.earlyMonths = base.earlyMonths;
    const note = officerNote(entry, base.note);
    if (note) step.note = note;
    return step;
  });

  officerStepCache.set(key, steps);
  return steps;
}

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

// What the "time in service" figure means for each track. Officer phase points
// are counted from commissioning, so a prior-enlisted officer's total service
// is NOT the number these schedules expect — the single most common way the
// projection drifts from a real career.
export const TIMING_BASIS: Record<Track, string> = {
  officer:
    "Officer promotion is gated by time in grade from your date of rank, so this ladder is " +
    "counted in years of COMMISSIONED service — not total time in uniform. Prior enlisted " +
    "service raises your base pay column but does not back-date your date of rank, so it " +
    "never speeds up an officer promotion. Enter total service for pay and years since " +
    "commissioning for promotions.",
  enlisted:
    "Enlisted timing is counted in total years of service. Junior grades are largely " +
    "time-based; senior grades depend on boards, exams, and promotion points.",
};

export const TIMING_DISCLAIMER =
  "These are typical planning estimates, not entitlements. Actual timing depends on your " +
  "record, your specialty's promotion rates, and year-to-year board results.";

function officerSteps(branch: BranchId, overrides?: OfficerTigOverrides): PromotionStep[] {
  return BRANCHES[branch].officer ?? officerStepsForBranch(branch, overrides);
}

function enlistedSteps(branch: BranchId): PromotionStep[] {
  return BRANCHES[branch].enlisted;
}

/** Options for the schedule lookup. Omit them for the branch defaults. */
export type StepsForTrackOptions = {
  /**
   * Officer time-in-grade overrides in months, keyed by the grade reached
   * ({ "O-2": 18 }). Ignored on the enlisted track.
   */
  officerTigMonths?: OfficerTigOverrides;
};

export function stepsForTrack(
  branch: BranchId,
  track: Track,
  options?: StepsForTrackOptions
): PromotionStep[] {
  return track === "officer"
    ? officerSteps(branch, options?.officerTigMonths)
    : enlistedSteps(branch);
}

// Starting grades available at accession for each track.
export const START_GRADES: Record<Track, string[]> = {
  enlisted: ["E-1", "E-2", "E-3", "E-4"],
  officer: ["O-1", "O-2", "O-3"],
};
