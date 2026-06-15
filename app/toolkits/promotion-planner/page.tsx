import { redirect } from "next/navigation";

// The Promotion Pay Planner has been merged into the Career Milestone Planner,
// which now shows the raise at each step plus an allocation guide.
export default function Page() {
  redirect("/toolkits/promotion-timeline");
}
