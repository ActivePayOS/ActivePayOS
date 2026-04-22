import type { Toolkit } from "./types";

export const retirementTsp: Toolkit = {
  slug: "retirement-tsp",
  title: "TSP & Retirement",
  subtitle:
    "A practical guide to contributions, Roth vs Traditional, and how to turn raises into wealth.",
  sections: [
    {
      type: "checklist",
      title: "Two-Step TSP Setup",
      items: [
        "Step 1: Set your contribution amount in myPay so money actually comes out of your paycheck.",
        "Step 2: Log in to TSP and choose how those contributions are invested.",
        "Do not assume contribution setup and investment selection are the same thing — they are two separate steps.",
        "After both are set, confirm your contribution rate and your current fund allocation.",
      ],
    },
    {
      type: "checklist",
      title: "Simple Starter Strategy",
      items: [
        "Pick a contribution rate you can sustain, then raise it after you stabilize.",
        "Increase contributions after promotions or raises before lifestyle grows.",
        "Use the budget sheet to lock TSP in as a planned line item.",
        "Confirm beneficiaries as part of your setup.",
      ],
    },
    {
      type: "checklist",
      title: "Roth vs Traditional (Plain English)",
      items: [
        "Roth: pay taxes now, withdrawals later are generally tax-free.",
        "Traditional: lower taxes now, pay taxes later on withdrawals.",
        "If you’re unsure, choose one and stay consistent — your contribution rate matters more than finding a perfect answer.",
        "Use promotions as your trigger to increase contributions automatically.",
      ],
    },
    {
      type: "actions",
      title: "OfficerOS Actions",
      actions: [
        { label: "Budget Planner", href: "/toolkits/budget-planner", note: "Make TSP a line item" },
        { label: "Promotion Pay Planner", href: "/toolkits/promotion-planner", note: "Auto-allocate raises" },
      ],
    },
    {
      type: "actions",
      title: "Official Links",
      actions: [
        { label: "myPay", href: "https://mypay.dfas.mil/" },
        { label: "TSP (Official)", href: "https://www.tsp.gov/" },
        { label: "DoD Blended Retirement System", href: "https://militarypay.defense.gov/Benefits/Blended-Retirement-System/" },
      ],
    },
    {
      type: "text",
      title: "Coming Next",
      text: "Interactive projections: “If I increase TSP by 1% each promotion, where do I land?”",
    },
  ],
};