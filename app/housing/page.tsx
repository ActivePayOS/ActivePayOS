import Link from "next/link";

export default function HousingPage() {
  return (
    <main className="mx-auto max-w-5xl space-y-8 p-6 md:p-10">
      <header className="rounded-3xl border bg-white p-6 md:p-8 shadow-sm">
        <h1 className="text-3xl font-semibold tracking-tight">Housing</h1>
        <p className="mt-2 text-sm text-gray-600">
          Use your BAH wisely. Figure out what you can actually afford, compare
          rent vs buy, and avoid housing decisions that wreck your budget.
        </p>
      </header>

      <section className="grid gap-6 md:grid-cols-2">
        <Link
          href="/housing/affordability"
          className="rounded-3xl border bg-white p-6 shadow-sm transition hover:shadow-md"
        >
          <h2 className="text-xl font-semibold">Can I Afford This Place?</h2>
          <p className="mt-2 text-sm text-gray-600">
            A quick reality check using your BAH, rent, utilities, parking,
            renter&apos;s insurance, and commute costs.
          </p>

          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-gray-700">
            <li>See how much of your BAH housing will consume</li>
            <li>Estimate your monthly leftover or shortfall</li>
            <li>Get a simple Comfortable / Tight / Risky rating</li>
          </ul>

            <div className="mt-5">
              <span className="inline-flex items-center rounded-full bg-black px-4 py-2 text-sm font-medium text-white">
                Open tool
                <span className="ml-2">-&gt;</span>
              </span>
            </div>        </Link>

        <Link
          href="/housing/rent-vs-buy"
          className="rounded-3xl border bg-white p-6 shadow-sm transition hover:shadow-md"
        >
          <h2 className="text-xl font-semibold">Rent vs Buy</h2>
          <p className="mt-2 text-sm text-gray-600">
            Compare the real monthly cost of renting versus buying at your duty
            station.
          </p>

          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-gray-700">
            <li>Estimate monthly owner costs</li>
            <li>Compare against a rental alternative</li>
            <li>See whether buying likely makes sense for your timeline</li>
          </ul>

          <div className="mt-5">
          <span className="inline-flex items-center rounded-full bg-black px-4 py-2 text-sm font-medium text-white">
            Open tool
            <span className="ml-2">-&gt;</span>
          </span>
        </div>
        </Link>
      </section>

      <section className="rounded-3xl border bg-gray-50 p-6 md:p-8">
        <h2 className="text-lg font-semibold">Why this matters</h2>
        <p className="mt-2 text-sm text-gray-600">
          A lot of military housing mistakes start with one bad assumption:
          &quot;If my BAH covers it, I can afford it.&quot; In reality, utilities,
          parking, renter&apos;s insurance, commuting, and time at station all
          matter. These tools are here to help you make cleaner decisions before
          you sign anything.
        </p>
      </section>
    </main>
  );
}
