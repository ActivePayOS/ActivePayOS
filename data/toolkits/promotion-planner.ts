import type { Toolkit } from "./types";

export const promotionPlanner: Toolkit = {
  slug: "promotion-planner",
  title: "Promotion Pay Planner",
  subtitle: "Use promotions as a cheat code: plan the raise before it hits your account.",
  sections: [
    {
      type: "checklist",
      title: "The Rule",
      items: [
        "Decide where the raise goes before you feel richer.",
        "Default split: investing/savings + debt payoff + guilt-free upgrades.",
        "Update your budget the same week the promotion hits.",
      ],
    },
    {
      type: "checklist",
      title: "Suggested Split (Default)",
      items: [
        "50% to savings/investing (TSP/Roth IRA/emergency fund).",
        "30% to debt payoff (if any).",
        "20% to lifestyle upgrades (guilt-free).",
        "If you’re behind on savings: temporarily shift more to savings until you’re stable.",
      ],
    },
    {
      type: "actions",
      title: "OfficerOS Actions",
      actions: [
        { label: "Pay Calculator", href: "/pay", note: "Compare current vs promoted pay" },
        { label: "Budget Planner", href: "/toolkits/budget-planner", note: "Bake the split into your plan" },
        { label: "TSP & Retirement", href: "/toolkits/retirement-tsp", note: "Use the raise to increase TSP" },
      ],
    },
    {
      type: "actions",
      title: "Official Links",
      actions: [{ label: "TSP (Official)", href: "https://www.tsp.gov/" }],
    },
    {
      type: "text",
      title: "Coming Next",
      text: "A ‘current vs promoted’ compare view that uses Pay Calculator + BAH ZIP to show the delta.",
    },
  ],
};