import type { Metadata } from "next";
import Link from "next/link";
import zipMha from "@/data/bah/normalized/2026.zipmha.json";
import bahWith from "@/data/bah/normalized/2026.with.json";
import bahWithout from "@/data/bah/normalized/2026.without.json";
import basepay from "@/data/basepay/2026.json";
import { formatPayDataLastVerified } from "@/data/verification";

export const metadata: Metadata = {
  title: "Accuracy & Sources",
  description:
    "How ActivePayOS sources and verifies its 2026 military pay, BAH, and BAS data, and when it was last checked.",
};

type ZipMhaDataset = {
  year: number;
  zipToMha: Record<string, string>;
};

type BahDataset = {
  year: number;
  ratesByMha: Record<string, unknown>;
};

const dataSources = [
  {
    name: "Basic pay",
    status: "Verified",
    source: "DFAS 2026 military pay tables",
    href: "https://www.dfas.mil/MilitaryMembers/payentitlements/Pay-Tables/",
  },
  {
    name: "BAS",
    status: "Verified",
    source: "DFAS Basic Allowance for Subsistence table",
    href: "https://www.dfas.mil/MilitaryMembers/payentitlements/Pay-Tables/",
  },
  {
    name: "BAH rates",
    status: "Verified",
    source: "DTMO / Military Pay 2026 BAH tables",
    href: "https://militarypay.defense.gov/PAY/Allowances/bah.aspx",
  },
  {
    name: "OCONUS allowances",
    status: "Member verified",
    source:
      "OHA and OCONUS COLA are entered from the current DTMO calculators or the member's LES; ActivePayOS does not cache volatile exchange-rate results as guaranteed pay",
    href: "https://www.travel.dod.mil/Allowances/Overseas-Housing-Allowance/OHA-Rate-Lookup/",
  },
  {
    name: "FICA",
    status: "Estimated",
    source: "Social Security and Medicare payroll tax rates applied to base pay",
    href: "https://www.irs.gov/individuals/military",
  },
  {
    name: "Federal & state income tax",
    status: "Estimated",
    source:
      "2026 federal brackets and standard deduction (IRS Rev. Proc. 2025-32) with a user-selected flat state rate — an estimate, not your W-4 withholding",
    href: "https://www.irs.gov/pub/irs-drop/rp-25-32.pdf",
  },
  {
    name: "Civilian-equivalent salary",
    status: "Estimated",
    source:
      "Solved so a fully-taxable salary leaves the same after-tax cash; BAH/BAS are tax-exempt qualified military benefits (26 U.S.C. § 134). Full receipts shown in the calculator",
    href: "https://www.law.cornell.edu/uscode/text/26/134",
  },
];

function countNonstandardMha(zipToMha: Record<string, string>) {
  return Object.values(zipToMha).filter((mha) => mha.startsWith("XX")).length;
}

export default function AccuracyPage() {
  const zipDataset = zipMha as ZipMhaDataset;
  const withDataset = bahWith as BahDataset;
  const withoutDataset = bahWithout as BahDataset;
  const zipCount = Object.keys(zipDataset.zipToMha).length;
  const nonstandardZipCount = countNonstandardMha(zipDataset.zipToMha);
  const uniqueMhaCount = new Set(Object.values(zipDataset.zipToMha)).size;

  return (
    <main className="space-y-8">
      <header className="rounded-3xl border bg-white p-6 shadow-sm md:p-8">
        <p className="text-sm font-medium text-gray-500">Trust & verification</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Data & Accuracy
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-gray-600">
          ActivePayOS is an educational planning tool. The goal is to make military
          pay easier to understand while clearly separating official source data,
          estimates, and items that still require LES, myPay, DFAS, or finance-office
          verification.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-xs text-gray-500">Pay data year</div>
          <div className="mt-2 text-2xl font-semibold">{basepay.year}</div>
        </div>
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-xs text-gray-500">Last verified</div>
          <div className="mt-2 text-2xl font-semibold">
            {formatPayDataLastVerified("short")}
          </div>
        </div>
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-xs text-gray-500">BAH ZIPs loaded</div>
          <div className="mt-2 text-2xl font-semibold">{zipCount.toLocaleString()}</div>
        </div>
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-xs text-gray-500">Unique MHA codes</div>
          <div className="mt-2 text-2xl font-semibold">{uniqueMhaCount.toLocaleString()}</div>
        </div>
      </section>

      <section className="rounded-3xl border bg-white p-6 shadow-sm md:p-8">
        <h2 className="text-xl font-semibold">What Is Verified</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {dataSources.map((item) => (
            <a
              key={item.name}
              href={item.href}
              target="_blank"
              rel="noreferrer"
              className="rounded-2xl border p-5 transition hover:bg-gray-50"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="font-semibold">{item.name}</div>
                  <p className="mt-2 text-sm leading-6 text-gray-600">{item.source}</p>
                </div>
                <span className="rounded-full border bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700">
                  {item.status}
                </span>
              </div>
            </a>
          ))}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-3xl border bg-white p-6 shadow-sm md:p-8">
          <h2 className="text-xl font-semibold">BAH Coverage</h2>
          <dl className="mt-5 space-y-4 text-sm">
            <div className="flex justify-between gap-4 border-b pb-3">
              <dt className="text-gray-600">ZIP-to-MHA entries</dt>
              <dd className="font-semibold">{zipCount.toLocaleString()}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b pb-3">
              <dt className="text-gray-600">With-dependent rate areas</dt>
              <dd className="font-semibold">
                {Object.keys(withDataset.ratesByMha).length.toLocaleString()}
              </dd>
            </div>
            <div className="flex justify-between gap-4 border-b pb-3">
              <dt className="text-gray-600">Without-dependent rate areas</dt>
              <dd className="font-semibold">
                {Object.keys(withoutDataset.ratesByMha).length.toLocaleString()}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-gray-600">Non-standard mapped ZIPs</dt>
              <dd className="font-semibold">{nonstandardZipCount.toLocaleString()}</dd>
            </div>
          </dl>
          <p className="mt-5 text-sm leading-6 text-gray-600">
            Some ZIPs in the official ZIP-to-MHA file map to non-standard codes that do not
            appear in the local BAH rate workbook. ActivePayOS flags those instead of
            inventing a rate.
          </p>
        </div>

        <div className="rounded-3xl border bg-white p-6 shadow-sm md:p-8">
          <h2 className="text-xl font-semibold">Known Limits</h2>
          <ul className="mt-5 list-disc space-y-3 pl-5 text-sm leading-6 text-gray-600">
            <li>Federal and state income tax are annualized estimates (standard deduction, no credits, flat state rate) — actual withholding depends on your W-4 and state rules.</li>
            <li>Allotments, debts, meal deductions, and garnishments are not modeled; special pays, TSP, and SGLI are included only when you add them in the calculator.</li>
            <li>OCONUS estimates use the current monthly OHA and COLA amounts you enter from DTMO or your LES. Currency and station allowances can change each pay period.</li>
            <li>Your LES, orders, myPay settings, DFAS, and official finance guidance control over any estimate shown here.</li>
          </ul>
        </div>
      </section>

      <section className="rounded-3xl border bg-gray-50 p-6 md:p-8">
        <h2 className="text-xl font-semibold">How To Use These Numbers</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-gray-600">
          Treat ActivePayOS as a planning layer. Use it to understand the shape of your
          pay, catch obvious questions, and prepare for decisions. Before acting on a
          major financial choice, compare against your LES and official sources.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/pay"
            className="rounded-full border bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50"
          >
            Open Pay Calculator
          </Link>
          <Link
            href="/contact"
            className="rounded-full border bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50"
          >
            Report a Data Issue
          </Link>
        </div>
      </section>
    </main>
  );
}
