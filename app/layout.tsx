import type { Metadata } from "next";
import Link from "next/link";
import BrandLogo from "@/components/BrandLogo";
import ThemeToggle from "@/components/ThemeToggle";
import { GITHUB_REPO } from "@/components/ContributeCTA";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://activepayos.com"),
  title: {
    default: "ActivePayOS",
    template: "%s | ActivePayOS",
  },
  description:
    "Military pay and planning tools for base pay, BAH, BAS, budgeting, and military life toolkits.",
  keywords: [
    "military pay",
    "BAH calculator",
    "BAS",
    "base pay",
    "military budgeting",
    "officer pay",
    "enlisted pay",
    "TSP",
    "PCS planning",
  ],
  applicationName: "ActivePayOS",
  authors: [{ name: "Simon Gott" }, { name: "Nick Parker" }],
  creator: "ActivePayOS",
  publisher: "ActivePayOS",
  openGraph: {
    title: "ActivePayOS",
    description:
      "Military pay and planning tools for base pay, BAH, BAS, budgeting, and military life toolkits.",
    url: "https://activepayos.com",
    siteName: "ActivePayOS",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "ActivePayOS",
    description:
      "Military pay and planning tools for base pay, BAH, BAS, budgeting, and military life toolkits.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <body className="bg-gray-50 text-gray-900 antialiased">
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('apo-theme');var v=(t==='light'||t==='dark')?t:'light';document.documentElement.setAttribute('data-theme',v);}catch(e){document.documentElement.setAttribute('data-theme','light');}})();",
          }}
        />
        <div className="mx-auto max-w-6xl px-6">
          <header className="flex flex-col gap-4 py-6 md:flex-row md:items-center md:justify-between">
            <BrandLogo />

            <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm font-medium">
              <Link href="/" className="hover:text-[var(--brand-blue)]">
                Pay
              </Link>
              <Link href="/budget" className="hover:text-[var(--brand-blue)]">
                Budget
              </Link>
              <Link href="/housing" className="hover:text-[var(--brand-blue)]">
                Housing
              </Link>
              <Link href="/pcs" className="hover:text-[var(--brand-blue)]">
                PCS
              </Link>
              <Link href="/toolkits/promotion-timeline" className="hover:text-[var(--brand-blue)]">
                Timeline
              </Link>
              <Link href="/toolkits" className="hover:text-[var(--brand-blue)]">
                Toolkits
              </Link>
              <Link href="/about" className="hover:text-[var(--brand-blue)]">
                About
              </Link>
              <ThemeToggle />
            </nav>
          </header>

          <div className="pb-16">{children}</div>

          <footer className="border-t py-8 text-xs text-gray-500">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="font-medium text-gray-700">
                © {new Date().getFullYear()} ActivePayOS — built by the military community, for the
                military community.
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <Link href="/terms-of-service" className="hover:underline">
                  Terms of Service
                </Link>
                <Link href="/terms" className="hover:underline">
                  Terms Explained
                </Link>
                <Link href="/accuracy" className="hover:underline">
                  Accuracy
                </Link>
                <Link href="/resources" className="hover:underline">
                  Resources
                </Link>
                <Link href="/about" className="hover:underline">
                  About
                </Link>
                <Link href="/contact" className="hover:underline">
                  Contact
                </Link>
                <Link href="/privacy" className="hover:underline">
                  Privacy
                </Link>
                <a
                  href={GITHUB_REPO}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:underline"
                >
                  GitHub
                </a>
              </div>
            </div>

            <div className="mt-6 space-y-3 border-t pt-6 leading-5">
              <p className="font-semibold text-gray-600">
                Not official U.S. Government data. For educational and planning purposes only.
              </p>
              <p>
                ActivePayOS is an independent, open-source project and is not affiliated with,
                endorsed by, or connected to the U.S. Department of War / Department of Defense
                (DoD), DFAS, the VA, or any branch of the U.S. military. Pay, BAH, BAS, retirement, and benefit figures are
                estimates generated from public U.S. Government reference data and may not reflect
                your actual entitlements.
              </p>
              <p>
                <strong>Disclaimer:</strong> The information provided on ActivePayOS is for general
                informational and educational purposes only and does not constitute financial,
                investment, tax, retirement, or legal advice. ActivePayOS is not a registered
                financial advisor, broker-dealer, or tax professional, and no advisor-client or
                fiduciary relationship is created by your use of this site.
              </p>
              <p>
                Investing and financial decisions involve risk, including the possible loss of
                principal. Projected values, retirement comparisons, and growth assumptions are
                illustrative and are not guarantees of future results. Always verify your numbers
                against your LES, myPay, and DFAS, and consult a qualified professional before making
                any financial, tax, career, or relocation decision.
              </p>
              <p>
                By using ActivePayOS, you agree that the project, its maintainers, and contributors
                are not responsible or liable for any loss or damage arising from your use of this
                information.
              </p>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
