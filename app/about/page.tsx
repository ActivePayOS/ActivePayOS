import type { Metadata } from "next";
import Link from "next/link";
import ContributeCTA from "@/components/ContributeCTA";

export const metadata: Metadata = {
  title: "About",
  description:
    "ActivePayOS is a free, open-source, community-owned military pay and planning toolkit — transparent numbers you can verify, built for service members.",
};

const commitments = [
  {
    label: "Auditable Data",
    text: "Versioned 2026 pay, BAS, and BAH tables with visible source notes and repeatable checks. Every number can be traced back to its official source.",
  },
  {
    label: "Built in Public",
    text: "Designed to be a community-reviewed, open-source reference. The code is readable, the data is sourced, and corrections happen out in the open.",
  },
  {
    label: "Service Member First",
    text: "Plain-English tools for pay, housing, PCS, taxes, retirement, and the financial decisions that matter early in a career.",
  },
];

export default function AboutPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-8">
      <header className="rounded-3xl border bg-white p-6 shadow-sm md:p-8">
        <h1 className="text-3xl font-semibold tracking-tight">About ActivePayOS</h1>
        <p className="mt-3 text-gray-600">
          Hi. We started learning about military finances the same way most people do: by trying to
          figure it out ourselves.
        </p>
        <p className="mt-3 text-gray-600">
          How much money do I actually make? What happens if I have dependents? What is a good
          budgeting spreadsheet? What do all these numbers online actually mean — and which ones are
          correct? Very quickly we realized the problem: it is confusing.
        </p>
        <p className="mt-3 text-gray-600">
          So we built <strong>ActivePayOS</strong> — a free tool to help service members understand
          the basics of their finances: pay, housing allowances, budgeting, retirement, and the
          decisions that matter early in a career. Our goal is simple: cover the bases. Not
          complicated investing strategies, not endless financial theory — just the important things
          everyone in uniform should probably be doing.
        </p>
      </header>

      <section className="rounded-3xl border bg-white p-6 shadow-sm md:p-8">
        <p className="text-sm font-medium text-gray-500">Where this is going</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">
          Built to become the trusted military pay toolkit.
        </h2>
        <p className="mt-3 text-sm leading-6 text-gray-600">
          ActivePayOS is being shaped around accuracy, transparency, and community review so service
          members can understand the numbers before they make real financial decisions.
        </p>
        <div className="mt-6 grid gap-5 sm:grid-cols-3">
          {commitments.map((item) => (
            <div key={item.label} className="border-l pl-4">
              <div className="text-sm font-semibold">{item.label}</div>
              <p className="mt-2 text-sm leading-6 text-gray-600">{item.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border bg-white p-6 shadow-sm md:p-8">
        <h2 className="text-2xl font-semibold tracking-tight">Open, transparent, community-owned</h2>
        <p className="mt-3 text-sm leading-6 text-gray-600">
          ActivePayOS is a non-profit, community-owned public good. There is no profit motive — the
          mission is a trustworthy, openly verifiable pay reference for the military community, and a
          growing family of tools for service-member life.
        </p>
        <ul className="mt-5 space-y-3 text-sm leading-6 text-gray-700">
          <li>
            <strong>Free and open source.</strong> The application code is intended to be released
            under a copyleft open-source license so anyone can read it, check it, improve it, and
            contribute back. The community version cannot be taken private or enclosed.
          </li>
          <li>
            <strong>Public data, clearly labeled.</strong> The pay, BAH, and BAS tables come from
            U.S. Government sources and are public domain. Our original work is the curation,
            normalization, validation, and presentation around those numbers.
          </li>
          <li>
            <strong>Verify, do not just trust.</strong> Instead of a black box, every figure is meant
            to be sourced and versioned so you can check it yourself. See the{" "}
            <Link href="/accuracy" className="underline">Accuracy</Link> page and the{" "}
            <Link href="/resources" className="underline">Resources</Link> links.
          </li>
          <li>
            <strong>Community-shaped.</strong> Found a wrong number or have an idea? The goal is for
            corrections and contributions to happen in the open, with credit to the people who help.
          </li>
        </ul>
        <p className="mt-5 text-sm leading-6 text-gray-600">
          If ActivePayOS helps you get organized, avoid a mistake, or feel more confident about the
          numbers — then it is doing its job. We are glad you are here.
        </p>
        <p className="mt-3 text-sm italic text-gray-600">
          — Two friends who decided to build the tool we wish we had.
        </p>
      </section>

      <ContributeCTA />

      <section className="rounded-2xl border bg-gray-50 p-5 text-xs leading-5 text-gray-500">
        ActivePayOS is an independent, educational planning tool and a personal project of its
        maintainers and contributors, created and maintained in their personal capacities only. It is
        not produced in anyone&apos;s official capacity, and it does not represent the views of — and
        is not an official website of — the U.S. Department of War / Department of Defense
        (DoD), DFAS, or the VA. It is not affiliated with or endorsed by any branch of the U.S.
        military, and does not provide financial, tax, or legal advice. Figures are estimates —
        always verify with your LES, myPay, and DFAS before making decisions. See the full
        disclaimer in the page footer, our{" "}
        <Link href="/terms-of-service" className="underline">Terms of Service</Link>, and{" "}
        <Link href="/privacy" className="underline">Privacy</Link> policy.
      </section>
    </main>
  );
}
