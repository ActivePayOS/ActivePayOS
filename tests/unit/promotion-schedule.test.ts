import { describe, expect, it } from "vitest";
import {
  gradeAtTis,
  promotionLadder,
  upcomingPromotions,
} from "@/lib/projection/career";

// The projector's promotion preview used to drop any step whose typical
// time-in-service point had already passed, so an O-1 with 2 years in showed
// O-3 as the next rank and O-2 vanished — while the pay model was quietly
// paying that same member as an O-2. These pin the reconciled behaviour.

describe("upcomingPromotions", () => {
  it("lists O-2 for a brand new officer", () => {
    const events = upcomingPromotions("army", "officer", "O-1", 0, 20);
    expect(events.map((e) => e.toGrade)).toEqual(["O-2", "O-3", "O-4", "O-5"]);
    expect(events[0]).toMatchObject({ toGrade: "O-2", monthIndex: 18, behindSchedule: false });
  });

  it("still lists O-2 for an O-1 past the 18-month point, flagged as due now", () => {
    const events = upcomingPromotions("army", "officer", "O-1", 2, 20);
    const grades = events.map((e) => e.toGrade);
    expect(grades[0]).toBe("O-2"); // never skipped
    expect(grades).toContain("O-3");
    expect(events[0]).toMatchObject({ monthIndex: 0, behindSchedule: true, tisMonths: 18 });
  });

  it("keeps pin dates in order when several steps are behind schedule", () => {
    // A prior-enlisted O-1 with 8 years total service is past both O-2 and O-3.
    const events = upcomingPromotions("army", "officer", "O-1", 8, 20);
    expect(events.map((e) => e.toGrade)).toContain("O-2");
    for (let i = 1; i < events.length; i += 1) {
      expect(events[i].monthIndex).toBeGreaterThanOrEqual(events[i - 1].monthIndex);
    }
  });

  it("never lists a grade at or below the one already held", () => {
    const events = upcomingPromotions("army", "officer", "O-3", 4, 20);
    expect(events.map((e) => e.toGrade)).toEqual(["O-4", "O-5", "O-6"]);
  });

  it("stops at the end of the service window", () => {
    const events = upcomingPromotions("army", "officer", "O-1", 0, 5);
    expect(events.map((e) => e.toGrade)).toEqual(["O-2", "O-3"]);
  });

  it("marks board-driven steps as competitive", () => {
    const events = upcomingPromotions("army", "officer", "O-1", 0, 20);
    expect(events.find((e) => e.toGrade === "O-2")?.competitive).toBe(false);
    expect(events.find((e) => e.toGrade === "O-4")?.competitive).toBe(true);
  });

  it("agrees with the pay model about the next grade", () => {
    // gradeAtTis pays the schedule grade; the preview must show how you got there.
    const yos = 2;
    const events = upcomingPromotions("army", "officer", "O-1", yos, 20);
    const paidNow = gradeAtTis("army", "officer", "O-1", yos * 12);
    expect(paidNow).toBe("O-2");
    expect(events[0].toGrade).toBe("O-2");
    expect(events[0].monthIndex).toBe(0);
  });
});

describe("promotionLadder", () => {
  it("shows the whole ladder, marking what is held, due, upcoming and beyond", () => {
    const ladder = promotionLadder("army", "officer", "O-2", 3, 5);
    const byGrade = Object.fromEntries(ladder.map((s) => [s.toGrade, s.status]));
    expect(byGrade["O-2"]).toBe("held");
    expect(byGrade["O-3"]).toBe("upcoming"); // 48-month point, member is at 36
    expect(byGrade["O-4"]).toBe("beyond"); // past the 5-year window
  });

  it("marks an overdue step as due rather than hiding it", () => {
    const ladder = promotionLadder("army", "officer", "O-1", 2, 20);
    expect(ladder.find((s) => s.toGrade === "O-2")?.status).toBe("due");
  });

  it("carries the schedule's TIS point and note for display", () => {
    const step = promotionLadder("army", "enlisted", "E-1", 0, 20).find(
      (s) => s.toGrade === "E-5"
    );
    expect(step?.tisMonths).toBe(36);
    expect(step?.competitive).toBe(true);
    expect(step?.note).toMatch(/board/i);
  });
});
