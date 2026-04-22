import type { Toolkit } from "./types";

export const studentLoans: Toolkit = {
  slug: "student-loans",
  title: "Student Loans",
  subtitle: "Understand your options: PSLF, repayment plans, and payoff vs invest.",
  sections: [
    {
      type: "checklist",
      title: "First Pass Checklist",
      items: [
        "List your loans (balance, rate, federal vs private).",
        "If eligible, learn PSLF basics from the official source (don’t guess).",
        "High-interest private loans often deserve priority payoff.",
        "Use the OfficerOS budget export to pick a monthly payment you can sustain.",
      ],
    },
    {
      type: "checklist",
      title: "Payoff vs Invest (Simple)",
      items: [
        "If the interest rate is very high: payoff usually wins.",
        "If the interest rate is low and you’re investing long-term: investing may win.",
        "Behavior matters: pick the option you’ll actually stick with.",
        "If you’re unsure: start with consistency (auto-pay + small investing) and refine later.",
      ],
    },
    {
      type: "actions",
      title: "OfficerOS Actions",
      actions: [
        { label: "Budget Planner", href: "/toolkits/budget-planner", note: "Lock a payment you can sustain" },
        { label: "TSP & Retirement", href: "/toolkits/retirement-tsp", note: "Don’t pause wealth-building blindly" },
      ],
    },
    {
      type: "actions",
      title: "Official Links",
      actions: [
        { label: "Federal Student Aid (Studentaid.gov)", href: "https://studentaid.gov/" },
        { label: "PSLF Info (Official)", href: "https://studentaid.gov/manage-loans/forgiveness-cancellation/public-service" },
      ],
    },
    {
      type: "text",
      title: "Coming Next",
      text: "A mini-calculator: compare “extra $X/month to loans” vs “invest $X/month” over time.",
    },
  ],
};