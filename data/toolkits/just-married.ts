import type { Toolkit } from "./types";

export const justMarried: Toolkit = {
  slug: "just-married",
  title: "Just Married",
  subtitle:
    "What changes immediately: BAH, healthcare, budgeting together, and the biggest admin steps.",
  sections: [
    {
      type: "checklist",
      title: "First Week Checklist",
      items: [
        "Update DEERS + personnel records (this drives benefits).",
        "Verify BAH “with dependents” status in your pay system.",
        "Pick your healthcare setup (Tricare options depending on branch/status).",
        "Update beneficiaries: SGLI + TSP (people forget this).",
        "Create a shared “household baseline” budget (rent, groceries, car, insurance).",
      ],
    },
    {
      type: "checklist",
      title: "Money Setup That Prevents Fights",
      items: [
        "One shared bills account + two personal “fun money” buckets (even small).",
        "Agree on savings goals (emergency fund, travel, down payment).",
        "Set a ‘talk first’ threshold for purchases (ex: $200+).",
        "Use the OfficerOS budget export as the source of truth.",
      ],
    },
    {
      type: "actions",
      title: "OfficerOS Actions",
      actions: [
        { label: "Pay Calculator", href: "/pay", note: "Re-run with dependents" },
        { label: "Budget Planner", href: "/toolkits/budget-planner" },
        { label: "TSP & Retirement", href: "/toolkits/retirement-tsp" },
      ],
    },
    {
      type: "text",
      title: "Coming Next",
      text: "Dual-military scenarios, filing status tradeoffs, and a “combined pay” mode.",
    },


    {
    type: "actions",
    title: "Official Links",
    actions: [
        { label: "milConnect (DEERS / Beneficiaries)", href: "https://milconnect.dmdc.osd.mil/" },
        { label: "TRICARE (Official)", href: "https://www.tricare.mil/" },
        { label: "TSP (Official)", href: "https://www.tsp.gov/" },
    ],
    },
  ],
  
};