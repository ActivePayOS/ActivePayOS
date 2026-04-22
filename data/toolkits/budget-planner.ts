import type { Toolkit } from "./types";

export const budgetPlanner: Toolkit = {
  slug: "budget-planner",
  title: "Budget Planner",
  subtitle:
    "Build a clean monthly plan using your Base Pay, BAH, and BAS. Export your sheet in one click.",
  sections: [
    {
      type: "checklist",
      title: "How to Use It",
      items: [
        "Go to Pay Calculator and enter your details.",
        "Click “Download Budget Sheet (.xlsx)”.",
        "Only edit the blue cells—everything else updates automatically.",
        "Use the “Start Here” targets to set housing/food/savings baselines.",
      ],
    },
    {
      type: "checklist",
      title: "Rules That Keep You Safe",
      items: [
        "Housing (rent + utilities) should generally fit inside your BAH target.",
        "Make savings automatic (small is fine—consistency wins).",
        "If you have high-interest debt, prioritize it before upgrades.",
        "Re-run the Pay Calculator whenever rank/YOS/ZIP changes.",
      ],
    },
    {
      type: "actions",
      title: "OfficerOS Actions",
      actions: [
        { label: "Pay Calculator", href: "/pay", note: "Download the Excel export from here" },
        { label: "Toolkits Home", href: "/toolkits", note: "Pick a life-stage plan" },
      ],
    },
    {
      type: "actions",
      title: "Official Links",
      actions: [{ label: "DFAS (Pay Info)", href: "https://www.dfas.mil/" }],
    },
    {
      type: "text",
      title: "Coming Next",
      text: "A dashboard view inside OfficerOS (so you can budget without Excel) + paycheck split planning.",
    },
  ],
};