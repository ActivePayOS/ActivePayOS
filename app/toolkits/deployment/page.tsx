import type { Metadata } from "next";
import ToolkitPage from "@/components/ToolkitPage";
import { deployment } from "@/data/toolkits/deployment";

export const metadata: Metadata = {
  title: "Deployment Money Toolkit",
  description:
    "Set your finances up before you deploy — autopay, a savings plan, SCRA benefits, and a plan for extra income like tax-free combat pay.",
};

export default function Page() {
  return <ToolkitPage toolkit={deployment} />;
}