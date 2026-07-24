import type { Metadata } from "next";
import ToolkitPage from "@/components/ToolkitPage";
import { firstPcs } from "@/data/toolkits/first-pcs";

export const metadata: Metadata = {
  title: "First PCS Toolkit",
  description:
    "Make your first PCS move simple — understand the big entitlements, what to budget for, and how to avoid common money mistakes during a military move.",
};

export default function Page() {
  return <ToolkitPage toolkit={firstPcs} />;
}