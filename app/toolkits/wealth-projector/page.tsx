import type { Metadata } from "next";
import WealthProjectorClient from "./wealth-projector-client";
import { LATEST_VERIFIED_PAY_YEAR, PAY_YEAR_REGISTRY } from "@/data/pay-year-registry";
import type { BasePayDataset } from "@/lib/pay/basepay-lookup";

export const metadata: Metadata = {
  title: "Wealth Projector",
  description:
    "Project your TSP, investments, and savings across your service commitment and beyond — typical promotions drive your pay and match, then everything compounds to any age you pick.",
};

export default function Page() {
  const payYears = Object.fromEntries(
    Object.entries(PAY_YEAR_REGISTRY).map(([year, pack]) => [year, pack.basepay as unknown as BasePayDataset])
  );
  return <WealthProjectorClient payYears={payYears} initialPayYear={LATEST_VERIFIED_PAY_YEAR} />;
}
