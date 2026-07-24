import type { Metadata } from "next";
import ToolkitPage from "@/components/ToolkitPage";
import { studentLoans } from "@/data/toolkits/student-loans";

export const metadata: Metadata = {
  title: "Student Loans Toolkit",
  description:
    "Understand your student loan options in the military — PSLF, repayment plans, and how to decide between paying off debt and investing.",
};

export default function Page() {
  return <ToolkitPage toolkit={studentLoans} />;
}