import type { Toolkit } from "./types";

export const juniorEnlisted: Toolkit = {
  slug: "junior-enlisted",
  title: "Junior Enlisted",
  subtitle:
    "A simple money plan for your first duty station: housing, savings, debt, and “avoid these traps.”",
  sections: [
    {
      type: "checklist",
      title: "Start Here",
      items: [
        "Run Pay Calculator → download the budget sheet.",
        "If you’re in barracks: build emergency fund + crush high-interest debt first.",
        "If you’re off-post: keep rent + utilities under your BAH target.",
        "Automate savings on payday (even $50–$150/mo adds up fast early).",
      ],
    },
    {
      type: "bullets",
      title: "Avoid These Traps",
      items: [
        "Buying a car payment that eats your raise.",
        "Missing TSP match if you’re eligible (free money).",
        "“Lifestyle creep” after first steady checks.",
      ],
    },
    {
      type: "text",
      title: "Coming Next",
      text: "Interactive “Barracks vs apartment” decision tool + a starter savings builder.",
    },


    {
    type: "actions",
    title: "OfficerOS Actions",
    actions: [
        { label: "Pay Calculator", href: "/pay", note: "Download the budget sheet" },
        { label: "Budget Planner", href: "/toolkits/budget-planner", note: "Build your baseline plan" },
        { label: "TSP & Retirement", href: "/toolkits/retirement-tsp", note: "Simple contribution plan" },
    ],
    },
    {
    type: "actions",
    title: "Official Links",
    actions: [
        { label: "TSP (Official)", href: "https://www.tsp.gov/" },
        { label: "DFAS (Pay Info)", href: "https://www.dfas.mil/" },
    ],
    },
  ],
};