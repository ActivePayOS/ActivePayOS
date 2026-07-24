import type { Metadata } from "next";
import PromotionTimelineClient from "./promotion-timeline-client";
import basepay2026 from "@/data/basepay/2026.json";

export const metadata: Metadata = {
  title: "Career Milestone Planner",
  description:
    "Build an active-duty career planning scenario with typical promotion timing, GI Bill, ETS, retirement milestones, and pay estimates.",
};

export default function Page() {
  return <PromotionTimelineClient basepay={basepay2026} />;
}
