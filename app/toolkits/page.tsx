import Link from "next/link";

export default function ToolkitsPage() {
  const lifeStage = [
    {
      href: "/toolkits/just-commissioned",
      title: "Just Commissioned",
      desc: "First paycheck, TSP setup, and your first 90-day financial plan.",
    },
    {
      href: "/toolkits/junior-enlisted",
      title: "Junior Enlisted",
      desc: "Barracks vs apartment, savings starter plan, and avoiding common traps.",
    },
    {
      href: "/toolkits/just-married",
      title: "Just Married",
      desc: "BAH changes, Tricare basics, combined budgeting, and tax filing impacts.",
    },
    {
      href: "/toolkits/first-pcs",
      title: "First PCS",
      desc: "DLA, per diem, moving options, and housing decisions at the new station.",
    },
    {
      href: "/toolkits/deployment",
      title: "Deployment",
      desc: "Pre-deployment money setup, SCRA checklist, and savings strategy.",
    },
  ];

  const tools = [
    {
      href: "/toolkits/budget-planner",
      title: "Budget Planner",
      desc: "Export-ready budget plan powered by Base Pay + BAH + BAS.",
    },
    {
      href: "/toolkits/retirement-tsp",
      title: "TSP & Retirement",
      desc: "Contribution strategy, Roth vs Traditional, and long-term projections.",
    },
    {
      href: "/toolkits/promotion-planner",
      title: "Promotion Pay Planner",
      desc: "See what rank/YOS changes do to pay and how to allocate the raise.",
    },
    {
      href: "/toolkits/student-loans",
      title: "Student Loans",
      desc: "PSLF, repayment options, and payoff vs invest decision support.",
    },
  ];

  return (
    <main className="mx-auto max-w-6xl p-10">
      <header className="rounded-3xl border bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-semibold tracking-tight">
          OfficerOS Toolkits
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          Built for junior service members. Education + calculators, all in one place.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/pay"
            className="rounded-2xl border bg-gray-50 px-4 py-2 text-sm font-medium hover:bg-gray-100 transition"
          >
            Pay Calculator
          </Link>
        </div>
      </header>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Life Stage</h2>
        <div className="mt-4 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {lifeStage.map((x) => (
            <Link
              key={x.href}
              href={x.href}
              className="group block rounded-3xl border bg-white p-6 shadow-sm transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-black/20"
            >
              <div className="text-xl font-semibold">{x.title}</div>
              <div className="mt-2 text-sm text-gray-600">{x.desc}</div>
              <div className="mt-4 text-sm font-medium text-gray-900">
                <span className="group-hover:underline">Open</span> →
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-semibold">Financial Tools</h2>
        <div className="mt-4 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {tools.map((x) => (
            <Link
              key={x.href}
              href={x.href}
              className="group block rounded-3xl border bg-white p-6 shadow-sm transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-black/20"
            >
              <div className="text-xl font-semibold">{x.title}</div>
              <div className="mt-2 text-sm text-gray-600">{x.desc}</div>
              <div className="mt-4 text-sm font-medium text-gray-900">
                <span className="group-hover:underline">Open</span> →
              </div>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}