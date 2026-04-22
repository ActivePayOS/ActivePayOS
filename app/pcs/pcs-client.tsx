"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type PayGrade =
  | "O-1" | "O-2" | "O-3" | "O-4" | "O-5" | "O-6" | "O-7" | "O-8" | "O-9" | "O-10"
  | "W-1" | "W-2" | "W-3" | "W-4" | "W-5"
  | "E-1" | "E-2" | "E-3" | "E-4" | "E-5" | "E-6" | "E-7" | "E-8" | "E-9"
  | "O-1E" | "O-2E" | "O-3E";

type TravelMode = "drive" | "fly";
type MoveType = "government" | "ppm" | "partial-ppm";

const DRIVE_PER_DIEM_MEMBER = 178;
const FLY_PER_DIEM_MEMBER = 51;
const DEP_RATE_12_PLUS = 0.75;
const DEP_RATE_UNDER_12 = 0.5;
const PCS_MALT_RATE = 0.205; // 2026 PCS POV mileage rate
const TLE_MAX_DAYS_STANDARD = 21;
const TLE_DAILY_CAP = 290;

const DLA_PRIMARY_2026: Record<PayGrade, { without: number; with: number }> = {
  "O-10": { without: 5187.33, with: 6385.58 },
  "O-9": { without: 5187.33, with: 6385.58 },
  "O-8": { without: 5187.33, with: 6385.58 },
  "O-7": { without: 5187.33, with: 6385.58 },
  "O-6": { without: 4758.96, with: 5749.63 },
  "O-5": { without: 4583.51, with: 5542.06 },
  "O-4": { without: 4247.61, with: 4885.43 },
  "O-3": { without: 3404.11, with: 4041.88 },
  "O-2": { without: 2700.31, with: 3451.28 },
  "O-1": { without: 2273.82, with: 3085.23 },
  "O-3E": { without: 3675.83, with: 4343.8 },
  "O-2E": { without: 3124.87, with: 3919.27 },
  "O-1E": { without: 2687.09, with: 3621.1 },
  "W-5": { without: 4315.51, with: 4715.58 },
  "W-4": { without: 3832.45, with: 4323.11 },
  "W-3": { without: 3221.08, with: 3960.78 },
  "W-2": { without: 2860.7, with: 3643.75 },
  "W-1": { without: 2394.55, with: 3151.31 },
  "E-9": { without: 3147.54, with: 4149.51 },
  "E-8": { without: 2888.97, with: 3824.94 },
  "E-7": { without: 2468.19, with: 3551.31 },
  "E-6": { without: 2389.42, with: 3548.02 },
  "E-5": { without: 2389.42, with: 3548.02 },
  "E-4": { without: 2389.42, with: 3548.02 },
  "E-3": { without: 2355.48, with: 3548.02 },
  "E-2": { without: 2025.26, with: 3548.02 },
  "E-1": { without: 1870.58, with: 3548.02 },
};

function fmtUSD(v: number | null | undefined) {
  return typeof v === "number" && Number.isFinite(v)
    ? new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
      }).format(v)
    : "—";
}

function fmtPct(v: number | null | undefined) {
  return typeof v === "number" && Number.isFinite(v) ? `${v.toFixed(1)}%` : "—";
}

function getTravelDaysByMiles(miles: number) {
  if (!Number.isFinite(miles) || miles <= 0) return 0;
  if (miles <= 400) return 1;
  return 1 + Math.ceil((miles - 400) / 350);
}

function getMemberPerDiemRate(mode: TravelMode) {
  return mode === "drive" ? DRIVE_PER_DIEM_MEMBER : FLY_PER_DIEM_MEMBER;
}

function getDla(grade: PayGrade, withDependents: boolean) {
  const row = DLA_PRIMARY_2026[grade];
  return withDependents ? row.with : row.without;
}

function getDecisionTone(netAfterCosts: number, moveType: MoveType) {
  if (moveType === "government") {
    return {
      label: "Government move baseline",
      desc: "This view is mainly helping you plan travel and lodging cash flow around a government-arranged move.",
    };
  }

  if (netAfterCosts > 3000) {
    return {
      label: "Strong PCS cash picture",
      desc: "On these assumptions, your estimated PCS entitlements are meaningfully above your entered out-of-pocket moving costs.",
    };
  }

  if (netAfterCosts > 0) {
    return {
      label: "Positive, but not huge",
      desc: "This may still work well, but a small change in expenses or your PPM estimate could move the result.",
    };
  }

  return {
    label: "Tight / stress-test this",
    desc: "Your current assumptions suggest you may need more cash up front or a more conservative moving plan.",
  };
}

export default function PCSClient() {
  const [grade, setGrade] = useState<PayGrade>("O-1");
  const [withDependents, setWithDependents] = useState(false);
  const [travelMode, setTravelMode] = useState<TravelMode>("drive");
  const [moveType, setMoveType] = useState<MoveType>("ppm");

  const [officialMiles, setOfficialMiles] = useState(1200);
  const [authorizedVehicles, setAuthorizedVehicles] = useState(1);
  const [travelDaysOverride, setTravelDaysOverride] = useState(0);

  const [depAge12Plus, setDepAge12Plus] = useState(0);
  const [depUnder12, setDepUnder12] = useState(0);

  const [tleDays, setTleDays] = useState(7);
  const [tleAvgDailyReimbursable, setTleAvgDailyReimbursable] = useState(200);

  const [ppmEstimate, setPpmEstimate] = useState(6000);
  const [truckCost, setTruckCost] = useState(1800);
  const [fuelCost, setFuelCost] = useState(500);
  const [packingCost, setPackingCost] = useState(250);
  const [otherMoveCost, setOtherMoveCost] = useState(200);

  const autoTravelDays = useMemo(
    () => (travelMode === "drive" ? getTravelDaysByMiles(officialMiles) : 1),
    [travelMode, officialMiles]
  );

  const travelDays = travelDaysOverride > 0 ? travelDaysOverride : autoTravelDays;

  const memberPerDiemRate = getMemberPerDiemRate(travelMode);
  const memberPerDiem = memberPerDiemRate * travelDays;
  const dependentPerDiem =
    travelDays *
    memberPerDiemRate *
    (depAge12Plus * DEP_RATE_12_PLUS + depUnder12 * DEP_RATE_UNDER_12);

  const malt =
    travelMode === "drive"
      ? officialMiles * PCS_MALT_RATE * Math.max(authorizedVehicles, 0)
      : 0;

  const dla = getDla(grade, withDependents);

  const tleEligibleDays = Math.min(Math.max(tleDays, 0), TLE_MAX_DAYS_STANDARD);
  const tleDailyUsed = Math.min(Math.max(tleAvgDailyReimbursable, 0), TLE_DAILY_CAP);
  const tleEstimate = tleEligibleDays * tleDailyUsed;

  const outOfPocketMoveCosts =
    truckCost + fuelCost + packingCost + otherMoveCost;

  const ppmGross =
    moveType === "government" ? 0 : Math.max(ppmEstimate, 0);

  const totalEntitlements =
    dla + malt + memberPerDiem + dependentPerDiem + tleEstimate + ppmGross;

  const netAfterCosts =
    totalEntitlements - (moveType === "government" ? 0 : outOfPocketMoveCosts);

  const tone = getDecisionTone(netAfterCosts, moveType);

  const costRows = [
    { label: "Truck / trailer / rental", value: truckCost },
    { label: "Fuel", value: fuelCost },
    { label: "Packing supplies", value: packingCost },
    { label: "Other move costs", value: otherMoveCost },
  ];

  return (
    <main className="space-y-10">
      <header className="rounded-3xl border bg-white p-6 md:p-8 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              PCS Move Calculator
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              Estimate major PCS cash-flow pieces like DLA, mileage, per diem,
              TLE, and your likely PPM picture.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border bg-gray-50 px-3 py-1 text-xs text-gray-700">
              2026 DLA + PCS mileage
            </span>
            <span className="rounded-full border bg-gray-50 px-3 py-1 text-xs text-gray-700">
              Planning tool, not settlement
            </span>
          </div>
        </div>
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-3xl border bg-white p-6 md:p-8 shadow-sm">
          <h2 className="text-lg font-semibold">Inputs</h2>
          <p className="mt-1 text-sm text-gray-600">
            Use this to build a realistic PCS estimate. If your transportation office
            gave you a PPM estimate, use that instead of guessing.
          </p>

          <div className="mt-6 grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium">Pay Grade</label>
                <select
                  className="mt-1 w-full rounded-xl border bg-white px-3 py-2"
                  value={grade}
                  onChange={(e) => setGrade(e.target.value as PayGrade)}
                >
                  {[
                    "O-1","O-2","O-3","O-4","O-5","O-6","O-7","O-8","O-9","O-10",
                    "O-1E","O-2E","O-3E",
                    "W-1","W-2","W-3","W-4","W-5",
                    "E-1","E-2","E-3","E-4","E-5","E-6","E-7","E-8","E-9",
                  ].map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium">Move Type</label>
                <select
                  className="mt-1 w-full rounded-xl border bg-white px-3 py-2"
                  value={moveType}
                  onChange={(e) => setMoveType(e.target.value as MoveType)}
                >
                  <option value="ppm">PPM / DITY</option>
                  <option value="partial-ppm">Partial PPM</option>
                  <option value="government">Government-arranged move</option>
                </select>
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={withDependents}
                onChange={(e) => setWithDependents(e.target.checked)}
              />
              With dependents
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium">Travel Mode</label>
                <select
                  className="mt-1 w-full rounded-xl border bg-white px-3 py-2"
                  value={travelMode}
                  onChange={(e) => setTravelMode(e.target.value as TravelMode)}
                >
                  <option value="drive">Drive / POV</option>
                  <option value="fly">Fly</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium">Official Distance (miles)</label>
                <input
                  type="number"
                  className="mt-1 w-full rounded-xl border bg-white px-3 py-2"
                  value={officialMiles}
                  onChange={(e) => setOfficialMiles(Number(e.target.value) || 0)}
                />
                <p className="mt-1 text-xs text-gray-500">
                  Use official distance when possible, not just Google Maps.
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="block text-sm font-medium">Authorized POVs</label>
                <select
                  className="mt-1 w-full rounded-xl border bg-white px-3 py-2"
                  value={authorizedVehicles}
                  onChange={(e) => setAuthorizedVehicles(Number(e.target.value))}
                  disabled={travelMode !== "drive"}
                >
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium">Dependents 12+</label>
                <input
                  type="number"
                  min={0}
                  className="mt-1 w-full rounded-xl border bg-white px-3 py-2"
                  value={depAge12Plus}
                  onChange={(e) => setDepAge12Plus(Number(e.target.value) || 0)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium">Dependents under 12</label>
                <input
                  type="number"
                  min={0}
                  className="mt-1 w-full rounded-xl border bg-white px-3 py-2"
                  value={depUnder12}
                  onChange={(e) => setDepUnder12(Number(e.target.value) || 0)}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium">Travel Days Override (optional)</label>
              <input
                type="number"
                min={0}
                className="mt-1 w-full rounded-xl border bg-white px-3 py-2"
                value={travelDaysOverride}
                onChange={(e) => setTravelDaysOverride(Number(e.target.value) || 0)}
              />
              <p className="mt-1 text-xs text-gray-500">
                Leave at 0 to auto-calculate. Driving defaults to 400 miles on day one, then 350 miles per additional day.
              </p>
            </div>

            <div className="rounded-2xl border bg-gray-50 p-4">
              <div className="text-sm font-medium text-gray-900">TLE estimate</div>
              <p className="mt-1 text-xs text-gray-600">
                Standard CONUS TLE is capped at 21 days and $290/day in the normal case.
              </p>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium">Planned TLE Days</label>
                  <input
                    type="number"
                    min={0}
                    className="mt-1 w-full rounded-xl border bg-white px-3 py-2"
                    value={tleDays}
                    onChange={(e) => setTleDays(Number(e.target.value) || 0)}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium">Avg Reimbursable TLE / Day</label>
                  <input
                    type="number"
                    min={0}
                    className="mt-1 w-full rounded-xl border bg-white px-3 py-2"
                    value={tleAvgDailyReimbursable}
                    onChange={(e) => setTleAvgDailyReimbursable(Number(e.target.value) || 0)}
                  />
                </div>
              </div>
            </div>

            {moveType !== "government" && (
              <div className="rounded-2xl border bg-gray-50 p-4">
                <div className="text-sm font-medium text-gray-900">PPM / partial PPM inputs</div>
                <p className="mt-1 text-xs text-gray-600">
                  Best practice: use the estimate from your transportation office, DPS, or DD2278.
                </p>

                <div className="mt-4">
                  <label className="block text-sm font-medium">
                    Estimated PPM Incentive / Reimbursement
                  </label>
                  <input
                    type="number"
                    min={0}
                    className="mt-1 w-full rounded-xl border bg-white px-3 py-2"
                    value={ppmEstimate}
                    onChange={(e) => setPpmEstimate(Number(e.target.value) || 0)}
                  />
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium">Truck / trailer / rental</label>
                    <input
                      type="number"
                      min={0}
                      className="mt-1 w-full rounded-xl border bg-white px-3 py-2"
                      value={truckCost}
                      onChange={(e) => setTruckCost(Number(e.target.value) || 0)}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium">Fuel</label>
                    <input
                      type="number"
                      min={0}
                      className="mt-1 w-full rounded-xl border bg-white px-3 py-2"
                      value={fuelCost}
                      onChange={(e) => setFuelCost(Number(e.target.value) || 0)}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium">Packing supplies</label>
                    <input
                      type="number"
                      min={0}
                      className="mt-1 w-full rounded-xl border bg-white px-3 py-2"
                      value={packingCost}
                      onChange={(e) => setPackingCost(Number(e.target.value) || 0)}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium">Other move costs</label>
                    <input
                      type="number"
                      min={0}
                      className="mt-1 w-full rounded-xl border bg-white px-3 py-2"
                      value={otherMoveCost}
                      onChange={(e) => setOtherMoveCost(Number(e.target.value) || 0)}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="rounded-3xl border bg-white p-6 md:p-8 shadow-sm">
          <h2 className="text-lg font-semibold">Results</h2>
          <p className="mt-1 text-sm text-gray-600">
            Use this as a planning view, not your final settlement estimate.
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border p-4">
              <div className="text-sm font-medium">Primary DLA</div>
              <div className="mt-3 text-2xl font-bold">{fmtUSD(dla)}</div>
              <div className="mt-1 text-xs text-gray-500">
                Based on 2026 primary DLA rates for grade + dependency status
              </div>
            </div>

            <div className="rounded-2xl border p-4">
              <div className="text-sm font-medium">Travel Days Used</div>
              <div className="mt-3 text-2xl font-bold">{travelDays}</div>
              <div className="mt-1 text-xs text-gray-500">
                Auto: {autoTravelDays} day{autoTravelDays === 1 ? "" : "s"}
              </div>
            </div>

            <div className="rounded-2xl border p-4">
              <div className="text-sm font-medium">PCS Mileage (MALT)</div>
              <div className="mt-3 text-2xl font-bold">{fmtUSD(malt)}</div>
              <div className="mt-1 text-xs text-gray-500">
                {travelMode === "drive"
                  ? `${fmtUSD(PCS_MALT_RATE)}/mile equivalent per authorized POV`
                  : "Mileage only applies when driving"}
              </div>
            </div>

            <div className="rounded-2xl border p-4">
              <div className="text-sm font-medium">Member Per Diem</div>
              <div className="mt-3 text-2xl font-bold">{fmtUSD(memberPerDiem)}</div>
              <div className="mt-1 text-xs text-gray-500">
                {fmtUSD(memberPerDiemRate)} per day × {travelDays} day{travelDays === 1 ? "" : "s"}
              </div>
            </div>

            <div className="rounded-2xl border p-4">
              <div className="text-sm font-medium">Dependent Per Diem</div>
              <div className="mt-3 text-2xl font-bold">{fmtUSD(dependentPerDiem)}</div>
              <div className="mt-1 text-xs text-gray-500">
                75% for each dependent 12+, 50% for each dependent under 12
              </div>
            </div>

            <div className="rounded-2xl border p-4">
              <div className="text-sm font-medium">TLE Estimate</div>
              <div className="mt-3 text-2xl font-bold">{fmtUSD(tleEstimate)}</div>
              <div className="mt-1 text-xs text-gray-500">
                {tleEligibleDays} eligible day{tleEligibleDays === 1 ? "" : "s"} × {fmtUSD(tleDailyUsed)}
              </div>
            </div>
          </div>

          {moveType !== "government" && (
            <>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border p-4">
                  <div className="text-sm font-medium">Estimated PPM Incentive</div>
                  <div className="mt-3 text-2xl font-bold">{fmtUSD(ppmGross)}</div>
                  <div className="mt-1 text-xs text-gray-500">
                    Enter the number your move counselor / paperwork gives you
                  </div>
                </div>

                <div className="rounded-2xl border p-4">
                  <div className="text-sm font-medium">Entered Move Costs</div>
                  <div className="mt-3 text-2xl font-bold">{fmtUSD(outOfPocketMoveCosts)}</div>
                  <div className="mt-1 text-xs text-gray-500">
                    Truck + fuel + supplies + other costs
                  </div>
                </div>
              </div>

              <div className="mt-6 rounded-3xl border bg-gray-50 p-6">
                <div className="text-sm font-medium">PPM Net After Your Costs</div>
                <div className="mt-2 text-3xl font-bold">
                  {fmtUSD(ppmGross - outOfPocketMoveCosts)}
                </div>
                <p className="mt-2 text-sm text-gray-600">
                  This isolates the PPM piece only. Your total PCS picture below also adds DLA, mileage, per diem, and TLE.
                </p>
              </div>

              <div className="mt-6 rounded-2xl border p-4">
                <div className="text-sm font-medium">Move cost breakdown</div>
                <div className="mt-4 space-y-3">
                  {costRows.map((row) => (
                    <div key={row.label} className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">{row.label}</span>
                      <span className="font-medium">{fmtUSD(row.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          <div className="mt-6 rounded-3xl border bg-black p-6 text-white shadow-sm">
            <div className="text-sm font-medium text-white/80">Estimated total PCS picture</div>
            <div className="mt-2 text-4xl font-bold">{fmtUSD(totalEntitlements)}</div>
            <p className="mt-2 text-sm text-white/80">
              DLA + mileage + per diem + TLE {moveType !== "government" ? "+ entered PPM estimate" : ""}
            </p>

            {moveType !== "government" && (
              <>
                <div className="mt-5 border-t border-white/20 pt-5">
                  <div className="text-sm font-medium text-white/80">Net after entered move costs</div>
                  <div className="mt-2 text-3xl font-bold">{fmtUSD(netAfterCosts)}</div>
                </div>
              </>
            )}
          </div>

          <div className="mt-6 rounded-3xl border bg-gray-50 p-6">
            <div className="text-sm font-medium">Quick read</div>
            <div className="mt-2 text-3xl font-bold">{tone.label}</div>
            <p className="mt-2 text-sm text-gray-600">{tone.desc}</p>
          </div>

          <div className="mt-6 rounded-2xl border bg-gray-50 p-4 text-xs text-gray-600">
            <div className="font-medium text-gray-900">Important disclaimer</div>
            <p className="mt-1">
              This calculator is for education and planning only. It will not perfectly match your
              final PCS settlement. Actual entitlements depend on your orders, official distance,
              transportation counseling, receipts, lodging details, TLE/TLA eligibility, travel method,
              authorized vehicles, dependent travel circumstances, and finance office processing.
              Use this to get oriented, then verify the real numbers with your transportation office,
              finance office, DFAS, and the JTR.
            </p>
          </div>

          <div className="mt-6 rounded-2xl border p-4">
            <div className="text-sm font-medium">What to sanity-check before you rely on this</div>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-gray-600">
              <li>Use official mileage, not just Google Maps.</li>
              <li>Use your actual DD2278 / counseling estimate for PPM if available.</li>
              <li>Do not assume all TLE days will reimburse at the same amount.</li>
              <li>If your dependents travel separately, per diem can work differently.</li>
              <li>Keep receipts and pressure-test the numbers with finance before committing cash.</li>
            </ul>
          </div>
        </section>
      </div>

      <section className="rounded-3xl border bg-gray-50 p-6 md:p-8">
        <h2 className="text-lg font-semibold">Official links</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          <a
            href="https://www.travel.dod.mil/Travel-Transportation-Rates/Dislocation-Allowance/"
            target="_blank"
            rel="noreferrer"
            className="rounded-full border bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50"
          >
            DLA Rates
          </a>
          <a
            href="https://www.travel.dod.mil/Travel-Transportation-Rates/Mileage-Rates/"
            target="_blank"
            rel="noreferrer"
            className="rounded-full border bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50"
          >
            Mileage Rates
          </a>
          <a
            href="https://www.dfas.mil/MilitaryMembers/travelpay/armypcs/En-Route-Travel/"
            target="_blank"
            rel="noreferrer"
            className="rounded-full border bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50"
          >
            En Route Travel / Per Diem
          </a>
          <a
            href="https://www.dfas.mil/MilitaryMembers/travelpay/armypcs/tle/"
            target="_blank"
            rel="noreferrer"
            className="rounded-full border bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50"
          >
            TLE
          </a>
          <a
            href="https://www.travel.dod.mil/Policy-Regulations/Joint-Travel-Regulations/"
            target="_blank"
            rel="noreferrer"
            className="rounded-full border bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50"
          >
            JTR
          </a>
          <Link
            href="/terms"
            className="rounded-full border bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50"
          >
            Terms Explained
          </Link>
        </div>
      </section>
    </main>
  );
}