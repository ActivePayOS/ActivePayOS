import type { Metadata } from "next";
import Link from "next/link";
import { stateTaxContexts, stateTaxReferenceLinks } from "@/data/state-tax-context";

export const metadata: Metadata = {
  title: "Resources & Official Links",
  description:
    "Official and external references used across ActivePayOS — pay, PCS, benefits, taxes, and legal protections — grouped so they are easy to find and audit.",
};

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

export default function ResourcesPage() {
  return (
    <main className="space-y-8">
      <header className="rounded-3xl border bg-white p-6 shadow-sm md:p-8">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Resources & Official Links</h1>
            <p className="mt-2 max-w-3xl text-sm text-gray-600">
              Official and external references used across ActivePayOS, grouped here so they are
              easy to find and audit.
            </p>
          </div>
          <Link
            href="/accuracy"
            className="w-fit rounded-full border bg-gray-50 px-4 py-2 text-sm font-medium hover:bg-gray-100"
          >
            Data & Accuracy
          </Link>
        </div>
      </header>

      <section className="grid gap-5 md:grid-cols-2">
        {linkGroups.map((group) => (
          <div key={group.title} className="rounded-2xl border bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold">{group.title}</h2>
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
      </section>

      <details className="rounded-2xl border bg-gray-50 p-5">
        <summary className="cursor-pointer text-sm font-semibold">State tax agency links</summary>
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
    </main>
  );
}
