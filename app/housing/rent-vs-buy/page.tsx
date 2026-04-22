"use client";

import { useMemo, useState } from "react";

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

function monthlyMortgagePayment(principal: number, annualRate: number, years: number) {
  const monthlyRate = annualRate / 100 / 12;
  const n = years * 12;

  if (principal <= 0 || n <= 0) return 0;
  if (monthlyRate === 0) return principal / n;

  return (
    (principal * monthlyRate * Math.pow(1 + monthlyRate, n)) /
    (Math.pow(1 + monthlyRate, n) - 1)
  );
}

function remainingBalance(
  principal: number,
  annualRate: number,
  years: number,
  monthsPaid: number
) {
  const monthlyRate = annualRate / 100 / 12;
  const n = years * 12;

  if (principal <= 0 || n <= 0) return 0;
  if (monthsPaid <= 0) return principal;
  if (monthsPaid >= n) return 0;

  if (monthlyRate === 0) {
    const paid = (principal / n) * monthsPaid;
    return Math.max(principal - paid, 0);
  }

  const payment = monthlyMortgagePayment(principal, annualRate, years);

  return (
    principal * Math.pow(1 + monthlyRate, monthsPaid) -
    payment * ((Math.pow(1 + monthlyRate, monthsPaid) - 1) / monthlyRate)
  );
}

function getRecommendation({
  yearsAtStation,
  netBuyCost,
  totalRentCost,
  netRentalCashflow,
  keepAsRental,
}: {
  yearsAtStation: number;
  netBuyCost: number;
  totalRentCost: number;
  netRentalCashflow: number;
  keepAsRental: boolean;
}) {
  const diff = netBuyCost - totalRentCost;

  if (yearsAtStation < 3 && !keepAsRental) {
    return {
      label: "Rent usually safer",
      desc: "Short timelines often make buying harder to justify once closing costs and selling costs are included.",
    };
  }

  if (diff < -15000) {
    return {
      label: "Buying may make sense",
      desc: "In this model, buying looks meaningfully better than renting over your timeline.",
    };
  }

  if (diff > 15000) {
    return {
      label: "Rent likely cleaner",
      desc: "In this model, renting looks meaningfully cheaper after accounting for costs and recovered equity.",
    };
  }

  if (keepAsRental && netRentalCashflow >= 0) {
    return {
      label: "Could go either way",
      desc: "Buying may still work if you want to hold the property and the rental numbers stay healthy.",
    };
  }

  return {
    label: "Could go either way",
    desc: "This looks close enough that timeline, reserves, repairs, and your willingness to manage risk matter a lot.",
  };
}

export default function RentVsBuyPage() {
  const [homePrice, setHomePrice] = useState(500000);
  const [downPayment, setDownPayment] = useState(50000);
  const [interestRate, setInterestRate] = useState(6.5);
  const [loanTermYears, setLoanTermYears] = useState(30);

  const [propertyTaxMonthly, setPropertyTaxMonthly] = useState(450);
  const [homeInsuranceMonthly, setHomeInsuranceMonthly] = useState(125);
  const [hoaMonthly, setHoaMonthly] = useState(0);
  const [maintenanceMonthly, setMaintenanceMonthly] = useState(300);

  const [closingCostsBuy, setClosingCostsBuy] = useState(12000);
  const [sellingCostPct, setSellingCostPct] = useState(6.0);
  const [annualAppreciationPct, setAnnualAppreciationPct] = useState(2.0);

  const [yearsAtStation, setYearsAtStation] = useState(3);
  const [comparableRent, setComparableRent] = useState(3200);

  const [keepAsRental, setKeepAsRental] = useState(false);
  const [futureMonthlyRent, setFutureMonthlyRent] = useState(3400);
  const [vacancyPct, setVacancyPct] = useState(5.0);
  const [managementPct, setManagementPct] = useState(8.0);
  const [rentalMaintenanceMonthly, setRentalMaintenanceMonthly] = useState(200);

  const loanPrincipal = Math.max(homePrice - downPayment, 0);
  const monthsHeld = Math.max(Math.round(yearsAtStation * 12), 0);

  const mortgagePayment = useMemo(
    () => monthlyMortgagePayment(loanPrincipal, interestRate, loanTermYears),
    [loanPrincipal, interestRate, loanTermYears]
  );

  const remainingLoanBalance = useMemo(
    () => remainingBalance(loanPrincipal, interestRate, loanTermYears, monthsHeld),
    [loanPrincipal, interestRate, loanTermYears, monthsHeld]
  );

  const principalPaidDown = Math.max(loanPrincipal - remainingLoanBalance, 0);

  const monthlyOwnerCost =
    mortgagePayment +
    propertyTaxMonthly +
    homeInsuranceMonthly +
    hoaMonthly +
    maintenanceMonthly;

  const totalRentCost = comparableRent * monthsHeld;

  const estimatedFutureHomeValue =
    homePrice * Math.pow(1 + annualAppreciationPct / 100, yearsAtStation);

  const estimatedSellingCosts = estimatedFutureHomeValue * (sellingCostPct / 100);

  const grossEquityAtSale =
    estimatedFutureHomeValue - remainingLoanBalance - estimatedSellingCosts;

  const recoveredEquity = Math.max(grossEquityAtSale, 0);

  const cashOutflowsBuy =
    monthlyOwnerCost * monthsHeld + closingCostsBuy + downPayment;

  const netBuyCost = cashOutflowsBuy - recoveredEquity;

  const effectiveGrossRent =
    futureMonthlyRent * (1 - vacancyPct / 100);

  const propertyManagementMonthly =
    effectiveGrossRent * (managementPct / 100);

  const rentalPITIAndOps =
    mortgagePayment +
    propertyTaxMonthly +
    homeInsuranceMonthly +
    hoaMonthly +
    rentalMaintenanceMonthly +
    propertyManagementMonthly;

  const netRentalCashflow = effectiveGrossRent - rentalPITIAndOps;

  const recommendation = getRecommendation({
    yearsAtStation,
    netBuyCost,
    totalRentCost,
    netRentalCashflow,
    keepAsRental,
  });

  const difference = netBuyCost - totalRentCost;

  return (
    <main className="mx-auto max-w-6xl space-y-8 p-6 md:p-10">
      <header className="rounded-3xl border bg-white p-6 md:p-8 shadow-sm">
        <h1 className="text-3xl font-semibold tracking-tight">Rent vs Buy</h1>
        <p className="mt-2 text-sm text-gray-600">
          Compare renting versus buying with more context: equity built, selling
          costs, appreciation assumptions, and the option to keep the property as a rental later.
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-3xl border bg-white p-6 md:p-8 shadow-sm">
          <h2 className="text-lg font-semibold">Inputs</h2>
          <p className="mt-1 text-sm text-gray-600">
            This is still a planning tool, not a perfect underwriting model. The goal is cleaner judgment.
          </p>

          <div className="mt-6 grid gap-4">
            <div>
              <label className="block text-sm font-medium">Home Price</label>
              <input
                type="number"
                className="mt-1 w-full rounded-xl border bg-white px-3 py-2"
                value={homePrice}
                onChange={(e) => setHomePrice(Number(e.target.value) || 0)}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium">Down Payment</label>
                <input
                  type="number"
                  className="mt-1 w-full rounded-xl border bg-white px-3 py-2"
                  value={downPayment}
                  onChange={(e) => setDownPayment(Number(e.target.value) || 0)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium">Interest Rate (%)</label>
                <input
                  type="number"
                  step="0.01"
                  className="mt-1 w-full rounded-xl border bg-white px-3 py-2"
                  value={interestRate}
                  onChange={(e) => setInterestRate(Number(e.target.value) || 0)}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium">Loan Term (Years)</label>
              <select
                className="mt-1 w-full rounded-xl border bg-white px-3 py-2"
                value={loanTermYears}
                onChange={(e) => setLoanTermYears(Number(e.target.value))}
              >
                <option value={15}>15</option>
                <option value={20}>20</option>
                <option value={30}>30</option>
              </select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium">Property Tax / Month</label>
                <input
                  type="number"
                  className="mt-1 w-full rounded-xl border bg-white px-3 py-2"
                  value={propertyTaxMonthly}
                  onChange={(e) => setPropertyTaxMonthly(Number(e.target.value) || 0)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium">Home Insurance / Month</label>
                <input
                  type="number"
                  className="mt-1 w-full rounded-xl border bg-white px-3 py-2"
                  value={homeInsuranceMonthly}
                  onChange={(e) => setHomeInsuranceMonthly(Number(e.target.value) || 0)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium">HOA / Month</label>
                <input
                  type="number"
                  className="mt-1 w-full rounded-xl border bg-white px-3 py-2"
                  value={hoaMonthly}
                  onChange={(e) => setHoaMonthly(Number(e.target.value) || 0)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium">Maintenance Reserve / Month</label>
                <input
                  type="number"
                  className="mt-1 w-full rounded-xl border bg-white px-3 py-2"
                  value={maintenanceMonthly}
                  onChange={(e) => setMaintenanceMonthly(Number(e.target.value) || 0)}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium">Buying Closing Costs</label>
                <input
                  type="number"
                  className="mt-1 w-full rounded-xl border bg-white px-3 py-2"
                  value={closingCostsBuy}
                  onChange={(e) => setClosingCostsBuy(Number(e.target.value) || 0)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium">Selling Cost (%)</label>
                <input
                  type="number"
                  step="0.1"
                  className="mt-1 w-full rounded-xl border bg-white px-3 py-2"
                  value={sellingCostPct}
                  onChange={(e) => setSellingCostPct(Number(e.target.value) || 0)}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium">Expected Years at Station</label>
                <input
                  type="number"
                  step="0.5"
                  className="mt-1 w-full rounded-xl border bg-white px-3 py-2"
                  value={yearsAtStation}
                  onChange={(e) => setYearsAtStation(Number(e.target.value) || 0)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium">Comparable Monthly Rent</label>
                <input
                  type="number"
                  className="mt-1 w-full rounded-xl border bg-white px-3 py-2"
                  value={comparableRent}
                  onChange={(e) => setComparableRent(Number(e.target.value) || 0)}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium">Annual Appreciation Assumption (%)</label>
              <input
                type="number"
                step="0.1"
                className="mt-1 w-full rounded-xl border bg-white px-3 py-2"
                value={annualAppreciationPct}
                onChange={(e) => setAnnualAppreciationPct(Number(e.target.value) || 0)}
              />
              <p className="mt-1 text-xs text-gray-500">
                Keep this conservative. You can even set it to 0% as a stress test.
              </p>
            </div>

            <div className="rounded-2xl border bg-gray-50 p-4">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={keepAsRental}
                  onChange={(e) => setKeepAsRental(e.target.checked)}
                />
                I may keep this property as a rental after I PCS
              </label>

              {keepAsRental && (
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium">Expected Monthly Rent</label>
                    <input
                      type="number"
                      className="mt-1 w-full rounded-xl border bg-white px-3 py-2"
                      value={futureMonthlyRent}
                      onChange={(e) => setFutureMonthlyRent(Number(e.target.value) || 0)}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium">Vacancy (%)</label>
                    <input
                      type="number"
                      step="0.1"
                      className="mt-1 w-full rounded-xl border bg-white px-3 py-2"
                      value={vacancyPct}
                      onChange={(e) => setVacancyPct(Number(e.target.value) || 0)}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium">Property Management (%)</label>
                    <input
                      type="number"
                      step="0.1"
                      className="mt-1 w-full rounded-xl border bg-white px-3 py-2"
                      value={managementPct}
                      onChange={(e) => setManagementPct(Number(e.target.value) || 0)}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium">Rental Maintenance / Month</label>
                    <input
                      type="number"
                      className="mt-1 w-full rounded-xl border bg-white px-3 py-2"
                      value={rentalMaintenanceMonthly}
                      onChange={(e) => setRentalMaintenanceMonthly(Number(e.target.value) || 0)}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-3xl border bg-white p-6 md:p-8 shadow-sm">
          <h2 className="text-lg font-semibold">Results</h2>
          <p className="mt-1 text-sm text-gray-600">
            A more realistic comparison that gives buying credit for equity built.
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border p-4">
              <div className="text-sm font-medium">Loan Principal</div>
              <div className="mt-3 text-2xl font-bold">{fmtUSD(loanPrincipal)}</div>
            </div>

            <div className="rounded-2xl border p-4">
              <div className="text-sm font-medium">Mortgage Payment</div>
              <div className="mt-3 text-2xl font-bold">{fmtUSD(mortgagePayment)}</div>
              <div className="mt-1 text-xs text-gray-500">Principal + interest</div>
            </div>

            <div className="rounded-2xl border p-4">
              <div className="text-sm font-medium">Monthly Owner Cost</div>
              <div className="mt-3 text-2xl font-bold">{fmtUSD(monthlyOwnerCost)}</div>
              <div className="mt-1 text-xs text-gray-500">
                Mortgage + tax + insurance + HOA + maintenance
              </div>
            </div>

            <div className="rounded-2xl border p-4">
              <div className="text-sm font-medium">Monthly Rent</div>
              <div className="mt-3 text-2xl font-bold">{fmtUSD(comparableRent)}</div>
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border p-4">
              <div className="text-sm font-medium">Principal Paid Down</div>
              <div className="mt-3 text-2xl font-bold">{fmtUSD(principalPaidDown)}</div>
              <div className="mt-1 text-xs text-gray-500">
                Equity built from paying down the loan over your timeline
              </div>
            </div>

            <div className="rounded-2xl border p-4">
              <div className="text-sm font-medium">Estimated Future Home Value</div>
              <div className="mt-3 text-2xl font-bold">{fmtUSD(estimatedFutureHomeValue)}</div>
              <div className="mt-1 text-xs text-gray-500">
                Based on your appreciation assumption of {fmtPct(annualAppreciationPct)}
              </div>
            </div>

            <div className="rounded-2xl border p-4">
              <div className="text-sm font-medium">Recovered Equity at Sale</div>
              <div className="mt-3 text-2xl font-bold">{fmtUSD(recoveredEquity)}</div>
              <div className="mt-1 text-xs text-gray-500">
                After estimated selling costs and remaining loan balance
              </div>
            </div>

            <div className="rounded-2xl border p-4">
              <div className="text-sm font-medium">Net Buy Cost</div>
              <div className="mt-3 text-2xl font-bold">{fmtUSD(netBuyCost)}</div>
              <div className="mt-1 text-xs text-gray-500">
                Cash outflows minus recovered equity
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border p-4">
              <div className="text-sm font-medium">Total Rent Cost</div>
              <div className="mt-3 text-2xl font-bold">{fmtUSD(totalRentCost)}</div>
              <div className="mt-1 text-xs text-gray-500">
                Over {yearsAtStation} year{yearsAtStation === 1 ? "" : "s"}
              </div>
            </div>

            {keepAsRental && (
              <div className="rounded-2xl border p-4">
                <div className="text-sm font-medium">Estimated Rental Cash Flow</div>
                <div className="mt-3 text-2xl font-bold">{fmtUSD(netRentalCashflow)}</div>
                <div className="mt-1 text-xs text-gray-500">
                  Expected rent after vacancy minus mortgage, tax, insurance, HOA,
                  maintenance, and management
                </div>
              </div>
            )}
          </div>

          <div className="mt-6 rounded-3xl border bg-gray-50 p-6">
            <div className="text-sm font-medium">Recommendation</div>
            <div className="mt-2 text-3xl font-bold">{recommendation.label}</div>
            <p className="mt-2 text-sm text-gray-600">{recommendation.desc}</p>
            <p className="mt-2 text-sm text-gray-600">
              Difference over your timeline: {fmtUSD(Math.abs(difference))}{" "}
              {difference > 0
                ? "more net cost to buy than rent"
                : difference < 0
                ? "less net cost to buy than rent"
                : "difference"}.
            </p>
          </div>

          <div className="mt-6 rounded-2xl border bg-gray-50 p-4 text-xs text-gray-600">
            <div className="font-medium text-gray-900">Important note</div>
            <p className="mt-1">
              This is a planning tool for educational purposes only. It is not
              financial, tax, legal, or lending advice. Use it to frame the
              decision, then pressure-test the deal with a lender, agent, or
              other qualified professional before buying. Small changes in rate,
              repairs, appreciation, selling costs, or time at station can
              materially change the result.
            </p>
          </div>

          <div className="mt-6 rounded-2xl border p-4">
            <div className="text-sm font-medium">What to ask before buying</div>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-gray-600">
              <li>How long do I realistically expect to stay here?</li>
              <li>Do I still like the deal if appreciation is 0%?</li>
              <li>Can I cover repairs and closing costs without draining my emergency fund?</li>
              <li>If I PCS, would this still work as a rental after vacancy and maintenance?</li>
              <li>Have I seen the full lender estimate, not just the headline rate?</li>
            </ul>
          </div>
        </section>
      </div>
    </main>
  );
}