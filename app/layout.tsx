import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://officeros.com"),
  title: {
    default: "OfficerOS",
    template: "%s | OfficerOS",
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
  applicationName: "OfficerOS",
  authors: [{ name: "Nicholas Parker" }],
  creator: "Nicholas Parker",
  publisher: "OfficerOS",
  openGraph: {
    title: "OfficerOS",
    description:
      "Military pay and planning tools for base pay, BAH, BAS, budgeting, and military life toolkits.",
    url: "https://officeros.com",
    siteName: "OfficerOS",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "OfficerOS",
    description:
      "Military pay and planning tools for base pay, BAH, BAS, budgeting, and military life toolkits.",
  },
};
//Important

// If your real deployed URL is not https://officeros.com, change these three places before saving:

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        className="bg-gray-50 text-gray-900 antialiased"
      >
        <div className="mx-auto max-w-6xl px-6">
          <header className="flex flex-col gap-4 py-6 md:flex-row md:items-center md:justify-between">
            <Link href="/" className="text-xl font-semibold tracking-tight">
              OfficerOS
            </Link>

            <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm font-medium">
              <Link href="/" className="hover:underline">
                Home
              </Link>
              <Link href="/pay" className="hover:underline">
                Pay
              </Link>
              <Link href="/housing" className="hover:underline">
                Housing
              </Link>
              <Link href="/pcs" className="hover:underline">
              PCS
            </Link>
              <Link href="/toolkits" className="hover:underline">
                Toolkits
              </Link>
              <Link href="/terms" className="hover:underline">
                Terms Explained
              </Link>
              <Link href="/about" className="hover:underline">
                About
              </Link>
              <Link href="/contact" className="hover:underline">
                Contact
              </Link>
              <Link href="/privacy" className="hover:text-gray-900">
                Privacy
              </Link>
            </nav>
          </header>

          <main className="pb-16">{children}</main>

          <footer className="border-t py-8 text-xs text-gray-500">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                (c) {new Date().getFullYear()} OfficerOS. Not affiliated with the U.S. Department of Defense.
                <br />
                For educational purposes only - verify financial decisions with DFAS and official sources.
              </div>

              <div className="flex items-center gap-4">
                <Link href="/contact" className="hover:underline">
                  Contact
                </Link>
               
              </div>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
