import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "How ActivePayOS handles your information. Calculations run in your browser, and the project avoids collecting personal data it does not need.",
};

const privacySections = [
  {
    title: "What ActivePayOS does",
    text: "ActivePayOS provides educational military pay and planning tools. It helps you estimate things like base pay, BAH, and BAS using public reference data and the information you enter.",
  },
  {
    title: "What information you enter",
    text: "Depending on the tool, you may enter information like pay grade, years of service, ZIP code, dependent status, budget numbers, and other planning details.",
  },
  {
    title: "How your information is used",
    text: "The information you enter is used to generate calculator results and planning outputs on demand. ActivePayOS is designed to help you understand your pay and build simple planning tools, not to create an official military pay record.",
  },
  {
    title: "ZIP code and pay inputs",
    text: "ZIP code, rank, years of service, and dependent status may be used to estimate housing allowance and related pay figures. These estimates should always be checked against your Leave and Earnings Statement (LES), DFAS, and official military sources.",
  },
  {
    title: "Budget Builder runs in your browser",
    text: "The Budget Builder and its Sankey diagram run entirely on your device. The income and expense numbers you enter there are used to draw the chart locally and are never sent to our servers. If you choose \"Save to this device,\" the budget is stored only in your own browser (local storage) and can be cleared at any time.",
  },
  {
    title: "Image exports are local",
    text: "Exporting the budget diagram as a PNG or SVG happens in your browser — the image is generated on your device and downloaded directly, with nothing uploaded to us or any third party.",
  },
  {
    title: "Spreadsheet exports",
    text: "The one exception to browser-only processing: if you use a file export (budget spreadsheet/PDF, timeline download, or the Wealth Projector's Excel model), the values you entered are sent to ActivePayOS once, used in memory to generate the file you download, and discarded. They are not written to disk, logged, or kept after the file is produced.",
  },
  {
    title: "No accounts, no database",
    text: "ActivePayOS has no user accounts and no database. There is nothing to sign up for, and nothing you enter is stored on our servers. If you choose \"Save to this device\" in a tool, that data lives only in your own browser's local storage.",
  },
  {
    title: "No analytics, no ads, no tracking",
    text: "ActivePayOS currently uses no analytics, no advertising, and no tracking cookies. The only thing stored in your browser is your theme preference and anything you explicitly save to your device. Our hosting provider keeps standard web server logs of page requests (like every website), but calculator inputs are not part of page URLs and do not appear in them. If analytics are ever added, this page will be updated first to say exactly what is collected.",
  },
  {
    title: "Official sources still control",
    text: "ActivePayOS is not part of the U.S. Department of War / Department of Defense (DoD), DFAS, the U.S. military, or any government agency. Official pay systems, DFAS guidance, and your LES control over any estimate shown here.",
  },
  {
    title: "Children's privacy",
    text: "ActivePayOS is intended for a general audience and is not designed for children to submit personal information.",
  },
  {
    title: "Changes to this policy",
    text: "This Privacy Policy may be updated over time as ActivePayOS changes. ",
  },
  {
    title: "Questions",
    text: "If you have questions about privacy or data use on ActivePayOS, please use the contact page.",
  },
];

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-5xl space-y-8 p-6 md:p-10">
      <header className="rounded-3xl border bg-white p-6 md:p-8 shadow-sm">
        <h1 className="text-3xl font-semibold tracking-tight">
          Privacy Policy
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-gray-600">
          A simple explanation of what ActivePayOS does with the information you
          enter while using the site.
        </p>

        <div className="mt-5 max-w-3xl rounded-2xl border-2 border-[var(--brand-blue,#1d4ed8)] bg-blue-50 p-5">
          <h2 className="text-base font-semibold text-gray-900">
            The short version: your inputs stay in your browser.
          </h2>
          <p className="mt-2 text-sm leading-6 text-gray-700">
            Every calculator on this site — pay, BAH, budget, housing, PCS, and
            promotion timeline — runs entirely on your device. Your pay grade,
            dependent status, ZIP code, and budget numbers are never sent to our
            servers, stored, or logged. The single exception is the optional
            file exports (budget spreadsheet/PDF, timeline downloads, and the Wealth Projector Excel model), which
            send your inputs to the server once to build the file you download
            and discard them immediately. We have no
            accounts, no database, no analytics, and no ads.
          </p>
        </div>

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
            Contact
          </Link>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        {privacySections.map((section) => (
          <div
            key={section.title}
            className="rounded-3xl border bg-white p-5 shadow-sm"
          >
            <h2 className="text-lg font-semibold">{section.title}</h2>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              {section.text}
            </p>
          </div>
        ))}
      </section>

      <section className="rounded-3xl border bg-gray-50 p-6 md:p-8">
        <h2 className="text-lg font-semibold">Important note</h2>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-gray-600">
          <li>
            ActivePayOS is for education and planning, not official payroll,
            legal, or tax advice.
          </li>
          <li>
            Always verify major financial or military pay decisions with your
            LES, DFAS, and official military sources.
          </li>
          
        </ul>
      </section>
    </main>
  );
}