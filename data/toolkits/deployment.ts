import type { Toolkit } from "./types";

export const deployment: Toolkit = {
  slug: "deployment",
  title: "Deployment",
  subtitle:
    "Set your finances up before you go: autopay, savings plan, SCRA, and what to do with extra income.",
  sections: [
    {
      type: "checklist",
      title: "Pre-Deployment Money Setup",
      items: [
        "Turn on autopay for rent, utilities, credit cards, and loans.",
        "Freeze unnecessary subscriptions so you don’t bleed money while you’re gone.",
        "Set a deployment savings target (and automate it).",
        "Download your OfficerOS budget sheet and build a ‘deployment’ version of your baseline.",
      ],
    },
    {
      type: "checklist",
      title: "SCRA (Practical Use)",
      items: [
        "Check eligibility and request interest-rate reductions where it applies.",
        "Keep copies of orders and confirmations in one folder.",
        "Don’t assume it’s automatic—many lenders require a request.",
        "If something feels off, follow up in writing and keep the paper trail.",
      ],
    },
    {
      type: "actions",
      title: "OfficerOS Actions",
      actions: [
        { label: "Budget Planner", href: "/toolkits/budget-planner", note: "Make a ‘deployment mode’ budget export" },
        { label: "Pay Calculator", href: "/pay", note: "Know your baseline before any special pays" },
        { label: "TSP & Retirement", href: "/toolkits/retirement-tsp", note: "Use extra income intentionally" },
      ],
    },
    {
      type: "actions",
      title: "Official Links",
      actions: [
        { label: "SCRA Website (DoD)", href: "https://scra.dmdc.osd.mil/scra/" },
        { label: "Military OneSource", href: "https://www.militaryonesource.mil/" },
        { label: "DFAS (Pay & Allowances)", href: "https://www.dfas.mil/" },
      ],
    },
    {
      type: "text",
      title: "Coming Next",
      text: "A deployment-specific budget mode + an ‘extra income allocator’ (savings / debt / investing sliders).",
    },
  ],
};