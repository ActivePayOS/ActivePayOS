// The three service clocks, kept apart.
//
// A real user reported this: an Air Force O-1 who commissioned from USAFA in
// May 2025 with 2 years 8 months of prior enlisted service. He entered 3 years
// of service — correct for PAY — and the Career path card promoted him to O-2
// "now" and paid him as one. He is an O-1 and stays one until he has the time
// in grade an officer needs.
//
// The engine used to feed ONE number to both the pay tables and the promotion
// schedule. They are different clocks:
//
//   Pay        — TOTAL creditable service (DoD FMR Vol 7A Ch 1 para 2.1.1.1,
//                37 U.S.C. 205). Prior enlisted time counts in full.
//   Promotion  — COMMISSIONED service / time in grade from the date of rank
//                (10 U.S.C. 619(a)(1)). Prior enlisted time counts for nothing;
//                it does not back-date an officer's date of rank.
//   E rates    — prior ACTIVE enlisted/warrant service OVER 4 years, and only
//                at O-1/O-2/O-3 (FMR Vol 7A para 2.3.1.2). There is no O-4E.

import { describe, expect, it } from "vitest";
import {
  officerTigSchedule,
  stepsForTrack,
  STATUTORY_OFFICER_TIG_MONTHS,
  SERVICE_OFFICER_TIG_MONTHS,
} from "@/data/promotion/timing";
import {
  basePayFor,
  payRowForGrade,
  priorEnlistedMonthsFrom,
  qualifiesForEnlistedOfficerRate,
  PRIOR_ENLISTED_E_RATE_MIN_MONTHS,
  type BasePayDataset,
} from "@/lib/pay/basepay-lookup";
import {
  gradeAtTis,
  projectCareerWealth,
  promotionLadder,
  upcomingPromotions,
  type CareerProjectionInput,
} from "@/lib/projection/career";
import basepay2026 from "@/data/basepay/2026.json";

const ds = basepay2026 as unknown as BasePayDataset;

// The reporting user, exactly as he typed it in.
const REPORTER: CareerProjectionInput = {
  basepay: ds,
  branch: "airforce",
  track: "officer",
  currentGrade: "O-1",
  currentYosYears: 3, // total service — correct for pay
  currentCommissionedYears: 1, // commissioned May 2025
  serviceYearsRemaining: 5,
  modelPromotions: true,
  annualPayRaise: 0,
  projectionYears: 5,
  currentAge: 24,
  tspBalance: 0,
  tspPct: 0.05,
  brs: true,
  tspReturn: 0,
  invBalance: 0,
  invMonthly: 0,
  invMonthlyAfter: 0,
  invReturn: 0,
  savBalance: 0,
  savMonthly: 0,
  savMonthlyAfter: 0,
  savReturn: 0,
  inflation: 0,
};

// 2026 DFAS cells this file leans on.
const O1_TWO_OR_LESS = 4150.2; // what 1 year of commissioned service would pay
const O1_OVER_3 = 5222.4; // what 3 years of TOTAL service actually pays
const O1_OVER_6 = 5222.4; // O-1 pay is flat from the over-3 column onward
const O1E_OVER_6 = 5576.7; // the prior-enlisted row is not flat there

describe("the reporting user: Air Force O-1, 3 years total, 1 year commissioned", () => {
  const r = projectCareerWealth(REPORTER);

  it("(a) is NOT modelled as an O-2 today", () => {
    expect(gradeAtTis("airforce", "officer", "O-1", 36, { promotionMonths: 12 })).toBe("O-1");
    expect(r.payTimeline[0].grade).toBe("O-1");
    expect(r.promotions[0]).toMatchObject({ toGrade: "O-2", behindSchedule: false });
    // The pill that started the bug report: "O-2 - now".
    expect(r.promotions[0].monthIndex).toBeGreaterThan(0);
  });

  it("(a') reproduces the reported bug when the commissioned clock is omitted", () => {
    // Same member, single clock: 36 months of total service sails past the
    // schedule and the model pays him as an O-2 from day one. This is the
    // behaviour every caller that omits the new field still gets.
    const singleClock = projectCareerWealth({
      ...REPORTER,
      currentCommissionedYears: undefined,
    });
    expect(singleClock.payTimeline[0].grade).toBe("O-2");
    expect(singleClock.promotions[0]).toMatchObject({ toGrade: "O-2", monthIndex: 0 });
  });

  it("(b) pins O-2 at the Air Force 24-month time-in-grade point", () => {
    // DAFI 36-2501 para A2.1: 24 months TIG from the CGDOR. He has 12, so O-2
    // is 12 calendar months away — not "now".
    expect(r.promotions[0]).toMatchObject({ toGrade: "O-2", monthIndex: 12, tisMonths: 24 });
    expect(gradeAtTis("airforce", "officer", "O-1", 36, { promotionMonths: 23 })).toBe("O-1");
    expect(gradeAtTis("airforce", "officer", "O-1", 36, { promotionMonths: 24 })).toBe("O-2");
  });

  it("(b') pins O-2 at 18 months when the statutory floor is used instead", () => {
    // 10 U.S.C. 619(a)(1) allows 18 months at O-1; the user believes the Air
    // Force still runs that. Overriding the figure has to move the pin date.
    const statutory = { "O-2": STATUTORY_OFFICER_TIG_MONTHS["O-2"] };
    expect(statutory["O-2"]).toBe(18);

    const events = upcomingPromotions("airforce", "officer", "O-1", 3, 5, {
      promotionMonths: 12,
      officerTigMonths: statutory,
    });
    expect(events[0]).toMatchObject({ toGrade: "O-2", monthIndex: 6, tisMonths: 18 });
    expect(
      gradeAtTis("airforce", "officer", "O-1", 36, {
        promotionMonths: 18,
        officerTigMonths: statutory,
      })
    ).toBe("O-2");

    const projected = projectCareerWealth({ ...REPORTER, officerTigMonths: statutory });
    expect(projected.promotions[0].monthIndex).toBe(6);
  });

  it("(c) pays him from the TOTAL-service column, not the commissioned one", () => {
    expect(r.payTimeline[0].basePayMonthly).toBeCloseTo(O1_OVER_3, 2);
    expect(r.payTimeline[0].basePayMonthly).not.toBeCloseTo(O1_TWO_OR_LESS, 2);
    // Same cell the pay tables give for an O-1 at 3 years of service.
    expect(basePayFor(ds, "O-1", 3)).toBeCloseTo(O1_OVER_3, 2);
  });

  it("(d) does not draw O-1E rates on 2 years 8 months of prior enlisted service", () => {
    const prior = projectCareerWealth({
      ...REPORTER,
      currentYosYears: 1 + 32 / 12, // 1 year commissioned + 2y8m enlisted
    });
    expect(prior.priorEnlistedMonths).toBeCloseTo(32, 6);
    expect(prior.drawsEnlistedOfficerRate).toBe(false);
    expect(prior.payTimeline[0].payGrade).toBe("O-1");
  });

  it("(d') draws O-1E rates at 4 years and 1 month of prior enlisted service", () => {
    const prior = projectCareerWealth({
      ...REPORTER,
      currentYosYears: 1 + 49 / 12,
    });
    expect(prior.priorEnlistedMonths).toBeCloseTo(49, 6);
    expect(prior.drawsEnlistedOfficerRate).toBe(true);
    expect(prior.payTimeline[0].payGrade).toBe("O-1E");
    // Still an O-1 by rank — the E is a pay row, not a promotion.
    expect(prior.payTimeline[0].grade).toBe("O-1");
  });
});

describe("officer time in grade", () => {
  it("uses the 10 U.S.C. 619(a)(1) minimums as the baseline", () => {
    expect(STATUTORY_OFFICER_TIG_MONTHS).toMatchObject({
      "O-2": 18,
      "O-3": 24,
      "O-4": 36,
      "O-5": 36,
      "O-6": 36,
      "O-7": 12,
    });
    const army = officerTigSchedule("army");
    const byGrade = Object.fromEntries(army.map((e) => [e.toGrade, e]));
    expect(byGrade["O-2"]).toMatchObject({ tigMonths: 18, source: "statute", tisMonths: 18 });
    // Time in grade accumulates (18 as an O-1 + 24 as an O-2 = 42), but that is
    // the earliest LEGAL date. Captain typically pins at the published 4-year
    // phase point, so the phase point wins and the TIG floor sits under it.
    expect(byGrade["O-3"]).toMatchObject({ tigMonths: 24, tisMonths: 48 });
  });

  it("lengthens O-2 and O-3 to 24 months for the Air Force and Space Force", () => {
    for (const branch of ["airforce", "spaceforce"] as const) {
      const byGrade = Object.fromEntries(
        officerTigSchedule(branch).map((e) => [e.toGrade, e])
      );
      expect(byGrade["O-2"]).toMatchObject({
        tigMonths: 24,
        statutoryTigMonths: 18,
        serviceTigMonths: 24,
        source: "service",
        tisMonths: 24,
      });
      expect(byGrade["O-3"]).toMatchObject({ tigMonths: 24, source: "service", tisMonths: 48 });
      expect(SERVICE_OFFICER_TIG_MONTHS[branch]).toEqual({ "O-2": 24, "O-3": 24 });
    }
  });

  it("exposes the effective figure and honours a caller override", () => {
    const overridden = officerTigSchedule("airforce", { "O-2": 18 });
    const o2 = overridden.find((e) => e.toGrade === "O-2");
    expect(o2).toMatchObject({
      tigMonths: 18,
      statutoryTigMonths: 18,
      serviceTigMonths: 24,
      source: "override",
      tisMonths: 18,
    });
    // The override cascades to O-3's floor (18 + 24 = 42), but the 4-year phase
    // point is later, so captain still pins there.
    expect(overridden.find((e) => e.toGrade === "O-3")?.tisMonths).toBe(48);
  });

  it("keeps board phase points in charge of the senior grades", () => {
    // Nobody makes major at 3 years in grade; the published phase point governs.
    const af = officerTigSchedule("airforce");
    const o4 = af.find((e) => e.toGrade === "O-4");
    expect(o4).toMatchObject({ tisMonths: 120, pacedBy: "phase-point", competitive: true });
    expect(af.find((e) => e.toGrade === "O-2")?.pacedBy).toBe("time-in-grade");
  });

  it("carries the time-in-grade figure onto the schedule the engine reads", () => {
    const af = stepsForTrack("airforce", "officer");
    expect(af.find((s) => s.toGrade === "O-2")).toMatchObject({ tisMonths: 24, tigMonths: 24 });
    const relaxed = stepsForTrack("airforce", "officer", { officerTigMonths: { "O-2": 18 } });
    expect(relaxed.find((s) => s.toGrade === "O-2")).toMatchObject({ tisMonths: 18 });
    // The ladder the UI renders carries it too.
    const ladder = promotionLadder("airforce", "officer", "O-1", 3, 20, { promotionMonths: 12 });
    expect(ladder.find((s) => s.toGrade === "O-2")).toMatchObject({
      tigMonths: 24,
      status: "upcoming",
      monthIndex: 12,
    });
  });
});

describe("prior-enlisted officer (O-1E / O-2E / O-3E) rates", () => {
  it("derives prior enlisted service as total minus commissioned", () => {
    expect(priorEnlistedMonthsFrom(36, 12)).toBe(24);
    // Commissioned service can't exceed total; never report a negative.
    expect(priorEnlistedMonthsFrom(12, 36)).toBe(0);
  });

  it("requires OVER 4 years — 4 years exactly is not enough", () => {
    expect(PRIOR_ENLISTED_E_RATE_MIN_MONTHS).toBe(48);
    expect(qualifiesForEnlistedOfficerRate("O-1", 32)).toBe(false); // 2y8m
    expect(qualifiesForEnlistedOfficerRate("O-1", 48)).toBe(false); // exactly 4y
    expect(qualifiesForEnlistedOfficerRate("O-1", 49)).toBe(true); // 4y1m
  });

  it("applies only to O-1, O-2 and O-3 — there is no O-4E", () => {
    expect(qualifiesForEnlistedOfficerRate("O-2", 120)).toBe(true);
    expect(qualifiesForEnlistedOfficerRate("O-3", 120)).toBe(true);
    expect(qualifiesForEnlistedOfficerRate("O-4", 120)).toBe(false);
    expect(qualifiesForEnlistedOfficerRate("O-5", 240)).toBe(false);
    expect(qualifiesForEnlistedOfficerRate("E-6", 120)).toBe(false);
    expect(qualifiesForEnlistedOfficerRate("W-2", 120)).toBe(false);
    expect(payRowForGrade("O-3", 120)).toBe("O-3E");
    expect(payRowForGrade("O-4", 120)).toBe("O-4");
  });

  it("has the pay lookup pick the E row itself", () => {
    // 7 years total service, 6 of them prior enlisted — the over-6 column.
    expect(basePayFor(ds, "O-1", 7, { priorEnlistedMonths: 72 })).toBeCloseTo(O1E_OVER_6, 2);
    expect(basePayFor(ds, "O-1", 7, { priorEnlistedMonths: 32 })).toBeCloseTo(O1_OVER_6, 2);
    expect(basePayFor(ds, "O-1", 7)).toBeCloseTo(O1_OVER_6, 2);
    // O-4 keeps the plain row no matter how much prior enlisted service there is.
    expect(basePayFor(ds, "O-4", 12, { priorEnlistedMonths: 120 })).toBe(basePayFor(ds, "O-4", 12));
  });

  it("never loses a rate to an empty E cell", () => {
    // The E rows start at the over-4 column. A caller who asks for O-1 with a
    // low longevity column still gets the O-1 rate rather than null.
    expect(basePayFor(ds, "O-1", 1, { priorEnlistedMonths: 72 })).toBeCloseTo(O1_TWO_OR_LESS, 2);
    // But a caller who names the E grade outright still gets that row's answer.
    expect(basePayFor(ds, "O-1E", 0)).toBeNull();
  });

  it("stops the E rate at promotion to O-4 inside a projection", () => {
    const r = projectCareerWealth({
      ...REPORTER,
      currentGrade: "O-3",
      currentYosYears: 14, // 8 years prior enlisted + 6 commissioned
      currentCommissionedYears: 6,
      serviceYearsRemaining: 8,
      projectionYears: 8,
    });
    expect(r.priorEnlistedMonths).toBe(96);
    expect(r.payTimeline[0].payGrade).toBe("O-3E");
    const asO4 = r.payTimeline.filter((p) => p.grade === "O-4");
    expect(asO4.length).toBeGreaterThan(0);
    expect(asO4.every((p) => p.payGrade === "O-4")).toBe(true);
  });
});

describe("everyone else is untouched", () => {
  const ENLISTED: CareerProjectionInput = {
    ...REPORTER,
    branch: "army",
    track: "enlisted",
    currentGrade: "E-4",
    currentYosYears: 4,
    currentCommissionedYears: undefined,
  };

  it("an enlisted member is completely unaffected by the new field", () => {
    const plain = projectCareerWealth(ENLISTED);
    // An enlisted member has one clock, so even a stray commissioned figure and
    // a set of officer TIG overrides must change nothing at all.
    const noisy = projectCareerWealth({
      ...ENLISTED,
      currentCommissionedYears: 1,
      officerTigMonths: { "O-2": 6, "O-3": 6 },
    });
    expect(noisy).toEqual(plain);
    expect(plain.priorEnlistedMonths).toBe(0);
    expect(plain.drawsEnlistedOfficerRate).toBe(false);
    expect(plain.payTimeline.every((p) => p.payGrade === p.grade)).toBe(true);
    // Enlisted timing still reads off total service.
    expect(gradeAtTis("army", "enlisted", "E-4", 84)).toBe("E-6");
    expect(upcomingPromotions("army", "enlisted", "E-4", 4, 5).map((e) => e.toGrade)).toEqual([
      "E-5",
      "E-6",
    ]);
  });

  it("a direct-commission officer behaves exactly as before", () => {
    // Commissioned service == total service: the two clocks are one clock, so
    // supplying the new field and omitting it must produce identical output.
    const direct: CareerProjectionInput = {
      ...REPORTER,
      branch: "navy",
      currentYosYears: 4,
      currentCommissionedYears: 4,
      serviceYearsRemaining: 10,
      projectionYears: 10,
    };
    const withField = projectCareerWealth(direct);
    const without = projectCareerWealth({ ...direct, currentCommissionedYears: undefined });
    expect(withField).toEqual(without);
    expect(withField.priorEnlistedMonths).toBe(0);
    expect(withField.drawsEnlistedOfficerRate).toBe(false);
  });

  it("clamps a commissioned figure that exceeds total service", () => {
    // Garbage in from a form: 6 commissioned years on 3 total. Treat it as 3
    // rather than inventing negative prior enlisted service.
    const r = projectCareerWealth({ ...REPORTER, currentCommissionedYears: 6 });
    expect(r.priorEnlistedMonths).toBe(0);
    expect(r.promotions[0]).toMatchObject({ toGrade: "O-2", monthIndex: 0 });
  });
});
