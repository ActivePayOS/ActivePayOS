import Link from "next/link";
import { stateTaxContexts, stateTaxReferenceLinks } from "@/data/state-tax-context";

const linkGroups = [
  {
    title: "Pay, Allowances, and Payroll",
    links: [
      { label: "DFAS Pay Tables", href: "https://www.dfas.mil/MilitaryMembers/payentitlements/Pay-Tables/" },
      { label: "DFAS Pay Info", href: "https://www.dfas.mil/" },
      { label: "myPay", href: "https://mypay.dfas.mil/" },
      { label: "Official BAH Info", href: "https://militarypay.defense.gov/PAY/Allowances/bah.aspx" },
      { label: "Official Allowances Info", href: "https://militarypay.defense.gov/Pay-and-Allowances/Allowances/" },
    ],
  },
  {
    title: "PCS and Travel",
    links: [
      { label: "Joint Travel Regulations (JTR)", href: "https://www.travel.dod.mil/Policy-Regulations/Joint-Travel-Regulations/" },
      { label: "Defense Travel", href: "https://www.travel.dod.mil/" },
      { label: "Dislocation Allowance", href: "https://www.travel.dod.mil/Travel-Transportation-Rates/Dislocation-Allowance/" },
      { label: "Mileage Rates", href: "https://www.travel.dod.mil/Travel-Transportation-Rates/Mileage-Rates/" },
      { label: "DFAS En Route Travel", href: "https://www.dfas.mil/MilitaryMembers/travelpay/armypcs/En-Route-Travel/" },
      { label: "DFAS Temporary Lodging Expense", href: "https://www.dfas.mil/MilitaryMembers/travelpay/armypcs/tle/" },
      { label: "Military OneSource PCS Moving Resources", href: "https://www.militaryonesource.mil/moving-pcs/" },
    ],
  },
  {
    title: "Benefits, Retirement, and Records",
    links: [
      { label: "TSP", href: "https://www.tsp.gov/" },
      { label: "DoD Blended Retirement System", href: "https://militarypay.defense.gov/BlendedRetirement/" },
      { label: "milConnect", href: "https://milconnect.dmdc.osd.mil/" },
      { label: "TRICARE", href: "https://www.tricare.mil/" },
      { label: "SGLI", href: "https://www.va.gov/life-insurance/options-eligibility/sgli/" },
    ],
  },
  {
    title: "Taxes, Student Loans, and Legal Protections",
    links: [
      { label: "IRS Military Tax Information", href: "https://www.irs.gov/individuals/military" },
      ...stateTaxReferenceLinks,
      { label: "SCRA Website", href: "https://scra.dmdc.osd.mil/scra/" },
      { label: "Military OneSource", href: "https://www.militaryonesource.mil/" },
      { label: "Federal Student Aid", href: "https://studentaid.gov/" },
      { label: "PSLF Info", href: "https://studentaid.gov/manage-loans/forgiveness-cancellation/public-service" },
    ],
  },
];

const stateTaxAgencyLinks = stateTaxContexts.map((state) => ({
  label: `${state.state} (${state.abbreviation})`,
  href: state.stateTaxAgencyUrl,
}));

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
          ActivePayOS Toolkits
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
                <span className="group-hover:underline">Open</span> -&gt;
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
                <span className="group-hover:underline">Open</span> -&gt;
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-12 rounded-3xl border bg-white p-6 shadow-sm md:p-8">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Links</h2>
            <p className="mt-2 max-w-3xl text-sm text-gray-600">
              Official and external resources referenced across ActivePayOS, grouped
              here so they are easy to find and audit.
            </p>
          </div>
          <Link
            href="/accuracy"
            className="w-fit rounded-full border bg-gray-50 px-4 py-2 text-sm font-medium hover:bg-gray-100"
          >
            Data & Accuracy
          </Link>
        </div>

        <div className="mt-6 grid gap-5 md:grid-cols-2">
          {linkGroups.map((group) => (
            <div key={group.title} className="rounded-2xl border bg-gray-50 p-5">
              <h3 className="text-sm font-semibold">{group.title}</h3>
              <div className="mt-4 grid gap-2">
                {group.links.map((link) => (
                  <a
                    key={link.href + link.label}
                    href={link.href}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-xl border bg-white px-3 py-2 text-sm hover:bg-gray-50"
                  >
                    {link.label} -&gt;
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>

        <details className="mt-5 rounded-2xl border bg-gray-50 p-5">
          <summary className="cursor-pointer text-sm font-semibold">
            State tax agency links
          </summary>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {stateTaxAgencyLinks.map((link) => (
              <a
                key={link.href + link.label}
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl border bg-white px-3 py-2 text-sm hover:bg-gray-50"
              >
                {link.label} -&gt;
              </a>
            ))}
          </div>
        </details>
      </section>
    </main>
  );
}
