import type { Metadata } from "next";
import ToolkitPage from "@/components/ToolkitPage";
import { justMarried } from "@/data/toolkits/just-married";

export const metadata: Metadata = {
  title: "Just Married Toolkit",
  description:
    "What changes when you marry in the military — BAH with dependents, healthcare enrollment, budgeting together, and the key admin steps to take right away.",
};

export default function Page() {
  return <ToolkitPage toolkit={justMarried} />;
}