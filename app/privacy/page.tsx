import Link from "next/link";

const privacySections = [
  {
    title: "What OfficerOS does",
    text: "OfficerOS provides educational military pay and planning tools. It helps you estimate things like base pay, BAH, and BAS using public reference data and the information you enter.",
  },
  {
    title: "What information you enter",
    text: "Depending on the tool, you may enter information like pay grade, years of service, ZIP code, dependent status, budget numbers, and other planning details.",
  },
  {
    title: "How your information is used",
    text: "The information you enter is used to generate calculator results and planning outputs on demand. OfficerOS is designed to help you understand your pay and build simple planning tools, not to create an official military pay record.",
  },
  {
    title: "ZIP code and pay inputs",
    text: "ZIP code, rank, years of service, and dependent status may be used to estimate housing allowance and related pay figures. These estimates should always be checked against your Leave and Earnings Statement (LES), DFAS, and official military sources.",
  },
  {
    title: "Spreadsheet exports",
    text: "If you use an export feature, files are generated from the values you provide at the time of export. These exports are for personal planning and organization.",
  },
  {
    title: "Data storage",
    text: "OfficerOS is intended to keep calculator use simple and lightweight. Unless a feature clearly says otherwise, do not assume that information you enter is stored as part of a permanent financial account or official record.",
  },
  {
    title: "Cookies and analytics",
    text: "OfficerOS may use basic website analytics, hosting logs, or similar tools to understand site performance and improve the experience. If analytics or cookies are added later, this page should be updated to reflect that clearly.",
  },
  {
    title: "Official sources still control",
    text: "OfficerOS is not part of the Department of Defense, DFAS, the U.S. military, or any government agency. Official pay systems, DFAS guidance, and your LES control over any estimate shown here.",
  },
  {
    title: "Children's privacy",
    text: "OfficerOS is intended for a general audience and is not designed for children to submit personal information.",
  },
  {
    title: "Changes to this policy",
    text: "This Privacy Policy may be updated over time as OfficerOS changes. ",
  },
  {
    title: "Questions",
    text: "If you have questions about privacy or data use on OfficerOS, please use the contact page.",
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
          A simple explanation of what OfficerOS does with the information you
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
            OfficerOS is for education and planning, not official payroll,
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