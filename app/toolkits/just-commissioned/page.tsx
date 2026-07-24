import type { Metadata } from "next";
import ToolkitPage from "@/components/ToolkitPage";
import { justCommissioned } from "@/data/toolkits/just-commissioned";

export const metadata: Metadata = {
  title: "Just Commissioned Toolkit",
  description:
    "A financial starter plan for new officers — understand your first paycheck, set up your TSP, and build a 90-day money plan after commissioning.",
};

export default function Page() {
  return <ToolkitPage toolkit={justCommissioned} />;
}