import type { Metadata } from "next";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
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
          <SiteHeader />

          <div className="pb-16 pt-8">{children}</div>

          <footer className="border-t py-8 text-xs text-gray-500">
            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <div className="text-sm font-semibold text-gray-700">ActivePayOS</div>
                <p className="mt-2 leading-5">
                  Built by the military community, for the military community. Free, open source,
                  and private — your numbers stay in your browser.
                </p>
              </div>
              <div>
                <div className="font-semibold uppercase tracking-wide text-gray-600">Tools</div>
                <div className="mt-2 grid gap-1.5">
                  <Link href="/" className="hover:underline">Pay Calculator</Link>
                  <Link href="/budget" className="hover:underline">Budget Builder</Link>
                  <Link href="/toolkits/wealth-projector" className="hover:underline">Wealth Projector</Link>
                  <Link href="/toolkits/promotion-timeline" className="hover:underline">Career Timeline</Link>
                  <Link href="/housing" className="hover:underline">Housing</Link>
                  <Link href="/pcs" className="hover:underline">PCS</Link>
                </div>
              </div>
              <div>
                <div className="font-semibold uppercase tracking-wide text-gray-600">Learn</div>
                <div className="mt-2 grid gap-1.5">
                  <Link href="/toolkits" className="hover:underline">Toolkits</Link>
                  <Link href="/terms" className="hover:underline">Terms Explained</Link>
                  <Link href="/resources" className="hover:underline">Resources</Link>
                  <Link href="/accuracy" className="hover:underline">Accuracy</Link>
                </div>
              </div>
              <div>
                <div className="font-semibold uppercase tracking-wide text-gray-600">Project</div>
                <div className="mt-2 grid gap-1.5">
                  <Link href="/about" className="hover:underline">About</Link>
                  <Link href="/contact" className="hover:underline">Contact</Link>
                  <Link href="/privacy" className="hover:underline">Privacy</Link>
                  <Link href="/terms-of-service" className="hover:underline">Terms of Service</Link>
                  <a href={GITHUB_REPO} target="_blank" rel="noreferrer" className="hover:underline">
                    GitHub
                  </a>
                </div>
              </div>
            </div>

            <div className="mt-8 border-t pt-6 font-medium text-gray-700">
              © {new Date().getFullYear()} ActivePayOS — built by the military community, for the
              military community.
            </div>

            <div className="mt-4 space-y-3 leading-5">
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
