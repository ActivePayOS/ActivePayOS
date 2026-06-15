import type { Metadata } from "next";
import PromotionTimelineClient from "./promotion-timeline-client";
import basepay2026 from "@/data/basepay/2026.json";

export const metadata: Metadata = {
  title: "Promotion & Milestone Timeline | ActivePayOS",
  description:
    "Project your military promotions and key milestones (GI Bill, ETS, retirement) over time from your contract details, with pay at each step.",
};

export default function Page() {
  return <PromotionTimelineClient basepay={basepay2026} />;
}
