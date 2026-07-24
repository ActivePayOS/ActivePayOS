import type { Metadata } from "next";
import BudgetClient from "./budget-client";

export const metadata: Metadata = {
  title: "Budget Builder",
  description:
    "Build a monthly military budget and visualize your income and spending as an exportable Sankey diagram. Runs entirely in your browser — your numbers are never sent to a server.",
};

export default function BudgetPage() {
  return <BudgetClient />;
}
