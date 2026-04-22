import type { Toolkit } from "./types";

export const firstPcs: Toolkit = {
  slug: "first-pcs",
  title: "First PCS",
  subtitle:
    "Moving money made simple: the big entitlements, what to plan for, and how to avoid getting burned.",
  sections: [
    {
      type: "checklist",
      title: "PCS Money Basics",
      items: [
        "Know your big buckets: DLA, per diem/travel days, and moving option (HHG vs PPM).",
        "Plan cashflow: assume reimbursements are not instant (have a buffer).",
        "Track receipts + keep a single PCS folder (orders, travel docs, confirmations).",
        "Preview your new BAH by ZIP so you can set a housing target before you arrive.",
      ],
    },
    {
      type: "checklist",
      title: "Housing Decision Framework",
      items: [
        "Default target: rent + utilities ≤ your BAH (or under if possible).",
        "Don’t forget: deposits, parking, commute, furniture, internet setup fees.",
        "If buying: be honest about your time-on-station; short stays usually don’t pencil.",
        "Sanity check your budget with the OfficerOS export before signing anything.",
      ],
    },
    {
      type: "actions",
      title: "OfficerOS Actions",
      actions: [
        { label: "Pay Calculator", href: "/pay", note: "Preview BAH at the new ZIP" },
        { label: "Budget Planner", href: "/toolkits/budget-planner", note: "Build the new baseline budget" },
        { label: "Promotion Pay Planner", href: "/toolkits/promotion-planner", note: "If you’re promoting during the move" },
      ],
    },
    {
      type: "actions",
      title: "Official Links",
      actions: [
        { label: "Joint Travel Regulations (JTR)", href: "https://www.travel.dod.mil/Policy-Regulations/Joint-Travel-Regulations/" },
        { label: "Defense Travel (DTS / Travel)", href: "https://www.travel.dod.mil/" },
        { label: "DFAS (Travel Pay)", href: "https://www.dfas.mil/" },
        { label: "Move.mil (PCS Moving Resources)", href: "https://www.militaryonesource.mil/moving-housing/moving/" },
      ],
    },
    {
      type: "text",
      title: "Coming Next",
      text: "A PCS checklist + a simple PPM estimator + a ‘BAH vs rent’ comparison tool.",
    },
  ],
};