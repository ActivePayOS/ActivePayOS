// Tests for the Pay → Wealth Projector hand-off mapping.

import { describe, expect, it } from "vitest";
import {
  loadPaySnapshot,
  mapPayBranch,
  mapPayGrade,
  savePaySnapshot,
} from "@/lib/profile/handoff";

describe("mapPayGrade", () => {
  it("passes plain enlisted and officer grades through", () => {
    expect(mapPayGrade("E-5")).toEqual({ grade: "E-5", track: "enlisted" });
    expect(mapPayGrade("O-3")).toEqual({ grade: "O-3", track: "officer" });
  });

  it("maps the E-1 under-4-months pseudo-grade to E-1", () => {
    expect(mapPayGrade("E-1 <4mo")).toEqual({ grade: "E-1", track: "enlisted" });
  });

  it("maps prior-enlisted officer grades onto the officer track", () => {
    expect(mapPayGrade("O-2E")).toEqual({ grade: "O-2", track: "officer" });
  });

  it("clamps flag/general grades to the projector's O-6 ceiling", () => {
    expect(mapPayGrade("O-8")).toEqual({ grade: "O-6", track: "officer" });
    expect(mapPayGrade("O-10")).toEqual({ grade: "O-6", track: "officer" });
  });

  it("returns null for grades the projector doesn't model", () => {
    expect(mapPayGrade("W-3")).toBeNull();
    expect(mapPayGrade("Cadet")).toBeNull();
    expect(mapPayGrade("")).toBeNull();
  });
});

describe("mapPayBranch", () => {
  it("translates Pay Calculator ids to promotion-timing ids", () => {
    expect(mapPayBranch("usmc")).toBe("marines");
    expect(mapPayBranch("usaf")).toBe("airforce");
    expect(mapPayBranch("ussf")).toBe("spaceforce");
    expect(mapPayBranch("uscg")).toBe("coastguard");
    expect(mapPayBranch("army")).toBe("army");
    expect(mapPayBranch("navy")).toBe("navy");
  });

  it("returns undefined for unknown or missing branches", () => {
    expect(mapPayBranch("")).toBeUndefined();
    expect(mapPayBranch(undefined)).toBeUndefined();
    expect(mapPayBranch("space-pirates")).toBeUndefined();
  });
});

describe("snapshot storage guards", () => {
  it("fails soft outside the browser", () => {
    expect(
      savePaySnapshot({ track: "enlisted", grade: "E-5", yos: 6, tspPct: 0.05 })
    ).toBe(false);
    expect(loadPaySnapshot()).toBeNull();
  });
});
