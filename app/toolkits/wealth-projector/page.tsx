import type { Metadata } from "next";
import WealthProjectorClient from "./wealth-projector-client";

export const metadata: Metadata = {
  title: "Wealth Projector",
  description:
    "Project your TSP, investments, and savings across your service commitment — BRS match, fund performance assumptions, inflation-adjusted totals, and year-by-year net worth.",
};

export default function Page() {
  return <WealthProjectorClient />;
}
