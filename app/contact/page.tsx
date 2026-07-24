import type { Metadata } from "next";
import Link from "next/link";
import { GITHUB_REPO, GITHUB_NEW_ISSUE } from "@/components/ContributeCTA";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Get in touch with ActivePayOS for questions, bug reports, ideas, and feedback.",
};

export default function ContactPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-6 rounded-3xl border bg-white p-6 md:p-8 shadow-sm">
      <div>
        <h1 className="text-3xl font-semibold">Contact ActivePayOS</h1>
        <p className="mt-2 text-sm text-gray-600">
          Questions, bug reports, ideas, or feedback - send them our way.
        </p>
      </div>

      <div className="rounded-2xl border p-5">
        <h2 className="text-lg font-semibold">Email</h2>
        <p className="mt-2 text-sm text-gray-600">
          The simplest way to reach us right now is email.
        </p>
        <a
          href="mailto:contact@activepayos.com?subject=activepayos%20Question"
          className="mt-3 inline-block text-sm font-medium underline"
        >
          contact@activepayos.com
        </a>
      </div>

      <div className="rounded-2xl border p-5">
        <h2 className="text-lg font-semibold">What to send</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-gray-700">
          <li>Questions about how a tool works</li>
          <li>Bug reports or wrong numbers</li>
          <li>Ideas for new calculators or toolkits</li>
          <li>Anything that would make ActivePayOS more useful</li>
        </ul>
      </div>

      <div className="rounded-2xl border p-5">
        <h2 className="text-lg font-semibold">On GitHub</h2>
        <p className="mt-2 text-sm text-gray-600">
          ActivePayOS is open source. The fastest way to get something fixed — or to pitch in — is on
          GitHub. Leave feedback as an issue and we will track it in the open.
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          <a
            href={GITHUB_NEW_ISSUE}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-black bg-black px-4 py-2 font-medium text-white hover:bg-gray-800"
          >
            Leave feedback / file a ticket →
          </a>
          <a
            href={GITHUB_REPO}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border px-4 py-2 font-medium hover:bg-gray-100"
          >
            View the repo →
          </a>
        </div>
        <p className="mt-3 text-sm text-gray-600">
          Want to help build it? We would love the help — see the{" "}
          <Link href="/about" className="underline">
            About
          </Link>{" "}
          page.
        </p>
      </div>
    </main>
  );
}
