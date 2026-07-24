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
    text: "If you use a spreadsheet/PDF export, the values you provide are sent to ActivePayOS only to generate the file you download; they are not stored or kept after the file is produced.",
  },
  {
    title: "Data storage",
    text: "ActivePayOS is intended to keep calculator use simple and lightweight. Unless a feature clearly says otherwise, do not assume that information you enter is stored as part of a permanent financial account or official record.",
  },
  {
    title: "Cookies and analytics",
    text: "ActivePayOS may use basic website analytics, hosting logs, or similar tools to understand site performance and improve the experience. If analytics or cookies are added later, this page should be updated to reflect that clearly.",
  },
  {
    title: "Official sources still control",
    text: "ActivePayOS is not part of the U.S. Department of War (formerly the Department of Defense), DFAS, the U.S. military, or any government agency. Official pay systems, DFAS guidance, and your LES control over any estimate shown here.",
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