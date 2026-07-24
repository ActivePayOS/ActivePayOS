import type { Metadata } from "next";
import ToolkitPage from "@/components/ToolkitPage";
import { budgetPlanner } from "@/data/toolkits/budget-planner";

export const metadata: Metadata = {
  title: "Budget Planner Toolkit",
  description:
    "Build a clean monthly military budget using your Base Pay, BAH, and BAS, with housing and savings targets and a one-click exportable sheet.",
};

export default function Page() {
  return <ToolkitPage toolkit={budgetPlanner} />;
}