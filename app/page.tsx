import type { Metadata } from "next";
import PayClient from "./pay/pay-client";
import { GITHUB_REPO } from "@/components/ContributeCTA";

import basepay2026 from "@/data/basepay/2026.json";
import bas2026 from "@/data/bas/2026.json";

export const metadata: Metadata = {
  title: "2026 Military Pay Calculator",
  description:
    "Free 2026 military pay calculator — estimate base pay, BAH, BAS, taxes, and take-home by rank, years of service, and duty ZIP.",
};

export default function Home() {
  return (
    <div className="space-y-6">
      <a
        href={GITHUB_REPO}
        target="_blank"
        rel="noreferrer"
        className="block rounded-2xl border border-[var(--brand-blue)] bg-[var(--field-bg)] px-4 py-3 text-sm text-[var(--field-text)] transition hover:bg-[var(--field-bg-hover)]"
      >
        <strong>ActivePayOS is open source and community-driven.</strong> We are looking for
        collaborators to build this alongside us — contribute or share feedback on GitHub →
      </a>
      <PayClient initialYear={2026} basepay={basepay2026} bas={bas2026} />
    </div>
  );
}
