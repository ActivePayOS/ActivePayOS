import type { Toolkit } from "./types";

export const justCommissioned: Toolkit = {
  slug: "just-commissioned",
  title: "Just Commissioned",
  subtitle: "First paycheck, TSP setup, and your first 90-day financial plan.",
  sections: [
    {
      type: "checklist",
      title: "First 72 Hours",
      items: [
        "Run the Pay Calculator so you know your true monthly take-home (base pay + BAH/BAS).",
        "Download the budget sheet and plug in rent/utilities + fixed bills first.",
        "Set up autopay for credit cards and any loans (never miss a payment on accident).",
        "Start a simple emergency fund goal: $1,000 → then 1 month of expenses.",
      ],
    },
    {
      type: "checklist",
      title: "TSP Setup (Do This Early)",
      items: [
        "Set a contribution rate you can actually sustain (then raise it after you settle in).",
        "Pick Roth vs Traditional intentionally (if unsure, Roth is a solid default early-career).",
        "Set/confirm beneficiaries (quick admin task people forget).",
        "Commit to an “increase rule”: +1% when you promote or get a raise.",
      ],
    },
    {
      type: "actions",
      title: "OfficerOS Actions",
      actions: [
        { label: "Pay Calculator", href: "/pay", note: "Get your numbers right first" },
        { label: "Budget Planner", href: "/toolkits/budget-planner", note: "Download the Excel export" },
        { label: "TSP & Retirement", href: "/toolkits/retirement-tsp", note: "Contribution strategy + basics" },
      ],
    },
    {
      type: "actions",
      title: "Official Links",
      actions: [
        { label: "TSP (Official)", href: "https://www.tsp.gov/" },
        { label: "milConnect (DEERS / Records)", href: "https://milconnect.dmdc.osd.mil/" },
        { label: "DFAS (Pay Info)", href: "https://www.dfas.mil/" },
      ],
    },
    {
      type: "text",
      title: "Coming Next",
      text: "A “first duty station” checklist + a simple ‘how much rent can I afford’ rule using your BAH.",
    },
  ],
};