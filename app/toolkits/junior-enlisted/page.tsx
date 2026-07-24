import type { Metadata } from "next";
import ToolkitPage from "@/components/ToolkitPage";
import { juniorEnlisted } from "@/data/toolkits/junior-enlisted";

export const metadata: Metadata = {
  title: "Junior Enlisted Money Toolkit",
  description:
    "A simple money plan for your first duty station — housing, savings, debt payoff, and the common financial traps to avoid as a junior enlisted service member.",
};

export default function Page() {
  return <ToolkitPage toolkit={juniorEnlisted} />;
}