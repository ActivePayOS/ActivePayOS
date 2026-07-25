import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "Terms of Service for ActivePayOS — an independent, educational military pay and planning tool. Provided AS IS with no warranty; not financial, tax, or legal advice.",
};

const UPDATED = "July 24, 2026";

export default function TermsOfServicePage() {
  return (
    <main className="mx-auto max-w-3xl p-6 md:p-10">
      <h1 className="text-3xl font-semibold">Terms of Service</h1>
      <p className="mt-2 text-sm text-gray-500">Last updated: {UPDATED}</p>

      <div className="mt-6 space-y-6 text-sm leading-6 text-gray-700">
        <section>
          <h2 className="text-lg font-semibold text-gray-900">1. Acceptance of these terms</h2>
          <p className="mt-2">
            ActivePayOS (the &ldquo;Service,&rdquo; &ldquo;we,&rdquo; &ldquo;us&rdquo;) is a free,
            open-source website that provides educational military pay and planning tools. By
            accessing or using the Service, you agree to these Terms of Service. If you do not
            agree, do not use the Service.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900">2. Not an official or affiliated service</h2>
          <p className="mt-2">
            ActivePayOS is an independent project. It is <strong>not</strong> affiliated with,
            endorsed by, or connected to the U.S. Department of War / Department of Defense
            (DoD), the Defense Finance and Accounting Service (DFAS), the Department of Veterans
            Affairs, or any branch of the U.S. military. Any references to those organizations are for identification and educational
            purposes only.
          </p>
          <p className="mt-2">
            ActivePayOS is a personal project of its maintainers and contributors, created and
            maintained in their personal capacities. Nothing on this site is produced in
            anyone&apos;s official capacity, and nothing on this site represents the views of any
            government entity or any employer.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900">3. Educational estimates, not advice</h2>
          <p className="mt-2">
            All figures — including base pay, BAH, BAS, taxes, FICA, TSP, retirement, and budget
            outputs — are <strong>estimates</strong> generated from public reference data and
            simplifying assumptions. They may not reflect your actual entitlements, withholding, or
            circumstances. The Service does not provide financial, investment, tax, retirement,
            legal, or career advice, and no advisor-client or fiduciary relationship is created by
            your use of it. Always verify your numbers against your Leave and Earnings Statement
            (LES), myPay, and DFAS, and consult a qualified professional before making any financial,
            tax, career, or relocation decision.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900">4. &ldquo;AS IS&rdquo; — no warranty</h2>
          <p className="mt-2">
            THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE,&rdquo; WITHOUT
            WARRANTIES OF ANY KIND, WHETHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED
            WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, ACCURACY, AND
            NON-INFRINGEMENT. We do not warrant that the Service will be accurate, complete,
            uninterrupted, error-free, or current.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900">5. Limitation of liability</h2>
          <p className="mt-2">
            To the maximum extent permitted by law, ActivePayOS and its maintainers, contributors,
            and affiliates will not be liable for any indirect, incidental, special, consequential,
            or punitive damages, or for any loss of data, income, profits, or entitlements, arising
            out of or related to your use of (or inability to use) the Service, even if advised of
            the possibility of such damages. Because the Service is provided free of charge, our
            total aggregate liability for any claim relating to the Service is limited to USD $0.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900">6. Your responsibilities</h2>
          <p className="mt-2">
            You agree to use the Service only for lawful purposes, not to misuse or attempt to
            disrupt it, and to independently verify any figure before relying on it. You are
            responsible for your own financial and career decisions.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900">7. Intellectual property and licensing</h2>
          <p className="mt-2">
            The ActivePayOS source code is open source under the GNU Affero General Public License
            v3.0 or later. Reference data under our data directory originates from U.S. Government
            sources and is in the public domain. The name &ldquo;ActivePayOS,&rdquo; the logo, and
            the activepayos.com brand are not covered by the code license. See the{" "}
            <Link href="/accuracy" className="underline">Accuracy</Link> page and our repository for
            details.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900">8. Third-party links</h2>
          <p className="mt-2">
            The Service may link to third-party websites (such as DFAS or DTMO). We are not
            responsible for the content, accuracy, or practices of those sites.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900">9. Changes to the Service and these terms</h2>
          <p className="mt-2">
            We may modify, suspend, or discontinue any part of the Service, and may update these
            Terms, at any time. Continued use after changes become effective constitutes acceptance
            of the revised Terms.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900">10. Governing law</h2>
          <p className="mt-2">
            These Terms are governed by the laws of the United States and the State of the
            maintainers&rsquo; principal residence, without regard to conflict-of-laws rules. If any
            provision is found unenforceable, the remaining provisions remain in effect.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900">11. Contact</h2>
          <p className="mt-2">
            Questions about these Terms? Reach us via the{" "}
            <Link href="/contact" className="underline">Contact</Link> page. See also our{" "}
            <Link href="/privacy" className="underline">Privacy</Link> policy and the plain-English{" "}
            <Link href="/terms" className="underline">military pay terms</Link> glossary.
          </p>
        </section>
      </div>
    </main>
  );
}
