"use client";

import { useMemo, useState } from "react";
import { getBahRate } from "@/lib/pay/bah";

type PayGrade =
  | "O-1" | "O-2" | "O-3" | "O-4" | "O-5" | "O-6" | "O-7" | "O-8" | "O-9" | "O-10"
  | "W-1" | "W-2" | "W-3" | "W-4" | "W-5"
  | "E-1" | "E-2" | "E-3" | "E-4" | "E-5" | "E-6" | "E-7" | "E-8" | "E-9"
  | "O-1E" | "O-2E" | "O-3E";

function fmtUSD(v: number | null | undefined) {
  return typeof v === "number" && Number.isFinite(v)
    ? new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
      }).format(v)
    : "—";
}

function getHousingRating(housingPctOfBah: number) {
  if (housingPctOfBah <= 0.85) {
    return {
      label: "Comfortable",
      description: "This looks like a healthy housing setup relative to your BAH.",
    };
  }
  if (housingPctOfBah <= 1.0) {
    return {
      label: "Tight",
      description: "This may work, but there is not much room for housing surprises.",
    };
  }
  return {
    label: "Risky",
    description: "Your housing costs are above BAH. This can squeeze the rest of your budget quickly.",
  };
}

export default function HousingAffordabilityPage() {
  const [grade, setGrade] = useState<PayGrade>("O-1");
  const [zip, setZip] = useState("");
  const [dependents, setDependents] = useState(false);

  const [rent, setRent] = useState(3200);
  const [utilities, setUtilities] = useState(200);
  const [parking, setParking] = useState(0);
  const [rentersInsurance, setRentersInsurance] = useState(20);
  const [commute, setCommute] = useState(100);
  const [otherHousing, setOtherHousing] = useState(0);

  const bah = useMemo(() => getBahRate(zip, grade, dependents), [zip, grade, dependents]);

  const bahError = useMemo(() => {
    if (!zip || zip.trim().length === 0) return null;
    return bah === null
      ? "BAH data unavailable for this ZIP. Try a nearby ZIP."
      : null;
  }, [zip, bah]);

  const totalHousingCost =
    rent + utilities + parking + rentersInsurance + commute + otherHousing;

  const housingPctOfBah = bah && bah > 0 ? totalHousingCost / bah : 0;
  const leftover = (bah ?? 0) - totalHousingCost;
  const rating = getHousingRating(housingPctOfBah);

  const costRows = [
    { label: "Rent", value: rent },
    { label: "Utilities", value: utilities },
    { label: "Parking", value: parking },
    { label: "Renter’s Insurance", value: rentersInsurance },
    { label: "Commute / Transit", value: commute },
    { label: "Other Housing Costs", value: otherHousing },
  ];

  return (
    <main className="mx-auto max-w-6xl space-y-8 p-6 md:p-10">
      <header className="rounded-3xl border bg-white p-6 md:p-8 shadow-sm">
        <h1 className="text-3xl font-semibold tracking-tight">Can I Afford This Place?</h1>
        <p className="mt-2 text-sm text-gray-600">
          A quick BAH-based housing check. Enter your ZIP and expected monthly
          housing costs to see whether a place looks comfortable, tight, or risky.
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-3xl border bg-white p-6 md:p-8 shadow-sm">
          <h2 className="text-lg font-semibold">Inputs</h2>
          <p className="mt-1 text-sm text-gray-600">
            Start with your duty ZIP and expected monthly housing costs.
          </p>

          <div className="mt-6 grid gap-4">
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

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium">Duty ZIP</label>
                <input
                  className="mt-1 w-full rounded-xl border bg-white px-3 py-2"
                  value={zip}
                  onChange={(e) => setZip(e.target.value)}
                  placeholder="02139"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Uses BAH rates for this ZIP.
                </p>
                {bahError && (
                  <p className="mt-2 text-sm text-red-600">{bahError}</p>
                )}
              </div>

              <label className="mt-6 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={dependents}
                  onChange={(e) => setDependents(e.target.checked)}
                />
                With dependents
              </label>
            </div>

            <div>
              <label className="block text-sm font-medium">Monthly Rent</label>
              <input
                type="number"
                className="mt-1 w-full rounded-xl border bg-white px-3 py-2"
                value={rent}
                onChange={(e) => setRent(Number(e.target.value) || 0)}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium">Utilities</label>
                <input
                  type="number"
                  className="mt-1 w-full rounded-xl border bg-white px-3 py-2"
                  value={utilities}
                  onChange={(e) => setUtilities(Number(e.target.value) || 0)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium">Parking</label>
                <input
                  type="number"
                  className="mt-1 w-full rounded-xl border bg-white px-3 py-2"
                  value={parking}
                  onChange={(e) => setParking(Number(e.target.value) || 0)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium">Renter’s Insurance</label>
                <input
                  type="number"
                  className="mt-1 w-full rounded-xl border bg-white px-3 py-2"
                  value={rentersInsurance}
                  onChange={(e) => setRentersInsurance(Number(e.target.value) || 0)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium">Commute / Transit</label>
                <input
                  type="number"
                  className="mt-1 w-full rounded-xl border bg-white px-3 py-2"
                  value={commute}
                  onChange={(e) => setCommute(Number(e.target.value) || 0)}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium">Other Monthly Housing Costs</label>
              <input
                type="number"
                className="mt-1 w-full rounded-xl border bg-white px-3 py-2"
                value={otherHousing}
                onChange={(e) => setOtherHousing(Number(e.target.value) || 0)}
              />
              <p className="mt-1 text-xs text-gray-500">
                Example: storage, pet rent, amenity fee, or furniture rental.
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border bg-white p-6 md:p-8 shadow-sm">
          <h2 className="text-lg font-semibold">Results</h2>
          <p className="mt-1 text-sm text-gray-600">
            A simple housing affordability snapshot based on your BAH.
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border p-4">
              <div className="text-sm font-medium">Monthly BAH</div>
              <div className="mt-3 text-2xl font-bold">{fmtUSD(bah ?? 0)}</div>
            </div>

            <div className="rounded-2xl border p-4">
              <div className="text-sm font-medium">Total Housing Cost</div>
              <div className="mt-3 text-2xl font-bold">{fmtUSD(totalHousingCost)}</div>
            </div>

            <div className="rounded-2xl border p-4">
              <div className="text-sm font-medium">Housing vs BAH</div>
              <div className="mt-3 text-2xl font-bold">
                {bah && bah > 0 ? `${(housingPctOfBah * 100).toFixed(0)}%` : "—"}
              </div>
              <div className="mt-1 text-xs text-gray-500">
                Percent of your BAH consumed by housing-related costs.
              </div>
            </div>

            <div className="rounded-2xl border p-4">
              <div className="text-sm font-medium">Leftover / Shortfall</div>
              <div
                className={`mt-3 text-2xl font-bold ${
                  leftover >= 0 ? "text-gray-900" : "text-red-600"
                }`}
              >
                {fmtUSD(leftover)}
              </div>
              <div className="mt-1 text-xs text-gray-500">
                Positive means you are under BAH. Negative means you are over.
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-3xl border bg-gray-50 p-6">
            <div className="text-sm font-medium">Housing Rating</div>
            <div className="mt-2 text-3xl font-bold">{rating.label}</div>
            <p className="mt-2 text-sm text-gray-600">{rating.description}</p>
          </div>

          <div className="mt-6 rounded-2xl border p-4">
            <div className="text-sm font-medium">Cost Breakdown</div>
            <div className="mt-4 space-y-3">
              {costRows.map((row) => (
                <div key={row.label} className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">{row.label}</span>
                  <span className="font-medium">{fmtUSD(row.value)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 rounded-2xl border bg-gray-50 p-4 text-xs text-gray-600">
            <div className="font-medium text-gray-900">Important note</div>
            <p className="mt-1">
              This tool is meant to help you think through whether a place fits
              your BAH comfortably. It does not replace your full monthly budget.
              A place can fit inside BAH and still be too expensive once the rest
              of your spending is considered.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}