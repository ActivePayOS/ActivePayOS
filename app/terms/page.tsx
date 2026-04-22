import Link from "next/link";

const terms = [
  {
    title: "Base Pay",
    text: "Your main salary based on rank and years of service. This is the core taxable part of military pay.",
    linkLabel: "DFAS Pay Tables",
    href: "https://www.dfas.mil/MilitaryMembers/payentitlements/Pay-Tables/",
  },
  {
    title: "BAH",
    text: "Basic Allowance for Housing. A housing allowance based on duty location, pay grade, and dependent status. It is generally non-taxable. Living in government quarters or barracks can affect BAH eligibility and amount, so always verify with your LES.",
    linkLabel: "Official BAH Info",
    href: "https://militarypay.defense.gov/pay/allowances/bah.aspx",
  },
  {
    title: "BAS",
    text: "Basic Allowance for Subsistence. A food allowance. It is generally non-taxable. For many enlisted members, BAS can still be offset by meal-plan deductions depending on their situation.",
    linkLabel: "Official Allowances Info",
    href: "https://militarypay.defense.gov/pay/ALLOWANCES/",
  },
  {
    title: "LES",
    text: "Leave and Earnings Statement. The military version of a pay stub. It shows your pay, allowances, deductions, taxes, leave balance, and other details.",
    linkLabel: "myPay",
    href: "https://mypay.dfas.mil/",
  },
  {
    title: "TSP",
    text: "Thrift Savings Plan. The military and federal government retirement investment account. First you set your contribution amount in myPay, then you choose your investment allocation inside TSP.",
    linkLabel: "Official TSP Website",
    href: "https://www.tsp.gov/",
  },
  {
    title: "DFAS",
    text: "Defense Finance and Accounting Service. The main source for military pay tables, pay processing, and official finance information.",
    linkLabel: "DFAS",
    href: "https://www.dfas.mil/",
  },
  {
    title: "myPay",
    text: "The DFAS portal where many service members manage payroll items like TSP contribution percentages, tax withholding, and LES access.",
    linkLabel: "myPay Login",
    href: "https://mypay.dfas.mil/",
  },
  {
    title: "SGLI",
    text: "Servicemembers' Group Life Insurance. Military life insurance that shows up as a deduction on many LES statements unless you change coverage.",
    linkLabel: "Official SGLI Info",
    href: "https://www.va.gov/life-insurance/options-eligibility/sgli/",
  },
  {
    title: "YOS",
    text: "Years of Service. This affects base pay and is usually shown in military pay tables as steps like under 2, over 2, over 3, and so on.",
  },
  {
    title: "With Dependents",
    text: "A status that affects some pay and allowance calculations, especially BAH. It does not simply mean 'married' in every context, so verify with your records and LES.",
  },
  {
    title: "Barracks / Government Quarters",
    text: "Many junior enlisted members living in government quarters do not receive the normal BAH rate. BAS may still appear, but meal deductions can reduce what is actually paid out. Always verify with your LES.",
    linkLabel: "Official BAH Info",
    href: "https://militarypay.defense.gov/pay/allowances/bah.aspx",
  },
  {
    title: "FICA",
    text: "Payroll taxes for Social Security and Medicare. These are typically applied to taxable military pay like base pay, not to non-taxable allowances like BAH and BAS.",
  },
];

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-5xl space-y-8 p-6 md:p-10">
      <header className="rounded-3xl border bg-white p-6 md:p-8 shadow-sm">
        <h1 className="text-3xl font-semibold tracking-tight">
          Military Pay Terms Explained
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-gray-600">
          A plain-English guide to the most common military pay and benefits terms.
          The goal is simple: make the numbers less confusing.
        </p>

        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/pay"
            className="rounded-full border bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50"
          >
            Open Pay Calculator
          </Link>
          <Link
            href="/toolkits/retirement-tsp"
            className="rounded-full border bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50"
          >
            TSP Toolkit
          </Link>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        {terms.map((term) => (
            <div
                key={term.title}
                className="rounded-3xl border bg-white p-5 shadow-sm"
            >
                <h2 className="text-lg font-semibold">{term.title}</h2>
                <p className="mt-2 text-sm leading-6 text-gray-600">{term.text}</p>

                {term.href && term.linkLabel ? (
                <a
                    href={term.href}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-4 inline-block text-sm font-medium underline underline-offset-2 hover:text-gray-700"
                >
                    {term.linkLabel} →
                </a>
                ) : null}
            </div>
            ))}
      </section>

      <section className="rounded-3xl border bg-gray-50 p-6 md:p-8">
        <h2 className="text-lg font-semibold">A few important reminders</h2>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-gray-600">
          <li>Base pay is generally taxable. BAH and BAS are generally non-taxable.</li>
          <li>Your actual LES may look different because of deductions, tax withholding, meal plans, or special pays.</li>
          <li>OfficerOS is for education and planning. Always verify major decisions with your LES, DFAS, and official sources.</li>
        </ul>
      </section>
    </main>
  );
}