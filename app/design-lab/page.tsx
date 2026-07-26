import type { Metadata } from "next";
import DesignLabClient from "./design-lab-client";

export const metadata: Metadata = {
  title: "Design Lab",
  description: "Internal preview of UI direction candidates.",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <DesignLabClient />;
}
