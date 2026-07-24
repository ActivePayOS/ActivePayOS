import type { Metadata } from "next";
import ToolkitPage from "@/components/ToolkitPage";
import { retirementTsp } from "@/data/toolkits/retirement-tsp";

export const metadata: Metadata = {
  title: "TSP & Retirement Toolkit",
  description:
    "A practical guide to the Thrift Savings Plan and military retirement — contribution strategy, Roth vs Traditional, matching, and turning raises into long-term wealth.",
};

export default function Page() {
  return <ToolkitPage toolkit={retirementTsp} />;
}